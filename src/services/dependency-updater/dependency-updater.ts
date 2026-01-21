/**
 * Dependency Updater
 *
 * Main orchestrator for automatic dependency updates including:
 * - Detecting outdated dependencies (Appium, WebDriver, browser drivers)
 * - Creating pull requests with updates
 * - Running full test suites
 * - Merging if all tests pass
 * - Rollback mechanisms for failed updates
 */

import { join } from 'node:path';
import type {
  DependencyUpdaterConfig,
  UpdateResult,
  PackageDependency,
  DependencyCheckSummary,
  TestResults,
} from './types.js';
import {
  DependencyCategory,
  UpdateSeverity,
  UpdateStatus,
} from './types.js';
import { findOutdatedDependencies, readPackageJson, getAllDependencies } from './registry-client.js';
import { getEnabledCategories } from './category-matcher.js';
import {
  parseRepository,
  generateBranchName,
  generatePRTitle,
  generatePRBody,
  createBranch,
  createPullRequest,
  updateFile,
  addComment,
  listPullRequests,
} from './github-client.js';
import { runTestsWithArtifacts } from './test-runner.js';
import {
  makeAutoMergeDecisionFromCI,
  executeAutoMerge,
  generateAutoMergeExplanation,
} from './auto-merge.js';
import {
  prepareRollback,
  executeRollbackIfFailed,
  shouldRollback,
} from './rollback.js';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger('dependency-updater');

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<DependencyUpdaterConfig> = {
  categories: [
    DependencyCategory.APPIUM,
    DependencyCategory.WEBDRIVER,
    DependencyCategory.BROWSER_DRIVER,
    DependencyCategory.PLAYWRIGHT,
  ],
  autoMerge: true,
  enableRollback: true,
  includeMajor: false,
  includeMinor: true,
  includePatch: true,
  labels: ['dependencies', 'dependency-update'],
  branchPrefix: 'dep-update',
  dryRun: false,
  minUpdateInterval: 6, // 6 hours
};

/**
 * Dependency Updater class
 */
export class DependencyUpdater {
  private config: DependencyUpdaterConfig;

  constructor(config: DependencyUpdaterConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config } as DependencyUpdaterConfig;

