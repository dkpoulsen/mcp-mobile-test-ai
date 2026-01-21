/**
 * Test History Tracker
 * Tracks test execution history for optimization purposes
 * Collects duration data, flakiness information, and resource usage patterns
 */

import { createModuleLogger } from '../../utils/logger.js';
import { getPrismaClient } from '../../database/client.js';
import type {
  TestExecutionRecord,
  TestStatisticsSummary,
  ResourceRequirement,
} from './types.js';

const logger = createModuleLogger('test-history-tracker');

/**
 * In-memory cache of test execution history
 * Maps testCaseId -> array of execution records
 */
class HistoryCache {
  private _cache: Map<string, TestExecutionRecord[]> = new Map();
  private maxEntriesPerTest: number;

  constructor(maxEntriesPerTest: number = 100) {
    this.maxEntriesPerTest = maxEntriesPerTest;
  }

  get cache(): Map<string, TestExecutionRecord[]> {
    return this._cache;
  }

  get(testCaseId: string): TestExecutionRecord[] {
    return this._cache.get(testCaseId) || [];
  }

  set(testCaseId: string, records: TestExecutionRecord[]): void {
    // Keep only the most recent records
    const sorted = records.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const trimmed = sorted.slice(0, this.maxEntriesPerTest);
    this._cache.set(testCaseId, trimmed);
  }

  add(testCaseId: string, record: TestExecutionRecord): void {
    const existing = this.get(testCaseId);
    existing.push(record);
    this.set(testCaseId, existing);
  }

  has(testCaseId: string): boolean {
    return this._cache.has(testCaseId) && this._cache.get(testCaseId)!.length > 0;
  }

  clear(): void {
    this._cache.clear();
  }

  size(): number {
    return this._cache.size;
  }

  entries(): Array<[string, TestExecutionRecord[]]> {
    return Array.from(this._cache.entries());
  }

  values(): Array<TestExecutionRecord[]> {
    return Array.from(this._cache.values());
  }
}

/**
 * Test History Tracker class
 */
export class TestHistoryTracker {
  private historyCache: HistoryCache;
  private resourceCache: Map<string, ResourceRequirement> = new Map();

  constructor(
    private maxHistorySamples: number = 100,
    private flakinessThreshold: number = 0.3
  ) {
    this.historyCache = new HistoryCache(maxHistorySamples);
  }

  /**
   * Record a test execution for history tracking
   */
  async recordExecution(
    testRunId: string,
    testCaseId: string,
    duration: number,
    status: 'PASSED' | 'FAILED' | 'SKIPPED' | 'TIMEOUT'
  ): Promise<void> {
    const prisma = getPrismaClient();

    try {
      // Get test case details
      const testCase = await prisma.testCase.findUnique({
        where: { id: testCaseId },
        include: { testSuite: true },
      });

      if (!testCase) {
        logger.warn({ testCaseId }, 'Test case not found for history tracking');
        return;
      }

      // Get recent history for this test
      const recentHistory = this.historyCache.get(testCaseId);

      // Calculate statistics
      const allDurations = [...recentHistory.map((r) => r.duration), duration];
      const avgDuration = this.calculateMean(allDurations);
      const variance = this.calculateVariance(allDurations, avgDuration);

      // Determine if test is flaky
      const recentResults = [...recentHistory.slice(-10).map((r) => r.status), status];
      const failureRate = recentResults.filter((s) => s === 'FAILED').length / recentResults.length;
      const isFlaky = failureRate >= this.flakinessThreshold;

      // Create execution record
      const record: TestExecutionRecord = {
        testCaseId,
        testName: testCase.name,
        testSuiteId: testCase.testSuiteId,
        duration,
        status,
        timestamp: new Date(),
        tags: testCase.tags || [],
        isFlaky,
        avgDuration,
        durationVariance: Math.sqrt(variance),
        sampleCount: allDurations.length,
      };

      // Update cache
      this.historyCache.add(testCaseId, record);

      logger.debug(
        {
          testCaseId,
          duration,
          status,
          avgDuration,
          isFlaky,
          sampleCount: record.sampleCount,
        },
        'Recorded test execution'
      );
    } catch (error) {
      logger.error({ error, testCaseId, testRunId }, 'Failed to record test execution');
    }
  }

  /**
   * Bulk record executions from a test run
   */
  async recordTestRun(testRunId: string): Promise<void> {
    const prisma = getPrismaClient();

    try {
      const testRun = await prisma.testRun.findUnique({
        where: { id: testRunId },
        include: {
          testResults: {
            include: { testCase: { include: { testSuite: true } } },
          },
        },
      });

      if (!testRun) {
        logger.warn({ testRunId }, 'Test run not found for history tracking');
        return;
      }

      for (const result of testRun.testResults) {
        await this.recordExecution(
          testRunId,
          result.testCaseId,
          result.duration,
          result.status as any
        );
      }

      logger.info(
        {
          testRunId,
          resultsCount: testRun.testResults.length,
        },
        'Recorded test run executions'
      );
    } catch (error) {
      logger.error({ error, testRunId }, 'Failed to record test run');
    }
  }

  /**
   * Get execution history for a test case
   */
  getHistory(testCaseId: string): TestExecutionRecord[] {
    return this.historyCache.get(testCaseId);
  }

