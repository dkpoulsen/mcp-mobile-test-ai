/**
 * Test Grouping Optimizer
 * Analyzes test execution history and creates optimal parallel test batches
 * Uses various strategies to minimize total execution time
 */

import { createModuleLogger } from '../../utils/logger.js';
import { getGlobalHistoryTracker } from './test-history-tracker.js';
import type {
  TestBatch,
  TestOptimizationConfig,
  OptimizationResult,
  TestExecutionRecord,
  ValidationResult,
  TestDependency,
} from './types.js';
import { GroupingStrategy } from './types.js';

const logger = createModuleLogger('test-grouping-optimizer');

/**
 * Default optimization configuration
 */
const DEFAULT_CONFIG: TestOptimizationConfig = {
  targetWorkers: 3,
  strategy: GroupingStrategy.HYBRID,
  minHistorySamples: 3,
  maxHistorySamples: 100,
  flakinessThreshold: 0.3,
  varianceTolerance: 0.5,
  respectDependencies: true,
  respectPlatform: true,
};

/**
 * Test metadata for optimization
 */
interface TestMetadata {
  testCaseId: string;
  name: string;
  tags: string[];
  estimatedDuration: number;
  isFlaky: boolean;
  hasHistory: boolean;
  platform?: 'ios' | 'android';
  variance: number;
}

/**
 * Optimized batch with internal tracking
 */
interface OptimizedBatch extends Omit<TestBatch, 'testCaseIds'> {
  testCaseIds: Set<string>;
  currentDuration: number;
}

/**
 * Test Grouping Optimizer class
 */
export class TestGroupingOptimizer {
  private config: TestOptimizationConfig;

  constructor(config?: Partial<TestOptimizationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.info({ config: this.config }, 'Test grouping optimizer initialized');
  }

  /**
   * Create optimal test batches for parallel execution
   */
  async optimizeTestExecution(
    testCaseIds: string[],
    options?: Partial<TestOptimizationConfig>
  ): Promise<OptimizationResult> {
    const effectiveConfig = { ...this.config, ...options };
    const historyTracker = getGlobalHistoryTracker();

    logger.info(
      {
        testCount: testCaseIds.length,
        config: effectiveConfig,
      },
      'Starting test execution optimization'
    );

    // Validate input
    const validation = this.validateInput(testCaseIds, effectiveConfig);
    if (!validation.valid) {
      throw new Error(`Invalid optimization input: ${validation.errors.join(', ')}`);
    }

    // Gather test metadata
    const testMetadata = await this.gatherTestMetadata(testCaseIds, historyTracker);

    // Apply the selected strategy
    let batches: TestBatch[];
    switch (effectiveConfig.strategy) {
      case GroupingStrategy.DURATION_BALANCED:
        batches = this.balanceByDuration(testMetadata, effectiveConfig);
        break;
      case GroupingStrategy.DURATION_CLUSTERED:
        batches = this.clusterByDuration(testMetadata, effectiveConfig);
        break;
      case GroupingStrategy.TAG_BASED:
        batches = this.groupByTags(testMetadata, effectiveConfig);
        break;
      case GroupingStrategy.FLAKY_ISOLATED:
        batches = this.isolateFlakyTests(testMetadata, effectiveConfig);
        break;
      case GroupingStrategy.HYBRID:
        batches = this.hybridStrategy(testMetadata, effectiveConfig);
        break;
      default:
        batches = this.balanceByDuration(testMetadata, effectiveConfig);
    }

    // Apply platform segregation if configured
    if (effectiveConfig.respectPlatform) {
      batches = this.segregateByPlatform(batches, testMetadata);
    }

    // Calculate optimization metrics
    const totalEstimatedDuration = batches.reduce(
      (sum, batch) => sum + batch.estimatedDuration,
      0
    );
    const maxBatchDuration = Math.max(...batches.map((b) => b.estimatedDuration));
    const parallelEstimatedDuration = maxBatchDuration;
    const speedupFactor = totalEstimatedDuration / maxBatchDuration;

    // Calculate load balance efficiency
    const avgBatchDuration = totalEstimatedDuration / batches.length;
    const loadBalanceEfficiency =
      avgBatchDuration > 0
        ? 1 - Math.abs(maxBatchDuration - avgBatchDuration) / avgBatchDuration
        : 1;

    // Count tests with and without history
    const testsWithHistory = testMetadata.filter((t) => t.hasHistory).length;
    const coldStartTests = testMetadata.length - testsWithHistory;

    const result: OptimizationResult = {
      batches,
      totalEstimatedDuration,
      parallelEstimatedDuration,
      speedupFactor,
      loadBalanceEfficiency,
      totalTests: testCaseIds.length,
      warmStartTests: testsWithHistory,
      coldStartTests,
      metadata: {
        strategy: effectiveConfig.strategy,
        timestamp: new Date(),
        configUsed: effectiveConfig,
      },
    };

    logger.info(
      {
        batches: batches.length,
        totalTests: result.totalTests,
        speedupFactor: result.speedupFactor.toFixed(2),
        loadBalanceEfficiency: result.loadBalanceEfficiency.toFixed(2),
        estimatedTime: `${(result.parallelEstimatedDuration / 1000).toFixed(1)}s`,
      },
      'Test optimization completed'
    );

    return result;
  }

