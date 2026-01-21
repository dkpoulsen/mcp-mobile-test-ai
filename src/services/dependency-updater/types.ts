/**
 * Dependency Auto-Updater Types
 *
 * Defines types for automatic dependency detection, PR creation,
 * test validation, auto-merge, and rollback mechanisms.
 */

/**
 * Dependency categories that can be auto-updated
 */
export enum DependencyCategory {
  /** Appium and related packages */
  APPIUM = 'appium',
  /** Selenium WebDriver and related packages */
  WEBDRIVER = 'webdriver',
  /** Browser drivers (chromedriver, geckodriver, etc.) */
  BROWSER_DRIVER = 'browser_driver',
  /** Playwright testing framework */
  PLAYWRIGHT = 'playwright',
  /** Testing frameworks and utilities */
  TESTING = 'testing',
  /** All production dependencies */
  DEPS = 'deps',
  /** All development dependencies */
  DEV_DEPS = 'devDeps',
  /** All dependencies */
  ALL = 'all',
}

/**
 * Dependency type in package.json
 */
export enum PackageDependencyType {
  DEPENDENCIES = 'dependencies',
  DEV_DEPENDENCIES = 'devDependencies',
  PEER_DEPENDENCIES = 'peerDependencies',
  OPTIONAL_DEPENDENCIES = 'optionalDependencies',
}

/**
 * Severity level for dependency updates
 */
export enum UpdateSeverity {
  /** Patch update (bug fixes) - backward compatible */
  PATCH = 'patch',
  /** Minor update (new features) - backward compatible */
  MINOR = 'minor',
  /** Major update (breaking changes) - may not be backward compatible */
  MAJOR = 'major',
}

/**
 * Update status in the workflow
 */
export enum UpdateStatus {
  /** Update is pending check */
  PENDING = 'pending',
  /** Update is being checked */
  CHECKING = 'checking',
  /** Update available and ready to apply */
  AVAILABLE = 'available',
  /** PR created for update */
  PR_CREATED = 'pr_created',
  /** Tests are running for update */
  TESTING = 'testing',
  /** Tests passed for update */
  TESTS_PASSED = 'tests_passed',
  /** Tests failed for update */
  TESTS_FAILED = 'tests_failed',
  /** Update was merged */
  MERGED = 'merged',
  /** Update was rolled back */
  ROLLED_BACK = 'rolled_back',
  /** Update was skipped */
  SKIPPED = 'skipped',
  /** Update failed with error */
  FAILED = 'failed',
}

/**
 * Package dependency information
 */
export interface PackageDependency {
  /** Package name */
  name: string;
  /** Current version in package.json */
  currentVersion: string;
  /** Latest available version */
  latestVersion: string;
  /** Package dependency type */
  type: PackageDependencyType;
  /** Severity of the update */
  severity: UpdateSeverity;
  /** Category this dependency belongs to */
  category: DependencyCategory;
  /** Homepage URL */
  homepage?: string;
  /** Repository URL */
  repository?: string;
  /** Release notes URL */
  releaseUrl?: string;
  /** Whether this is a direct dependency */
  isDirect: boolean;
  /** List of dependents (if indirect) */
  dependents?: string[];
  /** Security vulnerabilities */
  vulnerabilities?: SecurityVulnerability[];
}

/**
 * Security vulnerability information
 */
export interface SecurityVulnerability {
  /** Vulnerability ID (CVE, GHSA, etc.) */
  id: string;
  /** Severity level */
  severity: 'low' | 'moderate' | 'high' | 'critical';
  /** Vulnerability title */
  title: string;
  /** Vulnerability description */
  description: string;
  /** Patched versions */
  patchedVersions?: string[];
  /** Vulnerable versions */
  vulnerableVersions?: string[];
  /** Advisory URL */
  url?: string;
}

/**
 * Update configuration options
 */