  /**
   * Get estimated duration for a test case
   * Returns the average of recent executions, or a default if no history
   */
  getEstimatedDuration(testCaseId: string, defaultDuration: number = 5000): number {
    const history = this.historyCache.get(testCaseId);
    if (history.length === 0) {
      return defaultDuration;
    }
    return history[history.length - 1].avgDuration;
  }

  /**
   * Check if a test is flaky based on history
   */
  isTestFlaky(testCaseId: string): boolean {
    const history = this.historyCache.get(testCaseId);
    if (history.length === 0) {
      return false;
    }
    return history[history.length - 1].isFlaky;
  }

  /**
   * Get all flaky tests
   */
  getFlakyTests(): Map<string, TestExecutionRecord> {
    const flaky = new Map<string, TestExecutionRecord>();
    const entries = this.historyCache.entries();
    for (const [id, records] of entries) {
      if (records.length > 0 && records[records.length - 1].isFlaky) {
        flaky.set(id, records[records.length - 1]);
      }
    }
    return flaky;
  }

  /**
   * Get statistics for all tracked tests
   */
  getStatistics(): TestStatisticsSummary {
    const allRecords: TestExecutionRecord[] = [];
    let flakyCount = 0;

    const values = this.historyCache.values();
    for (const records of values) {
      allRecords.push(...records);
      if (records.length > 0 && records[records.length - 1].isFlaky) {
        flakyCount++;
      }
    }

    if (allRecords.length === 0) {
      return {
        totalExecutions: 0,
        testsWithDataHistory: 0,
        flakyTests: 0,
        avgDuration: 0,
        medianDuration: 0,
        p95Duration: 0,
        minDuration: 0,
        maxDuration: 0,
      };
    }

    const durations = allRecords.map((r) => r.duration).sort((a, b) => a - b);

    return {
      totalExecutions: allRecords.length,
      testsWithDataHistory: this.historyCache.size(),
      flakyTests: flakyCount,
      avgDuration: this.calculateMean(durations),
      medianDuration: durations[Math.floor(durations.length / 2)],
      p95Duration: durations[Math.floor(durations.length * 0.95)],
      minDuration: durations[0],
      maxDuration: durations[durations.length - 1],
    };
  }

  /**
   * Load historical data from database
   */
  async loadFromDatabase(limit: number = 1000): Promise<void> {
    const prisma = getPrismaClient();

    try {
      // Get recent test results
      const results = await prisma.testResult.findMany({
        where: {
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
        },
        include: {
          testCase: {
            include: { testSuite: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      // Load into cache grouped by test case
      const byTestCase = new Map<string, typeof results>();
      for (const result of results) {
        const testCaseId = result.testCaseId;
        if (!byTestCase.has(testCaseId)) {
          byTestCase.set(testCaseId, []);
        }
        byTestCase.get(testCaseId)!.push(result);
      }

      // Process each test case
      const entries = Array.from(byTestCase.entries());
      for (const [testCaseId, testCaseResults] of entries) {
        const sorted = testCaseResults.sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
        );

        const records: TestExecutionRecord[] = [];
        const runningDurations: number[] = [];
        const runningStatus: ('PASSED' | 'FAILED' | 'SKIPPED' | 'TIMEOUT')[] = [];

        for (const result of sorted) {
          runningDurations.push(result.duration);
          runningStatus.push(result.status as any);

          const avgDuration = this.calculateMean(runningDurations);
          const variance = this.calculateVariance(runningDurations, avgDuration);

          const failureRate =
            runningStatus.filter((s) => s === 'FAILED').length / runningStatus.length;

          records.push({
            testCaseId,
            testName: result.testCase.name,
            testSuiteId: result.testCase.testSuiteId,
            duration: result.duration,
            status: result.status as any,
            timestamp: result.createdAt,
            tags: result.testCase.tags || [],
            isFlaky: failureRate >= this.flakinessThreshold,
            avgDuration,
            durationVariance: Math.sqrt(variance),
            sampleCount: runningDurations.length,
          });
        }

        this.historyCache.set(testCaseId, records);
      }

      logger.info(
        {
          loadedResults: results.length,
          uniqueTests: byTestCase.size,
        },
        'Loaded historical data from database'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to load historical data from database');
    }
  }

  /**
   * Set resource requirement for a test
   */
  setResourceRequirement(requirement: ResourceRequirement): void {
    this.resourceCache.set(requirement.testCaseId, requirement);
  }

  /**
   * Get resource requirement for a test
   */
  getResourceRequirement(testCaseId: string): ResourceRequirement | undefined {
    return this.resourceCache.get(testCaseId);
  }

  /**
   * Clear all cached history
   */
  clearCache(): void {
    this.historyCache.clear();
    this.resourceCache.clear();
    logger.info('Cleared test history cache');
  }

  /**
   * Calculate mean of numbers
   */
  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * Calculate variance of numbers
   */
  private calculateVariance(values: number[], mean: number): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  }

  /**
   * Get the cache size
   */
  getCacheSize(): number {
    return this.historyCache.size();
  }
}

/**
 * Global test history tracker instance
 */
let globalHistoryTracker: TestHistoryTracker | null = null;

/**
 * Get the global test history tracker instance
 */
export function getGlobalHistoryTracker(): TestHistoryTracker {
  if (!globalHistoryTracker) {
    globalHistoryTracker = new TestHistoryTracker();
  }
  return globalHistoryTracker;
}

/**
 * Reset the global history tracker
 */
export function resetGlobalHistoryTracker(): void {
  globalHistoryTracker = null;
}