  /**
   * Gather metadata for all tests
   */
  private async gatherTestMetadata(
    testCaseIds: string[],
    historyTracker: Awaited<ReturnType<typeof getGlobalHistoryTracker>>
  ): Promise<TestMetadata[]> {
    const metadata: TestMetadata[] = [];

    for (const testCaseId of testCaseIds) {
      const history = historyTracker.getHistory(testCaseId);
      const hasHistory = history.length >= this.config.minHistorySamples;
      const isFlaky = historyTracker.isTestFlaky(testCaseId);
      const resourceReq = historyTracker.getResourceRequirement(testCaseId);

      let estimatedDuration = 5000; // Default 5 seconds
      let variance = 2000;
      let platform = resourceReq?.preferredPlatform;

      if (hasHistory && history.length > 0) {
        const latest = history[history.length - 1];
        estimatedDuration = latest.avgDuration;
        variance = latest.durationVariance;
        platform = platform || (latest.platform as 'ios' | 'android' | undefined);
      }

      metadata.push({
        testCaseId,
        name: history.length > 0 ? history[history.length - 1].testName : testCaseId,
        tags: history.length > 0 ? history[history.length - 1].tags : [],
        estimatedDuration,
        isFlaky,
        hasHistory,
        platform,
        variance,
      });
    }

    return metadata;
  }

  /**
   * Strategy: Balance duration across workers (greedy bin packing)
   */
  private balanceByDuration(
    tests: TestMetadata[],
    config: TestOptimizationConfig
  ): TestBatch[] {
    // Sort tests by estimated duration (descending) for better bin packing
    const sorted = [...tests].sort((a, b) => b.estimatedDuration - a.estimatedDuration);

    const batches: OptimizedBatch[] = Array.from({ length: config.targetWorkers }, (_, i) => ({
      batchIndex: i,
      testCaseIds: new Set(),
      estimatedDuration: 0,
      testCount: 0,
      containsFlakyTests: false,
      tags: [],
      confidence: 0,
      currentDuration: 0,
    }));

    // Assign each test to the least loaded batch
    for (const test of sorted) {
      // Find batch with minimum current duration
      const minBatch = batches.reduce((min, batch) =>
        batch.currentDuration < min.currentDuration ? batch : min
      );

      minBatch.testCaseIds.add(test.testCaseId);
      minBatch.currentDuration += test.estimatedDuration;
      minBatch.testCount++;
      if (test.isFlaky) {
        minBatch.containsFlakyTests = true;
      }
      for (const tag of test.tags) {
        if (!minBatch.tags.includes(tag)) {
          minBatch.tags.push(tag);
        }
      }
    }

    // Finalize batches
    return this.finalizeBatches(batches, tests, config);
  }

