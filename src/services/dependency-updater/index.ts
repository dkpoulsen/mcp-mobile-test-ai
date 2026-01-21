/**
 * Dependency Auto-Updater Service
 *
 * Automatically detects outdated dependencies (Appium, WebDriver, browser drivers),
 * creates pull requests with updates, runs full test suites, and merges if all tests pass.
 * Includes rollback mechanisms for failed updates.
 *
 * @example
 * ```typescript
 * import { createDependencyUpdater } from './services/dependency-updater';
 *
 * const updater = createDependencyUpdater({
 *   packageJsonPath: 'package.json',
 *   repoOwner: 'my-org',
 *   repoName: 'my-repo',
 *   defaultBranch: 'main',
 *   categories: ['appium', 'webdriver', 'browser_driver'],
 *   autoMerge: true,
 *   enableRollback: true,
 * });
 *
 * const summary = await updater.run();
 * console.log(`Found ${summary.updatesAvailable} updates`);
 * ```
 */

// Main classes
export {
  DependencyUpdater,
  createDependencyUpdater,
  checkOutdatedDependencies,
  updateSinglePackage,
} from './dependency-updater.js';

// Type exports
export type {
  DependencyCategory,
  PackageDependencyType,
  UpdateSeverity,
  UpdateStatus,
  PackageDependency,
  SecurityVulnerability,
  DependencyUpdaterConfig,
  UpdateResult,
  TestResults,
  IndividualTestResult,
  PullRequestOptions,
  RollbackConfig,
  DependencyCheckSummary,
  RegistryPackageInfo,
  RegistryVersionInfo,
  CategoryPattern,
  GitHubPullRequest,
  WorkflowRun,
  AutoMergeDecision,
} from './types.js';

// Error classes
export {
  DependencyUpdaterError,
  PackageNotFoundError,
  RegistryError,
  GitHubError,
  TestExecutionError,
  RollbackError,
} from './types.js';

// Enum exports (value exports for runtime use)
export {
  DependencyCategory,
  PackageDependencyType,
  UpdateSeverity,
  UpdateStatus,
} from './types.js';

// Registry client functions
export {
  fetchPackageInfo,
  fetchSecurityAdvisories,
  checkPackageOutdated,
  findOutdatedDependencies,
  readPackageJson,
  getAllDependencies,
  clearRegistryCache,
} from './registry-client.js';

// Category matcher functions
export {
  categorizeDependency,
  filterPackagesByCategory,
  categorizePackages,
  shouldCheckSecurity,
  getEnabledCategories,
  isCriticalDependency,
  formatCategoryName,
} from './category-matcher.js';

// GitHub client functions
export {
  parseRepository,
  createBranch,
  createPullRequest,
  updateFile,
  getPullRequest,
  listPullRequests,
  mergePullRequest,
  closePullRequest,
  addComment,
  getWorkflowRuns,
  waitForWorkflowCompletion,
  generateBranchName,
  generatePRTitle,
  generatePRBody,
  gitExec,
  ensureRepoLocal,
} from './github-client.js';

// Test runner functions
export {
  runTests,
  runTestsWithArtifacts,
  runCISuite,
  runTestTypes,
  areTestsPassing,
  getTestCommand,
  hasTestArtifacts,
} from './test-runner.js';

// Auto-merge functions
export {
  makeAutoMergeDecision,
  makeAutoMergeDecisionFromCI,
  executeAutoMerge,
  isSafeForAutoMerge,
  calculateMergeConfidence,
  generateAutoMergeExplanation,
} from './auto-merge.js';

// Rollback functions
export {
  loadRollbackState,
  createRollbackPR,
  prepareRollback,
  executeRollbackIfFailed,
  applyRollback,
  createImmediateRollbackPR,
  shouldRollback,
  cleanupRollbackStates,
  batchRollback,
} from './rollback.js';
