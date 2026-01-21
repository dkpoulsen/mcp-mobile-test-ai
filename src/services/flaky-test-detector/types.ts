/**
 * Flaky Test Detector Service Types
 * Types for detecting and managing flaky tests
 */

/**
 * Configuration for flaky test detection
 */
export interface FlakyTestDetectorConfig {
  /**
   * Minimum number of runs before analyzing for flakiness
   */
  minRunsForAnalysis: number;

  /**
   * Flakiness score threshold (0-1) above which a test is considered flaky
   */
  flakinessThreshold: number;

  /**
   * Number of recent runs to analyze for pattern detection
   */
  patternAnalysisWindow: number;

  /**
   * Minimum failures to trigger quarantine
   */
  quarantineFailureThreshold: number;

  /**
   * Consecutive passes required to promote a quarantined test back
   */
  promotionPassThreshold: number;

  /**
   * Days to look back for historical data
   */
  historyDays: number;

  /**
   * Whether to automatically quarantine detected flaky tests
   */
  autoQuarantine: boolean;

  /**
   * Whether to automatically promote stabilized tests
   */
  autoPromote: boolean;

  /**
   * Team to assign flaky tests to (if any)
   */
  defaultTeam?: string;
}

/**
 * Test execution result for tracking
 */
export interface TestExecutionResult {
  testRunId: string;
  testCaseId: string;
  testSuiteId: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED' | 'TIMEOUT';
  timestamp: Date;
  errorMessage?: string;
}

/**
 * Flakiness analysis result
 */
export interface FlakinessAnalysis {
  /**
   * Whether the test is considered flaky
   */
  isFlaky: boolean;

  /**
   * Flakiness score (0-1, higher = more flaky)
   */
  flakinessScore: number;

  /**
   * Confidence level in the assessment
   */
  confidence: 'low' | 'medium' | 'high' | 'very_high';

  /**
   * Total runs analyzed
   */
  totalRuns: number;

  /**
   * Number of passes
   */
  passCount: number;

  /**
   * Number of failures
   */
  failCount: number;

  /**
   * Pass rate percentage
   */
  passRate: number;

  /**
   * Recent execution pattern (e.g., "PFPFPPF")
   */
  recentPattern: string;

  /**
   * Detected failure patterns
   */
  failurePatterns: FailurePattern[];

  /**
   * Suggested stabilizers
   */
  suggestedFixes: string[];

  /**
   * Whether quarantine is recommended
   */
  shouldQuarantine: boolean;

  /**
   * Reason for the assessment
   */
  reason: string;
}

/**
 * Failure pattern type
 */
export interface FailurePattern {
  /**
   * Type of pattern detected
   */
  type: 'intermittent' | 'timing' | 'race_condition' | 'environment' | 'data' | 'unknown';

  /**
   * Description of the pattern
   */
  description: string;

  /**
   * Confidence in this pattern detection
   */
  confidence: number;

  /**
   * Evidence supporting this pattern
   */
  evidence: string[];
}

/**
 * Quarantine recommendation
 */
export interface QuarantineRecommendation {
  /**
   * Whether quarantine is recommended
   */
  shouldQuarantine: boolean;

  /**
   * Reason for quarantine recommendation
   */
  reason: string;

  /**
   * Category of quarantine
   */
  category: 'flaky' | 'timeout' | 'environment' | 'deprecated' | 'under_review';

  /**
   * Suggested fixes
   */
  suggestedFixes: string[];

  /**
   * Estimated priority (1-10)
   */
  priority: number;
}

/**
 * Promotion eligibility result
 */
export interface PromotionEligibility {
  /**
   * Whether the test is eligible for promotion from quarantine
   */
  isEligible: boolean;

  /**
   * Current consecutive pass count
   */
  consecutivePasses: number;

  /**
   * Required consecutive passes
   */
  requiredPasses: number;

  /**
   * Reason for eligibility status
   */
  reason: string;
}

/**
 * Batch detection input
 */
export interface BatchDetectionInput {
  /**
   * Test case IDs to analyze
   */
  testCaseIds: string[];

  /**
   * Custom configuration (optional)
   */
  config?: Partial<FlakyTestDetectorConfig>;
}

/**
 * Batch detection result
 */
export interface BatchDetectionResult {
  /**
   * Individual test results
   */
  results: Map<string, FlakinessAnalysis>;

  /**
   * Tests recommended for quarantine
   */
  quarantineRecommendations: QuarantineRecommendation[];

  /**
   * Tests eligible for promotion
   */
  promotionEligible: string[];

  /**
   * Summary statistics
   */
  summary: {
    totalAnalyzed: number;
    flakyDetected: number;
    quarantineRecommended: number;
    promotionEligible: number;
  };
}

/**
 * Flaky test statistics
 */
export interface FlakyTestStatistics {
  /**
   * Total number of flaky tests
   */
  totalFlaky: number;

  /**
   * Number of quarantined tests
   */
  totalQuarantined: number;

  /**
   * Number of tests in stabilization
   */
  totalStabilizing: number;

  /**
   * Breakdown by flakiness score ranges
   */
  byScoreRange: {
    low: number;      // 0.0 - 0.3
    medium: number;   // 0.3 - 0.6
    high: number;     // 0.6 - 0.8
    critical: number; // 0.8 - 1.0
  };

  /**
   * Most flaky tests (top N)
   */
  mostFlaky: Array<{
    testCaseId: string;
    testSuiteName: string;
    testCaseName: string;
    flakinessScore: number;
  }>;
}

/**
 * Detection event for notifications
 */
export interface FlakyTestEvent {
  /**
   * Event type
   */
  type: 'detected' | 'quarantined' | 'promoted' | 'stabilizing';

  /**
   * Test case ID
   */
  testCaseId: string;

  /**
   * Test suite ID
   */
  testSuiteId: string;

  /**
   * Test case name
   */
  testCaseName: string;

  /**
   * Test suite name
   */
  testSuiteName: string;

  /**
   * Flakiness analysis
   */
  analysis: FlakinessAnalysis;

  /**
   * Assigned team (if any)
   */
  assignedTeam?: string;

  /**
   * Timestamp
   */
  timestamp: Date;
}