  /**
   * Strategy: Cluster tests by duration (fast together, slow together)
   */
  private clusterByDuration(
    tests: TestMetadata[],
    config: TestOptimizationConfig
  ): TestBatch[] {
    // Sort by duration
    const sorted = [...tests].sort((a, b) => a.estimatedDuration - b.estimatedDuration);

    // Divide into clusters based on duration percentiles
    const clusterSize = Math.ceil(sorted.length / config.targetWorkers);
    const batches: OptimizedBatch[] = [];

    for (let i = 0; i < config.targetWorkers; i++) {
      const start = i * clusterSize;
      const end = Math.min((i + 1) * clusterSize, sorted.length);
      const cluster = sorted.slice(start, end);

      if (cluster.length === 0) continue;

      const testCaseIds = new Set(cluster.map((t) => t.testCaseId));
      const estimatedDuration = cluster.reduce((sum, t) => sum + t.estimatedDuration, 0);
      const allTags = new Set(cluster.flatMap((t) => t.tags));

      batches.push({
        batchIndex: i,
        testCaseIds,
        estimatedDuration,
        testCount: cluster.length,
        containsFlakyTests: cluster.some((t) => t.isFlaky),
        tags: Array.from(allTags),
        confidence: 0,
        currentDuration: estimatedDuration,
      });
    }

    return this.finalizeBatches(batches, tests, config);
  }

  /**
   * Strategy: Group tests by tags
   */
  private groupByTags(
    tests: TestMetadata[],
    config: TestOptimizationConfig
  ): TestBatch[] {
    // Collect unique tags
    const allTags = new Set<string>();
    for (const test of tests) {
      for (const tag of test.tags) {
        allTags.add(tag);
      }
    }

    // If no tags, fall back to duration balancing
    if (allTags.size === 0) {
      return this.balanceByDuration(tests, config);
    }

    // Create tag groups
    const tagGroups = new Map<string, TestMetadata[]>();
    const tagsArray = Array.from(allTags);
    for (const tag of tagsArray) {
      tagGroups.set(tag, []);
    }
    tagGroups.set('untagged', []);

    for (const test of tests) {
      if (test.tags.length === 0) {
        tagGroups.get('untagged')!.push(test);
      } else {
        // Assign to first matching tag (simple approach)
        const assigned = new Set<string>();
        for (const tag of test.tags) {
          if (!assigned.has(tag)) {
            tagGroups.get(tag)?.push(test);
            assigned.add(tag);
            break; // Only assign to one tag group
          }
        }
        if (assigned.size === 0) {
          tagGroups.get('untagged')!.push(test);
        }
      }
    }

    // Merge smaller groups to target worker count
    let groups = Array.from(tagGroups.values()).filter((g) => g.length > 0);

    while (groups.length > config.targetWorkers) {
      // Find two smallest groups and merge them
      groups.sort((a, b) => a.length - b.length);
      const merged = [...groups[0], ...groups[1]];
      groups = [merged, ...groups.slice(2)];
    }

    // Convert to batches
    const batches: OptimizedBatch[] = groups.map((group, i) => {
      const testCaseIds = new Set(group.map((t) => t.testCaseId));
      const estimatedDuration = group.reduce((sum, t) => sum + t.estimatedDuration, 0);
      const allTags = new Set(group.flatMap((t) => t.tags));

      return {
        batchIndex: i,
        testCaseIds,
        estimatedDuration,
        testCount: group.length,
        containsFlakyTests: group.some((t) => t.isFlaky),
        tags: Array.from(allTags),
        confidence: 0,
        currentDuration: estimatedDuration,
      };
    });

    return this.finalizeBatches(batches, tests, config);
  }

