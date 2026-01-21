/**
 * Type definitions for test optimization service
 * Handles intelligent test grouping based on historical execution data
 */

/**
 * Test execution history record for optimization
 */
export interface TestExecutionRecord {
  /** Test case ID */
  testCaseId: string;
  /** Test name */
  testName: string;
  /** Test suite ID */
  testSuiteId: string;
  /** Duration in milliseconds */
  duration: number;
  /** Execution status */
  status: 'PASSED' | 'FAILED' | 'SKIPPED' | 'TIMEOUT';
  /** Execution timestamp */
  timestamp: Date;
  /** Device platform */
  platform?: 'ios' | 'android';
  /** Tags associated with the test */
  tags: string[];
  /** Whether test is flaky (fails intermittently) */
  isFlaky: boolean;
  /** Average duration over recent executions */
  avgDuration: number;
  /** Duration variance (standard deviation) */
  durationVariance: number;
  /** Sample count for statistics */
  sampleCount: number;
}

/**
 * Test grouping strategy
 */
export enum GroupingStrategy {
  /** Balance duration across workers (minimize max batch time) */
  DURATION_BALANCED = 'duration_balanced',
  /** Group fast tests together, slow tests together */
  DURATION_CLUSTERED = 'duration_clustered',
  /** Group tests by tags/categories */
  TAG_BASED = 'tag_based',
  /** Group flaky tests separately for isolation */
  FLAKY_ISOLATED = 'flaky_isolated',
  /** Hybrid approach combining multiple strategies */
  HYBRID = 'hybrid',
}

/**
 * Optimization configuration
 */
export interface TestOptimizationConfig {
  /** Target number of parallel workers */
  targetWorkers: number;
  /** Grouping strategy to use */
  strategy: GroupingStrategy;
  /** Minimum samples before using historical data */
  minHistorySamples: number;
  /** Maximum samples to keep per test */
  maxHistorySamples: number;
  /** Flakiness threshold (failure rate) */
  flakinessThreshold: number;
  /** Duration variance tolerance (coefficient of variation) */
  varianceTolerance: number;
  /** Whether to consider dependencies */
  respectDependencies: boolean;
  /** Whether to group by platform */
  respectPlatform: boolean;
}

/**
 * Test batch for parallel execution
 */
export interface TestBatch {
  /** Batch index */
  batchIndex: number;
  /** Test cases in this batch */
  testCaseIds: string[];
  /** Estimated total duration */
  estimatedDuration: number;
  /** Number of tests in batch */
  testCount: number;
  /** Platform if platform-specific */
  platform?: 'ios' | 'android';
  /** Contains flaky tests */
  containsFlakyTests: boolean;
  /** Tags for tests in this batch */
  tags: string[];
  /** Confidence in estimation (0-1) */
  confidence: number;
}

/**
 * Optimization result
 */
export interface OptimizationResult {
  /** Generated test batches */
  batches: TestBatch[];
  /** Total estimated duration for all batches */
  totalEstimatedDuration: number;
  /** Estimated duration with parallel execution */
  parallelEstimatedDuration: number;
  /** Speedup factor (sequential / parallel) */
  speedupFactor: number;
  /** Load balance efficiency (0-1, 1 is perfectly balanced) */
  loadBalanceEfficiency: number;
  /** Number of tests optimized */
  totalTests: number;
  /** Number of tests using historical data */
  warmStartTests: number;
  /** Tests without historical data (using defaults) */
  coldStartTests: number;
  /** Metadata about the optimization */
  metadata: {
    strategy: GroupingStrategy;
    timestamp: Date;
    configUsed: TestOptimizationConfig;
  };
}

/**
 * Test dependency information
 */
export interface TestDependency {
  /** Test case ID */
  testCaseId: string;
  /** Tests that must run before this one */
  dependsOn: string[];
  /** Tests that depend on this one */
  requiredBy: string[];
}

/**
 * Resource requirement for a test
 */
export interface ResourceRequirement {
  /** Test case ID */
  testCaseId: string;
  /** CPU intensity (0-1) */
  cpuIntensity: number;
  /** Memory intensity (0-1) */
  memoryIntensity: number;
  /** Whether test requires specific device */
  requiresExclusiveDevice: boolean;
  /** Preferred platform */
  preferredPlatform?: 'ios' | 'android';
}

/**
 * Learning metrics from optimization
 */
export interface OptimizationMetrics {
  /** Number of times optimization has been run */
  optimizationCount: number;
  /** Average improvement in execution time (percentage) */
  avgImprovement: number;
  /** Accuracy of duration predictions (percentage) */
  predictionAccuracy: number;
  /** Last updated timestamp */
  lastUpdated: Date;
}

/**
 * Test statistics summary
 */
export interface TestStatisticsSummary {
  /** Total test executions tracked */
  totalExecutions: number;
  /** Tests with sufficient history */
  testsWithDataHistory: number;
  /** Tests identified as flaky */
  flakyTests: number;
  /** Average test duration */
  avgDuration: number;
  /** Median test duration */
  medianDuration: number;
  /** P95 test duration */
  p95Duration: number;
  /** Fastest test duration */
  minDuration: number;
  /** Slowest test duration */
  maxDuration: number;
}

/**
 * Batch allocation result
 */
export interface BatchAllocation {
  /** Batch assignments by test case ID */
  allocations: Map<string, number>;
  /** Worker assignments by batch index */
  workerAssignments: Map<number, number>;
}

/**
 * Validation result for optimization
 */
export interface ValidationResult {
  /** Whether optimization is valid */
  valid: boolean;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
}
