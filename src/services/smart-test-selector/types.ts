/**
 * Type definitions for Smart Test Selector
 * Analyzes code changes and selects relevant tests based on impact analysis
 */

/**
 * Represents a changed file in a pull request
 */
export interface ChangedFile {
  /** File path relative to repository root */
  path: string;
  /** Type of change */
  changeType: 'added' | 'modified' | 'deleted' | 'renamed';
  /** Previous path if renamed */
  previousPath?: string;
  /** Number of lines added */
  additions: number;
  /** Number of lines deleted */
  deletions: number;
  /** Patch/diff content */
  patch?: string;
  /** Language/file type based on extension */
  fileType: string;
}

/**
 * Represents a code change impact analysis
 */
export interface ChangeImpact {
  /** Changed file */
  file: ChangedFile;
  /** Impact level (higher = more significant) */
  impactLevel: 'low' | 'medium' | 'high' | 'critical';
  /** Affected modules/components */
  affectedModules: string[];
  /** Reason for impact assessment */
  reason: string;
  /** Source files that import this file */
  importedBy: string[];
  /** Files imported by this file */
  imports: string[];
}

/**
 * Test file mapping to source code
 */
export interface TestToSourceMapping {
  /** Test file path */
  testPath: string;
  /** Source files this test covers */
  sourceFiles: string[];
  /** Coverage confidence (0-1) */
  coverageConfidence: number;
  /** Test tags/categories */
  tags: string[];
  /** Last run timestamp */
  lastRun?: Date;
  /** Average duration */
  avgDuration?: number;
  /** Whether test is flaky */
  isFlaky: boolean;
}

/**
 * Historical test failure data
 */
export interface TestFailureHistory {
  /** Test path/identifier */
  testPath: string;
  /** Total runs */
  totalRuns: number;
  /** Failure count */
  failureCount: number;
  /** Failure rate (0-1) */
  failureRate: number;
  /** Recent failures (last N runs) */
  recentFailures: number;
  /** Common failure categories */
  failureCategories: string[];
  /** Files commonly involved in failures */
  relatedFiles: string[];
}

/**
 * Test selection result
 */
export interface SelectedTest {
  /** Test file path */
  testPath: string;
  /** Selection reason */
  reason: string;
  /** Priority score (higher = more important) */
  priority: number;
  /** Estimated duration */
  estimatedDuration?: number;
  /** Whether test is flaky */
  isFlaky: boolean;
  /** Related source files */
  relatedSourceFiles: string[];
  /** Change types that triggered selection */
  triggeredBy: string[];
}

/**
 * Test selection result summary
 */
export interface TestSelectionResult {
  /** Selected tests */
  selectedTests: SelectedTest[];
  /** Skipped tests (low priority) */
  skippedTests: string[];
  /** Total selected count */
  selectedCount: number;
  /** Total skipped count */
  skippedCount: number;
  /** Estimated time savings (ms) */
  estimatedTimeSavings: number;
  /** Selection confidence (0-1) */
  confidence: number;
  /** Analysis metadata */
  metadata: SelectionMetadata;
}

/**
 * Selection metadata
 */
export interface SelectionMetadata {
  /** Analysis timestamp */
  timestamp: Date;
  /** Number of changed files analyzed */
  changedFilesCount: number;
  /** Total tests in repository */
  totalTests: number;
  /** Selection strategy used */
  strategy: SelectionStrategy;
  /** Configuration used */
  config: TestSelectorConfig;
}

/**
 * Test selection strategy
 */
export enum SelectionStrategy {
  /** Only run tests directly affected by changes */
  AFFECTED_ONLY = 'affected_only',
  /** Run affected tests plus high-risk tests */
  AFFECTED_PLUS_HIGH_RISK = 'affected_plus_high_risk',
  /** Run affected tests plus tests with history of failure */
  AFFECTED_PLUS_FLAKY = 'affected_plus_flaky',
  /** Run all tests if changes exceed threshold */
  THRESHOLD_BASED = 'threshold_based',
  /** Balanced approach using multiple factors */
  BALANCED = 'balanced',
}

/**
 * Test selector configuration
 */
export interface TestSelectorConfig {
  /** Selection strategy */
  strategy: SelectionStrategy;
  /** Threshold for running all tests (number of files changed) */
  fullTestThreshold: number;
  /** Include tests that import changed modules */
  includeImporters: boolean;
  /** Include tests with high flakiness */
  includeFlaky: boolean;
  /** Flakiness threshold (0-1) */
  flakinessThreshold: number;
  /** Priority multiplier for flaky tests */
  flakyPriorityMultiplier: number;
  /** Maximum number of tests to select (0 = unlimited) */
  maxTests?: number;
  /** Minimum priority score for selection */
  minPriority: number;
  /** Whether to use historical failure data */
  useHistoryData: boolean;
  /** Path to coverage mapping file */
  coverageMapPath?: string;
  /** File patterns to exclude from analysis */
  excludePatterns: string[];
  /** File patterns to always include tests for */
  includePatterns: string[];
}

/**
 * Default configuration values
 */
export const DEFAULT_SELECTOR_CONFIG: TestSelectorConfig = {
  strategy: SelectionStrategy.BALANCED,
  fullTestThreshold: 20,
  includeImporters: true,
  includeFlaky: true,
  flakinessThreshold: 0.2,
  flakyPriorityMultiplier: 1.5,
  maxTests: 0,
  minPriority: 0.3,
  useHistoryData: true,
  excludePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/*.md',
    '**/.git/**',
    '**/coverage/**',
    '**/*.min.js',
    '**/*.min.ts',
  ],
  includePatterns: [
    'src/**/*.ts',
    'src/**/*.js',
    'services/**/*.ts',
    'core/**/*.ts',
  ],
};

/**
 * Pull request information
 */
export interface PullRequestInfo {
  /** PR number */
  number: number;
  /** Source branch */
  sourceBranch: string;
  /** Target branch */
  targetBranch: string;
  /** Commit SHA */
  sha: string;
  /** Changed files */
  changedFiles: ChangedFile[];
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
}

/**
 * Dependency graph node
 */
export interface DependencyNode {
  /** File path */
  path: string;
  /** Files that import this file */
  importedBy: Set<string>;
  /** Files this file imports */
  imports: Set<string>;
  /** Whether this is a test file */
  isTestFile: boolean;
}

/**
 * Analysis cache entry
 */
export interface AnalysisCacheEntry {
  /** File path */
  path: string;
  /** Analysis timestamp */
  timestamp: Date;
  /** Hash of file content for invalidation */
  contentHash: string;
  /** Extracted imports */
  imports: string[];
  /** Whether file is a test file */
  isTestFile: boolean;
}