  /**
   * Strategy: Isolate flaky tests into separate batches
   */
  private isolateFlakyTests(
    tests: TestMetadata[],
    config: TestOptimizationConfig
  ): TestBatch[] {
    const flakyTests = tests.filter((t) => t.isFlaky);
    const stableTests = tests.filter((t) => !t.isFlaky);

    const batches: TestBatch[] = [];

    // Create separate batch for flaky tests if any exist
    if (flakyTests.length > 0) {
      const flakyIds = new Set(flakyTests.map((t) => t.testCaseId));
      const flakyDuration = flakyTests.reduce((sum, t) => sum + t.estimatedDuration, 0);
      const flakyTags = new Set(flakyTests.flatMap((t) => t.tags));

      batches.push({
        batchIndex: 0,
        testCaseIds: Array.from(flakyIds),
        estimatedDuration: flakyDuration,
        testCount: flakyTests.length,
        containsFlakyTests: true,
        tags: Array.from(flakyTags),
        confidence: 0,
        platform: undefined,
      });
    }

    // Distribute stable tests across remaining workers
    const remainingWorkers = config.targetWorkers - (flakyTests.length > 0 ? 1 : 0);
    if (stableTests.length > 0 && remainingWorkers > 0) {
      const stableBatches = this.balanceByDuration(stableTests, {
        ...config,
        targetWorkers: remainingWorkers,
      });

      for (const batch of stableBatches) {
        batches.push({
          ...batch,
          batchIndex: batches.length,
        });
      }
    }

    return batches;
  }

  /**
   * Strategy: Hybrid approach combining multiple strategies
   */
  private hybridStrategy(
    tests: TestMetadata[],
    config: TestOptimizationConfig
  ): TestBatch[] {
    // Separate flaky tests first
    const flakyTests = tests.filter((t) => t.isFlaky);
    const stableTests = tests.filter((t) => !t.isFlaky);

    const batches: TestBatch[] = [];
    let batchIndex = 0;

    // Put flaky tests in a dedicated batch
    if (flakyTests.length > 0) {
      const flakyIds = new Set(flakyTests.map((t) => t.testCaseId));
      const flakyDuration = flakyTests.reduce((sum, t) => sum + t.estimatedDuration, 0);
      const flakyTags = new Set(flakyTests.flatMap((t) => t.tags));

      batches.push({
        batchIndex: batchIndex++,
        testCaseIds: Array.from(flakyIds),
        estimatedDuration: flakyDuration,
        testCount: flakyTests.length,
        containsFlakyTests: true,
        tags: Array.from(flakyTags),
        confidence: 0,
        platform: undefined,
      });
    }

    // Cluster stable tests by duration (fast/low variance together)
    const lowVarianceTests = stableTests.filter((t) => t.variance / t.estimatedDuration < 0.5);
    const highVarianceTests = stableTests.filter((t) => t.variance / t.estimatedDuration >= 0.5);

    // Process predictable tests with duration clustering
    if (lowVarianceTests.length > 0) {
      const clustered = this.clusterByDuration(lowVarianceTests, {
        ...config,
        targetWorkers: Math.max(1, Math.floor(config.targetWorkers / 2)),
      });

      for (const batch of clustered) {
        batches.push({
          ...batch,
          batchIndex: batchIndex++,
        });
      }
    }

    // Process unpredictable tests with balanced distribution
    if (highVarianceTests.length > 0) {
      const balanced = this.balanceByDuration(highVarianceTests, {
        ...config,
        targetWorkers: Math.max(1, Math.ceil(config.targetWorkers / 2)),
      });

      for (const batch of balanced) {
        batches.push({
          ...batch,
          batchIndex: batchIndex++,
        });
      }
    }

    return batches;
  }

