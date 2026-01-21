/**
 * Failure Analyzer Service Types
 * Defines types for analyzing test failures using LLMs
 */

/**
 * Failure categories for classification
 */
export enum FailureCategory {
  /**
   * Assertion failed - expected vs actual mismatch
   */
  ASSERTION = 'ASSERTION',

  /**
   * Element not found - locator issues
   */
  ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',

  /**
   * Timeout - operation took too long
   */
  TIMEOUT = 'TIMEOUT',

  /**
   * Network error - API/connection issues
   */
  NETWORK = 'NETWORK',

  /**
   * Application crash
   */
  CRASH = 'CRASH',

  /**
   * Test setup/initialization failure
   */
  SETUP = 'SETUP',

  /**
   * Data-related failure
   */
  DATA = 'DATA',

  /**
   * Environment/configuration issue
   */
  ENVIRONMENT = 'ENVIRONMENT',

  /**
   * Race condition or timing issue
   */
  RACE_CONDITION = 'RACE_CONDITION',

  /**
   * Unable to determine category
   */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Flakiness confidence levels
 */
export enum FlakinessConfidence {
  /**
   * Definitely not flaky - consistent failure pattern
   */
  NOT_FLAKY = 'NOT_FLAKY',

  /**
   * Low confidence of flakiness
   */
  LOW = 'LOW',

  /**
   * Medium confidence of flakiness
   */
  MEDIUM = 'MEDIUM',

  /**
   * High confidence of flakiness - test appears unstable
   */
  HIGH = 'HIGH',

  /**
   * Definitely flaky - clear signs of instability
   */
  DEFINITELY_FLAKY = 'DEFINITELY_FLAKY',
}

/**
 * Severity level of the failure
 */
export enum FailureSeverity {
  /**
   * Critical - blocking all tests
   */
  CRITICAL = 'CRITICAL',

  /**
   * High - major feature broken
   */
  HIGH = 'HIGH',

  /**
   * Medium - some functionality affected
   */
  MEDIUM = 'MEDIUM',

  /**
   * Low - minor issue or edge case
   */
  LOW = 'LOW',

  /**
   * Info - cosmetic or documentation issue
   */
  INFO = 'INFO',
}

/**
 * Suggested fix action
 */
export interface FixAction {
  /**
   * Type of action to take
   */
  type: 'code_change' | 'configuration' | 'environment' | 'test_update' | 'investigation';

  /**
   * Description of the action
   */
  description: string;

  /**
   * Specific code snippet or configuration (if applicable)
   */
  snippet?: string;

  /**
   * File path where the change should be made (if applicable)
   */
  filePath?: string;

  /**
   * Priority of this fix (higher = more urgent)
   */
  priority: number;

  /**
   * Estimated effort to implement (1-5 scale)
   */
  effort: 1 | 2 | 3 | 4 | 5;
}

/**
 * Root cause hypothesis
 */
export interface RootCauseHypothesis {
  /**
   * Primary suspected cause
   */
  primaryCause: string;

  /**
   * Confidence in this hypothesis (0-1)
   */
  confidence: number;

  /**
   * Secondary possible causes
   */
  alternativeCauses: string[];

  /**
   * Evidence supporting this hypothesis
   */
  evidence: string[];

  /**
   * Related code locations (file paths, line numbers)
   */
  relatedLocations: Array<{
    path: string;
    line?: number;
    description: string;
  }>;
}

/**
 * Flakiness analysis result
 */
export interface FlakinessAnalysis {
  /**
   * Whether the test appears to be flaky
   */
  isFlaky: boolean;

  /**
   * Confidence level in the flakiness assessment
   */
  confidence: FlakinessConfidence;

  /**
   * Signs of flakiness detected
   */
  indicators: string[];

  /**
   * Suggested stabilizers (ways to reduce flakiness)
   */
  stabilizers: string[];
}

/**
 * Test failure context
 */
export interface FailureContext {
  /**
   * Test name or title
   */
  testName: string;

