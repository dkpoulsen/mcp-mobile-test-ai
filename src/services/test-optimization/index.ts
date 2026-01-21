/**
 * Test Optimization Service
 * Main entry point for test grouping and optimization features
 */

export * from './types.js';
export * from './test-history-tracker.js';
export * from './test-grouping-optimizer.js';

import { createModuleLogger } from '../../utils/logger.js';
import {
  getGlobalHistoryTracker,
  type TestHistoryTracker,
} from './test-history-tracker.js';
import {
  getGlobalOptimizer,
  type TestGroupingOptimizer,
} from './test-grouping-optimizer.js';
import type {
  GroupingStrategy,
  TestOptimizationConfig,
  OptimizationResult,
  TestStatisticsSummary,
} from './types.js';

const logger = createModuleLogger('test-optimization-service');

/**
 * Test Optimization Service
 * Provides high-level API for test grouping optimization
 */
export class TestOptimizationService {
  private historyTracker: TestHistoryTracker;
  private optimizer: TestGroupingOptimizer;

  constructor() {
    this.historyTracker = getGlobalHistoryTracker();
    this.optimizer = getGlobalOptimizer();
  }

  /**
   * Initialize the optimization service by loading historical data
   */
  async initialize(): Promise<void> {
    logger.info('Initializing test optimization service');
    await this.historyTracker.loadFromDatabase();
    logger.info('Test optimization service initialized');
  }

  /**
   * Get optimal test batches for parallel execution
   */
  async getOptimalBatches(
    testCaseIds: string[],
    config?: Partial<TestOptimizationConfig>
  ): Promise<OptimizationResult> {
    return this.optimizer.optimizeTestExecution(testCaseIds, config);
  }

  /**
   * Record test execution for learning
   */
  async recordExecution(
    testRunId: string,
    testCaseId: string,
    duration: number,
    status: 'PASSED' | 'FAILED' | 'SKIPPED' | 'TIMEOUT'
  ): Promise<void> {
    return this.historyTracker.recordExecution(
      testRunId,
      testCaseId,
      duration,
      status
    );
  }

  /**
   * Record all executions from a test run
   */
  async recordTestRun(testRunId: string): Promise<void> {
    return this.historyTracker.recordTestRun(testRunId);
  }

  /**
   * Get statistics about tracked test history
   */
  getStatistics(): TestStatisticsSummary {
    return this.historyTracker.getStatistics();
  }

  /**
   * Get estimated duration for a test case
   */
  getEstimatedDuration(testCaseId: string, defaultDuration?: number): number {
    return this.historyTracker.getEstimatedDuration(testCaseId, defaultDuration);
  }

  /**
   * Check if a test is flaky
   */
  isTestFlaky(testCaseId: string): boolean {
    return this.historyTracker.isTestFlaky(testCaseId);
  }

  /**
   * Update optimization configuration
   */
  updateConfig(config: Partial<TestOptimizationConfig>): void {
    this.optimizer.updateConfig(config);
  }

  /**
   * Get current configuration
   */
  getConfig(): TestOptimizationConfig {
    return this.optimizer.getConfig();
  }
}

/**
 * Global service instance
 */
let globalService: TestOptimizationService | null = null;

/**
 * Get the global test optimization service instance
 */
export function getTestOptimizationService(): TestOptimizationService {
  if (!globalService) {
    globalService = new TestOptimizationService();
  }
  return globalService;
}

/**
 * Reset the global service
 */
export function resetTestOptimizationService(): void {
  globalService = null;
}