    // Parse repository from owner/name format
    if (!this.config.repoOwner || !this.config.repoName) {
      const repoInfo = parseRepository(`${this.config.repoOwner}/${this.config.repoName}`);
      this.config.repoOwner = repoInfo.owner;
      this.config.repoName = repoInfo.name;
    }
  }

  /**
   * Run the full dependency update workflow
   */
  async run(): Promise<DependencyCheckSummary> {
    logger.info('Starting dependency update workflow');

    const summary: DependencyCheckSummary = {
      timestamp: new Date(),
      totalChecked: 0,
      outdatedFound: 0,
      updatesAvailable: 0,
      vulnerabilitiesFound: 0,
      packages: [],
    };

    try {
      // Step 1: Find outdated dependencies
      logger.info('Checking for outdated dependencies');
      const outdatedPackages = await this.findOutdatedPackages();

      summary.totalChecked = outdatedPackages.totalChecked;
      summary.outdatedFound = outdatedPackages.packages.length;
      summary.packages = outdatedPackages.packages;

      // Count vulnerabilities
      for (const pkg of outdatedPackages.packages) {
        if (pkg.vulnerabilities && pkg.vulnerabilities.length > 0) {
          summary.vulnerabilitiesFound += pkg.vulnerabilities.length;
        }
      }

      if (outdatedPackages.packages.length === 0) {
        logger.info('No outdated dependencies found');
        return summary;
      }

      logger.info(`Found ${outdatedPackages.packages.length} outdated package(s)`);

      // Step 2: Create update PRs (respecting maxUpdates limit)
      const maxUpdates = this.config.maxUpdates ?? outdatedPackages.packages.length;
      const packagesToUpdate = outdatedPackages.packages.slice(0, maxUpdates);
      summary.updatesAvailable = packagesToUpdate.length;

      const updateResults: UpdateResult[] = [];

      for (const pkg of packagesToUpdate) {
        const result = await this.processSingleUpdate(pkg);
        updateResults.push(result);
      }

      // Step 3: Monitor and process results
      for (const result of updateResults) {
        await this.processUpdateResult(result);
      }

      logger.info('Dependency update workflow completed');
      return summary;

    } catch (error) {
      logger.error(`Dependency update workflow failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Find all outdated packages based on configuration
   */
  private async findOutdatedPackages(): Promise<{
    totalChecked: number;
    packages: PackageDependency[];
  }> {
    const workDir = this.config.workDir || process.cwd();
    const packageJsonPath = join(workDir, this.config.packageJsonPath);

    const packageJson = await readPackageJson(packageJsonPath);
    const allDeps = getAllDependencies(packageJson);

    const enabledCategories = getEnabledCategories(this.config.categories);

    const packages: PackageDependency[] = [];
    let checked = 0;

    for (const [name, { type }] of allDeps.entries()) {
      checked++;

      // Skip based on type if configured
      if (type === 'peerDependencies' || type === 'optionalDependencies') {
        continue;
      }

      // Check category filter
      const categoryEnabled = enabledCategories.includes(DependencyCategory.ALL) ||
        enabledCategories.some((cat) => cat === 'deps' || cat === 'devDeps');

      if (!categoryEnabled) {
        continue;
      }

      // Check the package
      try {
        const result = await findOutdatedDependencies(packageJsonPath, {
          categories: this.config.categories,
          includeDev: true,
          includeMajor: this.config.includeMajor,
          includeMinor: this.config.includeMinor,
          includePatch: this.config.includePatch,
        });

        for (const pkg of result) {
          if (pkg.name === name) {
            packages.push(pkg);
          }
        }
      } catch {
        // Skip packages that can't be checked
        continue;
      }
    }

    // Sort by severity (patches first, then minors, then majors) and vulnerabilities
    packages.sort((a, b) => {
      const severityOrder = { patch: 0, minor: 1, major: 2 };
      const aSeverity = severityOrder[a.severity as keyof typeof severityOrder] ?? 3;
      const bSeverity = severityOrder[b.severity as keyof typeof severityOrder] ?? 3;

      // Prioritize security fixes
      const aHasVuln = (a.vulnerabilities?.length ?? 0) > 0;
      const bHasVuln = (b.vulnerabilities?.length ?? 0) > 0;

      if (aHasVuln && !bHasVuln) return -1;
      if (!aHasVuln && bHasVuln) return 1;

      return aSeverity - bSeverity;
    });

    return { totalChecked: checked, packages };
  }

  /**
   * Process a single dependency update
   */
  private async processSingleUpdate(pkg: PackageDependency): Promise<UpdateResult> {
    const result: UpdateResult = {
      packageName: pkg.name,
      oldVersion: pkg.currentVersion,
      newVersion: pkg.latestVersion,
      status: UpdateStatus.PENDING,
    };

    try {
      if (this.config.dryRun) {
        logger.info(`[DRY RUN] Would update ${pkg.name} from ${pkg.currentVersion} to ${pkg.latestVersion}`);
        result.status = UpdateStatus.AVAILABLE;
        return result;
      }

      // Check if PR already exists
      const existingPr = await this.findExistingPR(pkg);
      if (existingPr) {
        logger.info(`PR already exists for ${pkg.name}: #${existingPr.number}`);
        result.prNumber = existingPr.number;
        result.prUrl = existingPr.html_url;
        result.status = UpdateStatus.PR_CREATED;
        return result;
      }

      // Prepare rollback state
      if (this.config.enableRollback) {
        await prepareRollback(0, [pkg], this.config);
      }

      // Create branch
      const branchName = generateBranchName(pkg.name, pkg.latestVersion, this.config.branchPrefix);
      await createBranch(branchName, this.config.defaultBranch, this.config);
      logger.info(`Created branch: ${branchName}`);

      // Update package.json
      const workDir = this.config.workDir || process.cwd();
      const packageJsonPath = join(workDir, this.config.packageJsonPath);
      const packageJson = await readPackageJson(packageJsonPath);

      // Update the version in the appropriate dependency section
      const depsSection = pkg.type === 'devDependencies'
        ? 'devDependencies'
        : 'dependencies';

      if (packageJson[depsSection]) {
        packageJson[depsSection][pkg.name] = `^${pkg.latestVersion}`;
      }

      await updateFile(
        this.config.packageJsonPath,
        JSON.stringify(packageJson, null, 2) + '\n',
        branchName,
        `Update ${pkg.name} to v${pkg.latestVersion}`,
        this.config
      );

      // Create PR
      const pr = await createPullRequest(
        {
          title: generatePRTitle(pkg.name, pkg.latestVersion, pkg.severity),
          body: generatePRBody([pkg], this.config.enableRollback),
          branch: branchName,
          base: this.config.defaultBranch,
          labels: this.config.labels,
          reviewers: this.config.reviewers,
          draft: pkg.severity === UpdateSeverity.MAJOR, // Draft PRs for major updates
        },
        this.config
      );

      result.prNumber = pr.number;
      result.prUrl = pr.html_url;
      result.status = UpdateStatus.PR_CREATED;

      logger.info(`Created PR #${pr.number} for ${pkg.name}`);

      // Add initial comment with update details
      await addComment(
        pr.number,
        this.generateUpdateComment(pkg, result),
        this.config
      );

      // Run tests if configured
      if (this.config.testCommand) {
        result.status = UpdateStatus.TESTING;
        const testResults = await this.runTestsForPR(pr.number);
        result.testResults = testResults;

        if (testResults.passed) {
          result.status = UpdateStatus.TESTS_PASSED;

          // Auto-merge if enabled and tests pass
          if (this.config.autoMerge) {
            await this.autoMergeIfApplicable(pr.number, [pkg], testResults);
          }
        } else {
          result.status = UpdateStatus.TESTS_FAILED;

          // Create rollback if enabled
          if (this.config.enableRollback && shouldRollback(testResults)) {
            const rollbackPr = await executeRollbackIfFailed(result, this.config);
            if (rollbackPr) {
              result.rollbackPrNumber = rollbackPr;
            }
          }
        }
      }

      return result;

    } catch (error) {
      result.status = UpdateStatus.FAILED;
      result.error = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to process update for ${pkg.name}: ${result.error}`);
      return result;
    }
  }

  /**
   * Find existing PR for a package update
   */
  private async findExistingPR(pkg: PackageDependency): Promise<{ number: number; html_url: string } | null> {
    try {
      const branchName = generateBranchName(pkg.name, pkg.latestVersion, this.config.branchPrefix);
      const prs = await listPullRequests({ state: 'open' }, this.config);

      // Try to find PR by head branch
      for (const pr of prs) {
        if (pr.head.ref === branchName) {
          return { number: pr.number, html_url: pr.html_url };
        }
      }
    } catch {
      // Ignore errors
    }
    return null;
  }

  /**
   * Run tests for a PR
   */
  private async runTestsForPR(prNumber: number): Promise<TestResults> {
    logger.info(`Running tests for PR #${prNumber}`);

    const workDir = this.config.workDir || process.cwd();
    const testCommand = this.config.testCommand || 'npm test';

    // Parse test command
    const command = testCommand.split(' ');

    try {
      return await runTestsWithArtifacts(command, {
        cwd: workDir,
        env: {
          NODE_ENV: 'test',
          CI: 'true',
        },
      });
    } catch (error) {
      logger.error(`Test execution failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        passed: false,
        totalTests: 0,
        failedTests: 1,
        skippedTests: 0,
        duration: 0,
        output: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Auto-merge if applicable
   */
  private async autoMergeIfApplicable(
    prNumber: number,
    dependencies: PackageDependency[],
    testResults: TestResults
  ): Promise<void> {
    const decision = await makeAutoMergeDecisionFromCI(
      prNumber,
      dependencies,
      this.config
    );

    await addComment(
      prNumber,
      generateAutoMergeExplanation(decision, dependencies, testResults),
      this.config
    );

    if (decision.shouldMerge) {
      logger.info(`Auto-merging PR #${prNumber}`);
      await executeAutoMerge(prNumber, dependencies, testResults, this.config);
    }
  }

  /**
   * Process update results after completion
   */
  private async processUpdateResult(result: UpdateResult): Promise<void> {
    if (result.status === UpdateStatus.MERGED && this.config.enableRollback) {
      // Create immediate rollback PR if configured
      // (This would be done post-merge in production)
    }
  }

  /**
   * Generate update comment for PR
   */
  private generateUpdateComment(pkg: PackageDependency, result: UpdateResult): string {
    const lines = [
      '## Dependency Update Details',
      '',
      `**Package:** ${pkg.name}`,
      `**Current Version:** ${pkg.currentVersion}`,
      `**New Version:** ${pkg.latestVersion}`,
      `**Severity:** ${pkg.severity}`,
      `**Category:** ${pkg.category}`,
      '',
    ];

    if (pkg.vulnerabilities && pkg.vulnerabilities.length > 0) {
      lines.push('### Security Vulnerabilities Fixed');
      lines.push('');
      for (const vuln of pkg.vulnerabilities) {
        lines.push(`- **${vuln.id}** (${vuln.severity}): ${vuln.title}`);
        if (vuln.url) {
          lines.push(`  - ${vuln.url}`);
        }
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
    lines.push('*This update will be automatically tested and merged if all tests pass.*');

    return lines.join('\n');
  }

  /**
   * Get current configuration
   */
  getConfig(): DependencyUpdaterConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<DependencyUpdaterConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

/**
 * Create a new DependencyUpdater instance with default config
 */
export function createDependencyUpdater(
  config: DependencyUpdaterConfig
): DependencyUpdater {
  return new DependencyUpdater(config);
}

/**
 * Quick check for outdated dependencies (no PR creation)
 */
export async function checkOutdatedDependencies(
  packageJsonPath: string,
  options: {
    categories?: DependencyCategory[];
    includeMajor?: boolean;
    includeMinor?: boolean;
    includePatch?: boolean;
  } = {}
): Promise<PackageDependency[]> {
  const result = await findOutdatedDependencies(packageJsonPath, options);
  return result;
}

/**
 * Update a single package (one-shot)
 */
export async function updateSinglePackage(
  packageName: string,
  config: DependencyUpdaterConfig
): Promise<UpdateResult> {
  const updater = new DependencyUpdater(config);

  // Find the specific package
  const packages = await findOutdatedDependencies(config.packageJsonPath, {
    categories: config.categories,
  });

  const pkg = packages.find((p) => p.name === packageName);
  if (!pkg) {
    return {
      packageName,
      oldVersion: '',
      newVersion: '',
      status: UpdateStatus.FAILED,
      error: `Package ${packageName} not found or already up to date`,
    };
  }

  return updater['processSingleUpdate'](pkg);
}
