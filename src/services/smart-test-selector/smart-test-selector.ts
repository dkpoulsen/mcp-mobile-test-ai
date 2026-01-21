/**
 * Smart Test Selector
 * Main service for intelligently selecting tests based on code changes
 */

import { createModuleLogger } from '../../utils/logger.js';
import { ChangeAnalyzer } from './change-analyzer.js';
import { CoverageMapper } from './coverage-mapper.js';
import type {
  ChangedFile,
  ChangeImpact,
  SelectedTest,
  TestSelectionResult,
  TestSelectorConfig,
  TestToSourceMapping,
} from './types.js';
import { SelectionStrategy, DEFAULT_SELECTOR_CONFIG } from './types.js';

const logger = createModuleLogger('smart-test-selector');

// Re-export the default config for external use
export { DEFAULT_SELECTOR_CONFIG };

/**
 * Smart Test Selector class
 * Analyzes changes and selects relevant tests
 */
export class SmartTestSelector {
  private changeAnalyzer: ChangeAnalyzer;
  private coverageMapper: CoverageMapper;
  private allTests: string[] = [];

  constructor(
    private projectRoot: string = process.cwd(),
    private config: Partial<TestSelectorConfig> = {}
  ) {
    const fullConfig = { ...DEFAULT_SELECTOR_CONFIG, ...config };
    this.config = fullConfig;

    this.changeAnalyzer = new ChangeAnalyzer(
      projectRoot,
      fullConfig.excludePatterns
    );
    this.coverageMapper = new CoverageMapper(projectRoot);
  }

  /**
   * Select tests based on changed files
   */
  async selectTests(changedFiles: ChangedFile[]): Promise<TestSelectionResult> {
    logger.info(
      { fileCount: changedFiles.length, strategy: this.config.strategy },
      'Starting test selection'
    );

    // Scan for all test files
    await this.scanTestFiles();

    // Analyze changes
    const impacts = await this.changeAnalyzer.analyzeChanges(changedFiles);

    // Build coverage mappings
    const dependencyGraph = this.changeAnalyzer['dependencyCache'];
    await this.coverageMapper.buildMappings(dependencyGraph);

    // Select tests based on strategy
    const selectedTests = await this.applySelectionStrategy(impacts);

    // Calculate skipped tests
    const skippedTests = this.allTests.filter(
      (test) => !selectedTests.some((st) => st.testPath === test)
    );

    // Calculate results
    const result = this.buildResult(
      selectedTests,
      skippedTests,
      impacts,
      changedFiles
    );

    logger.info(
      {
        selected: result.selectedCount,
        skipped: result.skippedCount,
        savings: result.estimatedTimeSavings,
      },
      'Test selection complete'
    );

    return result;
  }

  /**
   * Scan project for all test files
   */
  private async scanTestFiles(): Promise<void> {
    const { readdir } = await import('fs/promises');
    const { join } = await import('path');
    const { existsSync } = await import('fs');

    const testsDir = join(this.projectRoot, 'tests');
    if (!existsSync(testsDir)) {
      logger.warn('Tests directory not found');
      return;
    }

    const scanDir = async (dir: string): Promise<string[]> => {
      const files: string[] = [];

      try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          const relativePath = fullPath.replace(this.projectRoot + '/', '');

          if (entry.isDirectory()) {
            const subFiles = await scanDir(fullPath);
            files.push(...subFiles);
          } else if (
            entry.name.endsWith('.test.ts') ||
            entry.name.endsWith('.test.js') ||
            entry.name.endsWith('.spec.ts') ||
            entry.name.endsWith('.spec.js')
          ) {
            files.push(relativePath);
          }
        }
      } catch (error) {
        logger.debug({ dir, error }, 'Failed to scan directory');
      }

