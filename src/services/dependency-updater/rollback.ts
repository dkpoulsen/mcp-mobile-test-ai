/**
 * Rollback Mechanisms
 *
 * Provides rollback capabilities for failed dependency updates,
 * including automatic rollback PR creation and state tracking.
 */

import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import type {
  DependencyUpdaterConfig,
  PackageDependency,
  UpdateResult,
  RollbackConfig,
} from './types.js';
import {
  RollbackError,
  PackageDependencyType,
  UpdateSeverity,
  DependencyCategory,
} from './types.js';
import {
  generateBranchName,
  generatePRBody,
  createBranch,
  updateFile,
  createPullRequest,
  addComment,
} from './github-client.js';

/**
 * Rollback state information
 */
interface RollbackState {
  /** Original PR number */
  originalPrNumber: number;
  /** Rollback PR number */
  rollbackPrNumber?: number;
  /** Branch name for rollback */
  rollbackBranch: string;
  /** Dependencies that were updated */
  dependencies: Array<{
    name: string;
    previousVersion: string;
    updatedVersion: string;
  }>;
  /** Timestamp when rollback was created */
  createdAt: string;
  /** Whether rollback was applied */
  applied: boolean;
  /** Timestamp when rollback was applied */
  appliedAt?: string;
}

/**
 * State file path for storing rollback information
 */
function getRollbackStateFilePath(workDir: string): string {
  return join(workDir, '.dependency-update-rollback.json');
}

/**
 * Save rollback state to disk
 */