export interface DependencyUpdaterConfig {
  /** Package.json file path */
  packageJsonPath: string;
  /** GitHub repository owner */
  repoOwner: string;
  /** GitHub repository name */
  repoName: string;
  /** Default branch name */
  defaultBranch: string;
  /** Dependency categories to check */
  categories: DependencyCategory[];
  /** Maximum updates per run */
  maxUpdates?: number;
  /** Whether to auto-merge on test success */
  autoMerge: boolean;
  /** Whether to create rollback PR */
  enableRollback: boolean;
  /** Labels to add to PRs */
  labels?: string[];
  /** PR reviewers */
  reviewers?: string[];
  /** Test command to run */
  testCommand?: string;
  /** Branch name prefix */
  branchPrefix?: string;
  /** Include major updates */
  includeMajor: boolean;
  /** Include minor updates */
  includeMinor: boolean;
  /** Include patch updates */
  includePatch: boolean;
  /** Minimum time between update runs (hours) */
  minUpdateInterval?: number;
  /** Work directory for operations */
  workDir?: string;
  /** Dry run mode (no actual changes) */
  dryRun?: boolean;
}

/**
 * Update operation result
 */
export interface UpdateResult {
  /** Package name */
  packageName: string;
  /** Old version */
  oldVersion: string;
  /** New version */
  newVersion: string;
  /** Update status */
  status: UpdateStatus;
  /** PR number if created */
  prNumber?: number;
  /** PR URL */
  prUrl?: string;
  /** Error message if failed */
  error?: string;
  /** Test results */
  testResults?: TestResults;
  /** Rollback PR number if applicable */
  rollbackPrNumber?: number;
}

/**
 * Test execution results
 */
export interface TestResults {
  /** Whether all tests passed */
  passed: boolean;
  /** Total number of tests */
  totalTests: number;
  /** Number of failed tests */
  failedTests: number;
  /** Number of skipped tests */
  skippedTests: number;
  /** Test execution duration in milliseconds */
  duration: number;
  /** Test output/logs */
  output?: string;
  /** Individual test results */
  tests?: IndividualTestResult[];
}

/**
 * Individual test result
 */
export interface IndividualTestResult {
  /** Test name/file */
  name: string;
  /** Test status */
  status: 'passed' | 'failed' | 'skipped' | 'timedout';
  /** Test duration in milliseconds */
  duration: number;
  /** Error message if failed */
  error?: string;
  /** Test file path */
  file?: string;
}

/**
 * Pull request creation options
 */
export interface PullRequestOptions {
  /** PR title */
  title: string;
  /** PR body/description */
  body: string;
  /** Branch name */
  branch: string;
  /** Base branch */
  base: string;
  /** Labels to add */
  labels?: string[];
  /** Reviewers to request */
  reviewers?: string[];
  /** Whether the PR is a draft */
  draft?: boolean;
}

/**
 * Rollback configuration
 */
export interface RollbackConfig {
  /** Whether rollback is enabled */
  enabled: boolean;
  /** Time window to consider rollback (hours) */
  rollbackWindow?: number;
  /** Failure threshold to trigger rollback */
  failureThreshold?: number;
  /** Create rollback PR immediately after merge */
  createImmediateRollback?: boolean;
}

/**
 * Dependency check summary
 */
export interface DependencyCheckSummary {
  /** Check timestamp */
  timestamp: Date;
  /** Total packages checked */
  totalChecked: number;
  /** Number of outdated packages found */
  outdatedFound: number;
  /** Number of updates available */
  updatesAvailable: number;
  /** Number of security vulnerabilities found */
  vulnerabilitiesFound: number;
  /** Packages with updates */
  packages: PackageDependency[];
}

/**
 * Registry package information from npm
 */
export interface RegistryPackageInfo {
  /** Package name */
  name: string;
  /** Current version */
  version: string;
  /** Distribution information */
  dist: {
    /** Tarball URL */
    tarball: string;
    /** shasum */
    shasum?: string;
    /** integrity */
    integrity?: string;
  };
  /** Dist tags (latest, next, etc.) */
  'dist-tags'?: Record<string, string>;
  /** List of all versions */
  versions?: Record<string, RegistryVersionInfo>;
  /** Homepage */
  homepage?: string;
  /** Repository */
  repository?: {
    type: string;
    url: string;
  };
  /** Bugs URL */
  bugs?: {
    url: string;
  };
  /** License */
  license?: string;
  /** Author */
  author?: string;
  /** Description */
  description?: string;
  /** Keywords */
  keywords?: string[];
  /** Dependencies */
  dependencies?: Record<string, string>;
  /** Dev dependencies */
  devDependencies?: Record<string, string>;
  /** Peer dependencies */
  peerDependencies?: Record<string, string>;
}