  /**
   * Test file path
   */
  testFile?: string;

  /**
   * Error message from the failure
   */
  errorMessage: string;

  /**
   * Stack trace from the failure
   */
  stackTrace?: string;

  /**
   * Screenshot path or base64 data
   */
  screenshot?: string;

  /**
   * Log contents
   */
  logs?: string;

  /**
   * Device/platform information
   */
  deviceInfo?: {
    platform: string;
    osVersion: string;
    deviceName: string;
  };

  /**
   * Test suite name
   */
  suiteName?: string;

  /**
   * Test duration before failure
   */
  duration?: number;

  /**
   * Previous results for this test (for flakiness detection)
   */
  history?: {
    runCount: number;
    passCount: number;
    failCount: number;
    recentResults: Array<'PASS' | 'FAIL'>;
  };

  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Complete failure analysis result
 */
export interface FailureAnalysis {
  /**
   * Unique identifier for this analysis
   */
  id: string;

  /**
   * The analyzed failure context
   */
  context: FailureContext;

  /**
   * Categorized failure type
   */
  category: FailureCategory;

  /**
   * Severity level
   */
  severity: FailureSeverity;

  /**
   * Root cause analysis
   */
  rootCause: RootCauseHypothesis;

  /**
   * Flakiness assessment
   */
  flakiness: FlakinessAnalysis;

  /**
   * Suggested fixes
   */
  suggestedFixes: FixAction[];

  /**
   * Human-readable summary
   */
  summary: string;

  /**
   * Additional notes
   */
  notes: string[];

  /**
   * When the analysis was performed
   */
  analyzedAt: Date;

  /**
   * Analysis processing time in milliseconds
   */
  processingTimeMs: number;

  /**
   * Token usage if LLM was used
   */
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/**
 * Batch analysis input
 */
export interface BatchAnalysisInput {
  failures: FailureContext[];
  options?: AnalysisOptions;
}

/**
 * Batch analysis result
 */
export interface BatchAnalysisResult {
  results: FailureAnalysis[];
  summary: {
    total: number;
    byCategory: Record<FailureCategory, number>;
    bySeverity: Record<FailureSeverity, number>;
    flakyCount: number;
    totalProcessingTimeMs: number;
  };
}

/**
 * Analysis options
 */
export interface AnalysisOptions {
  /**
   * Whether to include screenshot analysis
   */
  analyzeScreenshots?: boolean;

  /**
   * Whether to analyze logs deeply
   */
  deepLogAnalysis?: boolean;

  /**
   * Whether to check for similar historical failures
   */
  checkHistory?: boolean;

  /**
   * Maximum number of fix suggestions
   */
  maxFixSuggestions?: number;

  /**
   * Custom instructions for the LLM
   */
  customInstructions?: string;

  /**
   * LLM model override
   */
  model?: string;

  /**
   * Maximum tokens for LLM response
   */
  maxTokens?: number;

  /**
   * Analysis timeout in milliseconds
   */
  timeout?: number;
}

/**
 * Error types for failure analyzer
 */
export enum FailureAnalyzerErrorType {
  /**
   * Invalid input data
   */
  INVALID_INPUT = 'INVALID_INPUT',

  /**
   * LLM operation failed
   */
  LLM_ERROR = 'LLM_ERROR',

  /**
   * Analysis failed
   */
  ANALYSIS_FAILED = 'ANALYSIS_FAILED',

  /**
   * Configuration error
   */
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',

  /**
   * Timeout
   */
  TIMEOUT = 'TIMEOUT',

  /**
   * Unknown error
   */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Custom error class for failure analyzer
 */
export class FailureAnalyzerError extends Error {
  constructor(
    public type: FailureAnalyzerErrorType,
    message: string,
    public originalError?: unknown
  ) {
    super(`${type}: ${message}`);
    this.name = 'FailureAnalyzerError';
  }
}