async function saveRollbackState(state: RollbackState, workDir: string): Promise<void> {
  const statePath = getRollbackStateFilePath(workDir);
  await writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Load rollback state from disk
 */
export async function loadRollbackState(workDir: string): Promise<RollbackState | null> {
  try {
    const statePath = getRollbackStateFilePath(workDir);
    const content = await readFile(statePath, 'utf-8');
    return JSON.parse(content) as RollbackState;
  } catch {
    return null;
  }
}

/**
 * Delete rollback state file
 */
async function deleteRollbackState(workDir: string): Promise<void> {
  const statePath = getRollbackStateFilePath(workDir);
  try {
    await writeFile(statePath, '', 'utf-8');
  } catch {
    // Ignore errors
  }
}

/**
 * Create a rollback PR
 */
export async function createRollbackPR(
  originalPrNumber: number,
  dependencies: PackageDependency[],
  config: DependencyUpdaterConfig,
  previousPackageJson: string
): Promise<number | null> {
  if (dependencies.length === 0) {
    throw new RollbackError('No dependencies provided for rollback');
  }

  const firstDep = dependencies[0];
  const rollbackBranch = generateBranchName(
    `rollback-${firstDep.name}`,
    firstDep.currentVersion,
    'rollback'
  );

  try {
    // Create the rollback branch
    await createBranch(rollbackBranch, config.defaultBranch, config);

    // Update package.json with previous versions
    await updateFile(
      config.packageJsonPath,
      previousPackageJson,
      rollbackBranch,
      `Rollback ${dependencies.map((d) => d.name).join(', ')} to previous versions`,
      config
    );

    // Generate PR title and body
    const title = `🔄 Rollback ${dependencies.map((d) => d.name).join(', ')}`;
    const body = generateRollbackPRBody(originalPrNumber, dependencies);

    // Create the PR
    const pr = await createPullRequest(
      {
        title,
        body,
        branch: rollbackBranch,
        base: config.defaultBranch,
        labels: ['rollback', 'dependencies'],
        draft: false,
      },
      config
    );

    return pr.number;
  } catch (error) {
    throw new RollbackError(
      `Failed to create rollback PR: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Generate rollback PR body
 */
function generateRollbackPRBody(
  originalPrNumber: number,
  dependencies: PackageDependency[]
): string {
  const lines = [
    '## Rollback',
    '',
    `This PR rolls back the changes from #${originalPrNumber}.`,
    '',
    '### Packages to rollback',
    '',
  ];

  for (const dep of dependencies) {
    lines.push(`- **${dep.name}**: ${dep.latestVersion} → ${dep.currentVersion}`);
  }

  lines.push('');
  lines.push('### Reason for rollback');
  lines.push('');
  lines.push('Tests failed after dependency update. Rolling back to stable versions.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*This PR was created automatically by the dependency updater rollback mechanism.*');

  return lines.join('\n');
}

/**
 * Prepare rollback state before applying updates
 */
export async function prepareRollback(
  prNumber: number,
  dependencies: PackageDependency[],
  config: DependencyUpdaterConfig
): Promise<RollbackState> {
  const workDir = config.workDir || process.cwd();

  // Read current package.json as the rollback state
  const packageJsonPath = join(workDir, config.packageJsonPath);
  const previousPackageJson = await readFile(packageJsonPath, 'utf-8');

  if (dependencies.length === 0) {
    throw new RollbackError('No dependencies provided for rollback');
  }

  const firstDep = dependencies[0];
  const state: RollbackState = {
    originalPrNumber: prNumber,
    rollbackBranch: generateBranchName(
      `rollback-${firstDep.name}`,
      firstDep.currentVersion,
      'rollback'
    ),
    dependencies: dependencies.map((d) => ({
      name: d.name,
      previousVersion: d.currentVersion,
      updatedVersion: d.latestVersion,
    })),
    createdAt: new Date().toISOString(),
    applied: false,
  };

  // Save the previous package.json content for rollback
  await saveRollbackState(state, workDir);

  // Also save a backup of the package.json
  const backupPath = join(workDir, `package.json.backup.${Date.now()}`);
  await writeFile(backupPath, previousPackageJson, 'utf-8');

  return state;
}

/**
 * Execute rollback if tests fail
 */
export async function executeRollbackIfFailed(
  updateResult: UpdateResult,
  config: DependencyUpdaterConfig,
  rollbackConfig?: Partial<RollbackConfig>
): Promise<number | null> {
  // Only rollback if tests failed
  if (updateResult.status !== 'tests_failed' && updateResult.status !== 'failed') {
    return null;
  }

  // Check if rollback is enabled
  if (rollbackConfig?.enabled === false) {
    return null;
  }

  const workDir = config.workDir || process.cwd();

  // Load the rollback state
  const state = await loadRollbackState(workDir);
  if (!state || state.originalPrNumber !== updateResult.prNumber) {
    throw new RollbackError('No rollback state found for this update');
  }

  // Read the backup package.json
  const backupPath = join(workDir, `package.json.backup.${Date.parse(state.createdAt)}`);
  let previousPackageJson: string;

  try {
    previousPackageJson = await readFile(backupPath, 'utf-8');
  } catch {
    throw new RollbackError('Backup package.json not found');
  }

  // Create rollback PR
  const rollbackPrNumber = await createRollbackPR(
    state.originalPrNumber,
    state.dependencies.map((d) => ({
      name: d.name,
      currentVersion: d.previousVersion,
      latestVersion: d.updatedVersion,
      type: PackageDependencyType.DEPENDENCIES,
      severity: UpdateSeverity.PATCH,
      category: DependencyCategory.DEPS,
      isDirect: true,
    })),
    config,
    previousPackageJson
  );

  // Add comment to original PR
  await addComment(
    state.originalPrNumber,
    `## Rollback Initiated ❌\n\nDue to test failures, a rollback PR has been created: #${rollbackPrNumber}\n\nPlease review and merge if needed.`,
    config
  );

  // Update state
  state.rollbackPrNumber = rollbackPrNumber ?? undefined;
  state.applied = false;
  await saveRollbackState(state, workDir);

  return rollbackPrNumber;
}

/**
 * Apply rollback by merging the rollback PR
 */
export async function applyRollback(
  rollbackPrNumber: number,
  config: DependencyUpdaterConfig
): Promise<void> {
  const { mergePullRequest } = await import('./github-client.js');

  await mergePullRequest(rollbackPrNumber, {
    method: 'merge',
    commitTitle: `Rollback dependency updates`,
    commitMessage: `Rolling back failed dependency updates from PR #${rollbackPrNumber}`,
  }, config);

  const workDir = config.workDir || process.cwd();
  const state = await loadRollbackState(workDir);

  if (state) {
    state.applied = true;
    state.appliedAt = new Date().toISOString();
    await saveRollbackState(state, workDir);
  }
}

/**
 * Automatic rollback creation after merge (immediate rollback mode)
 */
export async function createImmediateRollbackPR(
  mergedPrNumber: number,
  dependencies: PackageDependency[],
  config: DependencyUpdaterConfig
): Promise<number | null> {
  const workDir = config.workDir || process.cwd();

  // Prepare rollback state
  await prepareRollback(mergedPrNumber, dependencies, config);

  // Get previous package.json from before the merge
  // In a real scenario, this would come from the commit before the merge
  // We need to get the previous version from git
  const { gitExec } = await import('./github-client.js');
  const { stdout: previousJson } = await gitExec([
    'show',
    `HEAD~1:${config.packageJsonPath}`,
  ], { cwd: workDir });

  // Create the rollback PR
  return createRollbackPR(
    mergedPrNumber,
    dependencies,
    config,
    previousJson
  );
}

/**
 * Check if rollback is needed based on test failure threshold
 */
export function shouldRollback(
  testResults: { failedTests: number; totalTests: number },
  rollbackConfig?: Partial<RollbackConfig>
): boolean {
  const threshold = rollbackConfig?.failureThreshold ?? 1;

  // Always rollback if any tests fail by default
  if (threshold === 0) {
    return testResults.failedTests > 0;
  }

  return testResults.failedTests >= threshold;
}

/**
 * Clean up old rollback states
 */
export async function cleanupRollbackStates(
  workDir: string,
  olderThanHours: number = 24
): Promise<void> {
  const state = await loadRollbackState(workDir);

  if (!state) {
    return;
  }

  const createdAt = Date.parse(state.createdAt);
  const ageMs = Date.now() - createdAt;
  const ageHours = ageMs / (1000 * 60 * 60);

  // Only cleanup if rollback is old and was applied or PR is closed
  if (ageHours > olderThanHours && (state.applied || !state.rollbackPrNumber)) {
    await deleteRollbackState(workDir);
  }
}

/**
 * Rollback multiple failed updates at once
 */
export async function batchRollback(
  failedUpdates: UpdateResult[],
  config: DependencyUpdaterConfig
): Promise<Map<number, number>> {
  const rollbackMap = new Map<number, number>();

  for (const update of failedUpdates) {
    if (update.prNumber && (update.status === 'tests_failed' || update.status === 'failed')) {
      const rollbackPrNumber = await executeRollbackIfFailed(update, config);
      if (rollbackPrNumber) {
        rollbackMap.set(update.prNumber, rollbackPrNumber);
      }
    }
  }

  return rollbackMap;
}