  /**
   * Segregate batches by platform if needed
   */
  private segregateByPlatform(
    batches: TestBatch[],
    testMetadata: TestMetadata[]
  ): TestBatch[] {
    const metadataMap = new Map(testMetadata.map((t) => [t.testCaseId, t]));

    // Check if we have platform-specific tests
    const hasPlatformTests = testMetadata.some((t) => t.platform);
    if (!hasPlatformTests) {
      return batches;
    }

    const result: TestBatch[] = [];
    let batchIndex = 0;

    for (const batch of batches) {
      const iosTests: string[] = [];
      const androidTests: string[] = [];
      const platformAgnosticTests: string[] = [];

      for (const testCaseId of batch.testCaseIds) {
        const meta = metadataMap.get(testCaseId);
        if (!meta?.platform) {
          platformAgnosticTests.push(testCaseId);
        } else if (meta.platform === 'ios') {
          iosTests.push(testCaseId);
        } else {
          androidTests.push(testCaseId);
        }
      }

      // Create separate batches for each platform
      if (iosTests.length > 0) {
        result.push({
          ...batch,
          batchIndex: batchIndex++,
          testCaseIds: iosTests,
          platform: 'ios',
          testCount: iosTests.length,
          estimatedDuration: iosTests.reduce(
            (sum, id) => sum + (metadataMap.get(id)?.estimatedDuration || 0),
            0
          ),
        });
      }

      if (androidTests.length > 0) {
        result.push({
          ...batch,
          batchIndex: batchIndex++,
          testCaseIds: androidTests,
          platform: 'android',
          testCount: androidTests.length,
          estimatedDuration: androidTests.reduce(
            (sum, id) => sum + (metadataMap.get(id)?.estimatedDuration || 0),
            0
          ),
        });
      }

      if (platformAgnosticTests.length > 0) {
        result.push({
          ...batch,
          batchIndex: batchIndex++,
          testCaseIds: platformAgnosticTests,
          platform: undefined,
          testCount: platformAgnosticTests.length,
          estimatedDuration: platformAgnosticTests.reduce(
            (sum, id) => sum + (metadataMap.get(id)?.estimatedDuration || 0),
            0
          ),
        });
      }
    }

    return result;
  }

  /**
   * Finalize batches with confidence scores
   */
  private finalizeBatches(
    batches: OptimizedBatch[],
    tests: TestMetadata[],
    config: TestOptimizationConfig
  ): TestBatch[] {
    return batches
      .filter((b) => b.testCaseIds.size > 0)
      .map((batch) => {
        // Calculate confidence based on history coverage
        const batchTests = tests.filter((t) => batch.testCaseIds.has(t.testCaseId));
        const withHistory = batchTests.filter((t) => t.hasHistory).length;
        const confidence = batchTests.length > 0 ? withHistory / batchTests.length : 0;

        return {
          batchIndex: batch.batchIndex,
          testCaseIds: Array.from(batch.testCaseIds).slice(),
          estimatedDuration: batch.currentDuration,
          testCount: batch.testCount,
          containsFlakyTests: batch.containsFlakyTests,
          tags: batch.tags,
          confidence,
          platform: batch.platform,
        };
      });
  }

  /**
   * Validate optimization input
   */
  private validateInput(
    testCaseIds: string[],
    config: TestOptimizationConfig
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!testCaseIds || testCaseIds.length === 0) {
      errors.push('No test cases provided for optimization');
    }

    if (config.targetWorkers < 1) {
      errors.push('Target workers must be at least 1');
    }

    if (config.targetWorkers > 20) {
      warnings.push('High worker count may not provide optimal performance');
    }

    if (config.minHistorySamples < 1) {
      warnings.push('Min history samples should be at least 1 for accurate estimation');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<TestOptimizationConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info({ config: this.config }, 'Optimizer configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): TestOptimizationConfig {
    return { ...this.config };
  }
}

/**
 * Global optimizer instance
 */
let globalOptimizer: TestGroupingOptimizer | null = null;

/**
 * Get the global test grouping optimizer instance
 */
export function getGlobalOptimizer(
  config?: Partial<TestOptimizationConfig>
): TestGroupingOptimizer {
  if (!globalOptimizer) {
    globalOptimizer = new TestGroupingOptimizer(config);
  } else if (config) {
    globalOptimizer.updateConfig(config);
  }
  return globalOptimizer;
}

/**
 * Reset the global optimizer
 */
export function resetGlobalOptimizer(): void {
  globalOptimizer = null;
}