      return files;
    };

    this.allTests = await scanDir(testsDir);

    logger.debug({ testCount: this.allTests.length }, 'Found test files');
  }

  /**
   * Apply selection strategy to determine which tests to run
   */
  private async applySelectionStrategy(
    impacts: ChangeImpact[]
  ): Promise<SelectedTest[]> {
    const selectedTests = new Map<string, SelectedTest>();
    const strategy = this.config.strategy!;

    // Check if we should run all tests
    if (this.shouldRunAllTests(impacts)) {
      return this.selectAllTests('Exceeds full test threshold');
    }

    // Collect affected source files
    const affectedSourceFiles = new Set<string>();
    const affectedModules = new Set<string>();

    for (const impact of impacts) {
      affectedSourceFiles.add(impact.file.path);
      for (const importer of impact.importedBy) {
        affectedSourceFiles.add(importer);
      }
      for (const module of impact.affectedModules) {
        affectedModules.add(module);
      }
    }

    // Find tests that cover affected files
    for (const sourceFile of affectedSourceFiles) {
      const tests = this.coverageMapper.getTestsForSource(sourceFile);

      // Find the impact for this source file
      const impact = impacts.find((i) => i.file.path === sourceFile) || impacts[0];
      if (!impact) continue;

      for (const test of tests) {
        const priority = this.calculatePriority(test, impact, impacts);
        const existing = selectedTests.get(test.testPath);

        if (!existing || priority > existing.priority) {
          selectedTests.set(test.testPath, {
            testPath: test.testPath,
            reason: this.generateSelectionReason(test, sourceFile, impact),
            priority,
            estimatedDuration: test.avgDuration,
            isFlaky: test.isFlaky,
            relatedSourceFiles: test.sourceFiles,
            triggeredBy: [sourceFile],
          });
        } else if (existing) {
          // Add to triggered by if not already present
          if (!existing.triggeredBy.includes(sourceFile)) {
            existing.triggeredBy.push(sourceFile);
          }
        }
      }
    }

    // Apply strategy-specific additions
    switch (strategy) {
      case SelectionStrategy.AFFECTED_PLUS_HIGH_RISK:
        this.addHighRiskTests(selectedTests, impacts);
        break;
      case SelectionStrategy.AFFECTED_PLUS_FLAKY:
        this.addFlakyTests(selectedTests);
        break;
      case SelectionStrategy.BALANCED:
        this.addHighRiskTests(selectedTests, impacts);
        this.addFlakyTests(selectedTests);
        break;
    }

    // Filter by minimum priority
    let filteredTests = Array.from(selectedTests.values()).filter(
      (t) => t.priority >= this.config.minPriority!
    );

    // Apply max tests limit
    if (this.config.maxTests && this.config.maxTests > 0) {
      filteredTests = filteredTests
        .sort((a, b) => b.priority - a.priority)
        .slice(0, this.config.maxTests);
    }

    return filteredTests;
  }

  /**
   * Calculate priority score for a test
   */
  private calculatePriority(
    test: TestToSourceMapping,
    impact: ChangeImpact,
    _allImpacts: ChangeImpact[]
  ): number {
    let priority = 0.5; // Base priority

    // Impact level contribution
    const impactScores = {
      low: 0.1,
      medium: 0.3,
      high: 0.5,
      critical: 0.8,
    };
    priority += impactScores[impact.impactLevel];

    // Flaky test boost
    if (test.isFlaky && this.config.includeFlaky) {
      priority *= this.config.flakyPriorityMultiplier!;
    }

    // Coverage confidence
    priority *= test.coverageConfidence;

    // High-risk file boost
    if (this.isHighRiskFile(impact.file.path)) {
      priority += 0.2;
    }

    // Recent failure history
    const history = this.coverageMapper.getFailureHistory(test.testPath);
    if (history && this.config.useHistoryData) {
      if (history.recentFailures > 0) {
        priority += Math.min(history.recentFailures * 0.1, 0.3);
      }
      if (history.failureRate > 0.3) {
        priority += 0.2;
      }
    }

    return Math.min(priority, 1.0);
  }

  /**
   * Generate human-readable selection reason
   */
  private generateSelectionReason(
    test: TestToSourceMapping,
    sourceFile: string,
    impact: ChangeImpact
  ): string {
    const reasons: string[] = [];

    if (impact.impactLevel === 'critical') {
      reasons.push('Critical change');
    } else if (impact.impactLevel === 'high') {
      reasons.push('High-impact change');
    }

    reasons.push(`Covers changed file: ${sourceFile}`);

    if (test.isFlaky) {
      reasons.push('Flaky test (historically unstable)');
    }

    const history = this.coverageMapper.getFailureHistory(test.testPath);
    if (history && history.recentFailures > 0) {
      reasons.push(`${history.recentFailures} recent failures`);
    }

    return reasons.join('; ');
  }

  /**
   * Check if we should run all tests
   */
  private shouldRunAllTests(impacts: ChangeImpact[]): boolean {
    // Check file count threshold
    if (impacts.length >= this.config.fullTestThreshold!) {
      return true;
    }

    // Check for critical changes
    const hasCritical = impacts.some(
      (i) => i.impactLevel === 'critical'
    );
    if (hasCritical && this.config.strategy !== SelectionStrategy.AFFECTED_ONLY) {
      return true;
    }

    return false;
  }

  /**
   * Select all tests with a reason
   */
  private selectAllTests(reason: string): SelectedTest[] {
    return this.allTests.map((testPath) => {
      const mapping = this.coverageMapper.getMapping(testPath);
      return {
        testPath,
        reason,
        priority: 1.0,
        estimatedDuration: mapping?.avgDuration,
        isFlaky: mapping?.isFlaky || false,
        relatedSourceFiles: mapping?.sourceFiles || [],
        triggeredBy: ['all'],
      };
    });
  }

  /**
   * Add high-risk tests to selection
   */
  private addHighRiskTests(
    selectedTests: Map<string, SelectedTest>,
    _impacts: ChangeImpact[]
  ): void {
    // Tests that are likely to catch regressions
    const highRiskPaths = [
      'tests/unit/',
      'tests/api/',
    ];

    for (const testPath of this.allTests) {
      if (selectedTests.has(testPath)) continue;

      const isHighRisk = highRiskPaths.some((path) => testPath.includes(path));
      if (isHighRisk) {
        const mapping = this.coverageMapper.getMapping(testPath);
        selectedTests.set(testPath, {
          testPath,
          reason: 'High-risk test category',
          priority: 0.4,
          estimatedDuration: mapping?.avgDuration,
          isFlaky: mapping?.isFlaky || false,
          relatedSourceFiles: mapping?.sourceFiles || [],
          triggeredBy: ['high-risk-category'],
        });
      }
    }
  }

  /**
   * Add flaky tests to selection
   */
  private addFlakyTests(selectedTests: Map<string, SelectedTest>): void {
    if (!this.config.includeFlaky) return;

    for (const testPath of this.allTests) {
      if (selectedTests.has(testPath)) continue;

      const mapping = this.coverageMapper.getMapping(testPath);
      if (mapping?.isFlaky) {
        selectedTests.set(testPath, {
          testPath,
          reason: 'Flaky test (needs verification)',
          priority: 0.35,
          estimatedDuration: mapping.avgDuration,
          isFlaky: true,
          relatedSourceFiles: mapping.sourceFiles,
          triggeredBy: ['flaky'],
        });
      }
    }
  }

  /**
   * Check if file is high-risk
   */
  private isHighRiskFile(filePath: string): boolean {
    const highRiskPatterns = [
      '/core/',
      '/types/',
      '/database/',
      'config.',
      'index.ts',
    ];

    return highRiskPatterns.some((pattern) => filePath.includes(pattern));
  }

  /**
   * Build final selection result
   */
  private buildResult(
    selectedTests: SelectedTest[],
    skippedTests: string[],
    impacts: ChangeImpact[],
    changedFiles: ChangedFile[]
  ): TestSelectionResult {
    // Calculate estimated time savings
    const selectedDuration = selectedTests.reduce(
      (sum, t) => sum + (t.estimatedDuration || 5000),
      0
    );
    const totalDuration = this.allTests.reduce(
      (sum, testPath) =>
        sum + (this.coverageMapper.getMapping(testPath)?.avgDuration || 5000),
      0
    );

    const estimatedTimeSavings = Math.max(0, totalDuration - selectedDuration);

    // Calculate confidence
    const confidence = this.calculateConfidence(selectedTests, impacts);

    return {
      selectedTests: selectedTests.sort((a, b) => b.priority - a.priority),
      skippedTests,
      selectedCount: selectedTests.length,
      skippedCount: skippedTests.length,
      estimatedTimeSavings,
      confidence,
      metadata: {
        timestamp: new Date(),
        changedFilesCount: changedFiles.length,
        totalTests: this.allTests.length,
        strategy: this.config.strategy!,
        config: this.config as TestSelectorConfig,
      },
    };
  }

  /**
   * Calculate confidence in selection
   */
  private calculateConfidence(
    selectedTests: SelectedTest[],
    impacts: ChangeImpact[]
  ): number {
    let confidence = 0.5;

    // Higher confidence if we have mappings
    const withMappings = selectedTests.filter(
      (t) => t.relatedSourceFiles.length > 0
    );
    if (selectedTests.length > 0) {
      confidence += (withMappings.length / selectedTests.length) * 0.3;
    }

    // Higher confidence for well-understood impacts
    const analyzedImpacts = impacts.filter(
      (i) => i.importedBy.length > 0 || i.imports.length > 0
    );
    if (impacts.length > 0) {
      confidence += (analyzedImpacts.length / impacts.length) * 0.2;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TestSelectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): TestSelectorConfig {
    return this.config as TestSelectorConfig;
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.changeAnalyzer.clearCache();
    this.coverageMapper.clearCache();
    this.allTests = [];
  }
}

/**
 * Global test selector instance
 */
let globalSelector: SmartTestSelector | null = null;

/**
 * Get the global smart test selector instance
 */
export function getGlobalSmartTestSelector(
  projectRoot?: string,
  config?: Partial<TestSelectorConfig>
): SmartTestSelector {
  if (!globalSelector) {
    globalSelector = new SmartTestSelector(projectRoot, config);
  }
  return globalSelector;
}

/**
 * Reset the global selector
 */
export function resetGlobalSmartTestSelector(): void {
  if (globalSelector) {
    globalSelector.clearCache();
  }
  globalSelector = null;
}