/**
 * Registry version information
 */
export interface RegistryVersionInfo {
  /** Version name */
  name: string;
  /** Version */
  version: string;
  /** Dependencies */
  dependencies?: Record<string, string>;
  /** Dev dependencies */
  devDependencies?: Record<string, string>;
  /** Peer dependencies */
  peerDependencies?: Record<string, string>;
  /** Distribution */
  dist: {
    tarball: string;
    shasum?: string;
    integrity?: string;
  };
  /** Has shasum */
  hasShasum?: boolean;
  /** Has scripts */
  _hasShrinkwrap?: boolean;
  /** CI info */
  _nodeVersion?: string;
  _npmVersion?: string;
}

/**
 * Category pattern mapping
 */
export interface CategoryPattern {
  /** Category */
  category: DependencyCategory;
  /** Name patterns to match */
  patterns: RegExp[];
  /** Whether to check for vulnerabilities */
  checkSecurity: boolean;
}

/**
 * GitHub API response for PR
 */
export interface GitHubPullRequest {
  /** PR number */
  number: number;
  /** PR title */
  title: string;
  /** PR state */
  state: 'open' | 'closed' | 'merged';
  /** PR URL */
  html_url: string;
  /** Head branch */
  head: {
    ref: string;
    sha: string;
  };
  /** Base branch */
  base: {
    ref: string;
    sha: string;
  };
  /** Merge status */
  merged: boolean;
  /** Merge commit SHA */
  merge_commit_sha?: string;
  /** Creation timestamp */
  created_at: string;
  /** Updated timestamp */
  updated_at: string;
  /** Closed timestamp */
  closed_at?: string;
  /** Merged timestamp */
  merged_at?: string;
}

/**
 * Workflow run information
 */
export interface WorkflowRun {
  /** Run ID */
  id: number;
  /** Run number */
  runNumber: number;
  /** Run status */
  status: 'queued' | 'in_progress' | 'completed';
  /** Run conclusion */
  conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out';
  /** Workflow name */
  name: string;
  /** Head branch */
  headBranch: string;
  /** Head SHA */
  headSha: string;
  /** Run URL */
  htmlUrl: string;
  /** Created timestamp */
  createdAt: string;
  /** Updated timestamp */
  updatedAt: string;
}

/**
 * Auto-merge decision result
 */
export interface AutoMergeDecision {
  /** Whether to merge */
  shouldMerge: boolean;
  /** Reason for decision */
  reason: string;
  /** Confidence level (0-1) */
  confidence?: number;
}

/**
 * Error types for dependency updater
 */
export class DependencyUpdaterError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'DependencyUpdaterError';
  }
}

export class PackageNotFoundError extends DependencyUpdaterError {
  constructor(packageName: string) {
    super(`Package not found: ${packageName}`, 'PACKAGE_NOT_FOUND');
    this.name = 'PackageNotFoundError';
  }
}

export class RegistryError extends DependencyUpdaterError {
  constructor(message: string) {
    super(`Registry error: ${message}`, 'REGISTRY_ERROR');
    this.name = 'RegistryError';
  }
}

export class GitHubError extends DependencyUpdaterError {
  constructor(message: string, public statusCode?: number) {
    super(`GitHub error: ${message}`, 'GITHUB_ERROR');
    this.name = 'GitHubError';
  }
}

export class TestExecutionError extends DependencyUpdaterError {
  constructor(message: string) {
    super(`Test execution error: ${message}`, 'TEST_ERROR');
    this.name = 'TestExecutionError';
  }
}

export class RollbackError extends DependencyUpdaterError {
  constructor(message: string) {
    super(`Rollback error: ${message}`, 'ROLLBACK_ERROR');
    this.name = 'RollbackError';
  }
}
