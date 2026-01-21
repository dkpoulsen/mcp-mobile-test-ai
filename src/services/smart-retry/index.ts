/**
 * Smart Retry Strategy Service
 * Main service that orchestrates intelligent test retries with learning
 */

import type {
  FailurePattern,
  RetryPlan,
  RetryResult,
  RetryAttempt,
  SmartRetryConfig,
  RetryAnalytics,
} from './types.js';
import {
  FailureCategory,
  RetryStrategyType,
} from './types.js';
import { getFailureClassifier, type FailureClassifier } from './failure-classifier.js';
import { getRetryPlanner, type RetryPlanner } from './retry-planner.js';
import { createModuleLogger } from '../../utils/logger.js';
import type { Logger } from '../../utils/logger.js';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/client.js';

const logger: Logger = createModuleLogger('smart-retry');

/**
 * Smart Retry Strategy Service
 *
 * Main service that:
 * 1. Classifies test failures
 * 2. Generates intelligent retry plans
 * 3. Executes retry attempts with different strategies
 * 4. Learns from retry outcomes
 */
export class SmartRetryStrategy {
  private classifier: FailureClassifier;
  private planner: RetryPlanner;
  private prisma: PrismaClient;
  private config: SmartRetryConfig;
  private analytics: Map<string, RetryAnalytics> = new Map();

  constructor(config?: Partial<SmartRetryConfig>) {
    this.classifier = getFailureClassifier();
    this.planner = getRetryPlanner(config);
    this.prisma = getPrismaClient();
    this.config = this.planner.getConfig();

    logger.info('Smart retry strategy service initialized', {
      enabled: this.config.enabled,
      learningEnabled: this.config.enableLearning,
      maxRetries: this.config.maxRetries,
    });
  }

  /**
   * Analyze a test failure and determine if/how to retry
   */
  async analyzeFailure(testCaseId: string, error: Error): Promise<{
    shouldRetry: boolean;
    retryPlan?: RetryPlan;
    failurePattern: FailurePattern;
  }> {
    const errorMessage = error.message || 'Unknown error';
    const stackTrace = error.stack;

    // Classify the failure
    const failurePattern = this.classifier.classify(errorMessage, stackTrace);

    logger.info('Failure analyzed', {
      testCaseId,
      category: failurePattern.category,
      confidence: failurePattern.confidence,
      suggestedStrategy: failurePattern.suggestedStrategy,
    });

    // Check if failure is retryable
    const isRetryable = this.classifier.isRetryable(
      failurePattern.category,
      this.config.nonRetryableCategories
    );

    if (!isRetryable) {
      logger.info('Failure is not retryable', {
        testCaseId,
        category: failurePattern.category,
      });
      return {
        shouldRetry: false,
        failurePattern,
      };
    }

    // Create retry plan
    const retryPlan = this.planner.createRetryPlan(testCaseId, failurePattern);

    if (!retryPlan) {
      logger.info('No retry plan created', { testCaseId });
      return {
        shouldRetry: false,
        failurePattern,
      };
    }

    return {
      shouldRetry: true,
      retryPlan,
      failurePattern,
    };
  }

  /**
   * Execute a retry attempt
   */
  async executeRetry(
    retryFn: () => Promise<void>,
    attempt: RetryAttempt,
    context: {
      testCaseId: string;
      testRunId: string;
    }
  ): Promise<RetryResult> {
    const startTime = Date.now();
    let success = false;
    let error: string | undefined;

    logger.info('Executing retry attempt', {
      testCaseId: context.testCaseId,
      attemptNumber: attempt.attemptNumber,
      strategy: attempt.strategy,
      delayMs: attempt.delayMs,
    });

    try {
      // Apply pre-retry action if configured
      await this.applyPreRetryAction(attempt.preRetryAction, context);

      // Wait for configured delay
      if (attempt.delayMs > 0) {
        await this.delay(attempt.delayMs);
      }

      // Execute the retry function
      await retryFn();
      success = true;

      logger.info('Retry attempt succeeded', {
        testCaseId: context.testCaseId,
        attemptNumber: attempt.attemptNumber,
        strategy: attempt.strategy,
        durationMs: Date.now() - startTime,
      });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      success = false;

      logger.warn('Retry attempt failed', {
        testCaseId: context.testCaseId,
        attemptNumber: attempt.attemptNumber,
        strategy: attempt.strategy,
        error,
      });
    }

    const result: RetryResult = {
      attemptNumber: attempt.attemptNumber,
      strategy: attempt.strategy,
      success,
      durationMs: Date.now() - startTime,
      error,
    };

    // Record result for learning
    await this.recordResult(context.testCaseId, result);

    return result;
  }

  /**
   * Execute a full retry plan
   */
  async executeRetryPlan(
    testCaseId: string,
    testRunId: string,
    retryPlan: RetryPlan,
    retryFn: (attempt: RetryAttempt) => Promise<void>
  ): Promise<{
    success: boolean;
    finalAttempt: number;
    results: RetryResult[];
  }> {
    const results: RetryResult[] = [];

    logger.info('Executing retry plan', {
      testCaseId,
      testRunId,
      attemptCount: retryPlan.attempts.length,
      estimatedDurationMs: retryPlan.estimatedTotalDurationMs,
    });

    for (const attempt of retryPlan.attempts) {
      const result = await this.executeRetry(
        () => retryFn(attempt),
        attempt,
        { testCaseId, testRunId }
      );

      results.push(result);

      if (result.success) {
        logger.info('Retry plan succeeded', {
          testCaseId,
          attemptNumber: attempt.attemptNumber,
          strategy: attempt.strategy,
        });

        // Record successful strategy for learning
        this.planner.recordRetryResult(
          testCaseId,
          retryPlan.failurePattern.category,
          attempt.strategy,
          true,
          result.durationMs
        );

        return {
          success: true,
          finalAttempt: attempt.attemptNumber,
          results,
        };
      }

      // Record failed attempt for learning
      this.planner.recordRetryResult(
        testCaseId,
        retryPlan.failurePattern.category,
        attempt.strategy,
        false,
        result.durationMs
      );
    }

    logger.warn('Retry plan exhausted without success', {
      testCaseId,
      totalAttempts: results.length,
    });

    return {
      success: false,
      finalAttempt: retryPlan.attempts.length - 1,
      results,
    };
  }

  /**
   * Get retry analytics for a test case
   */
  async getRetryAnalytics(testCaseId: string): Promise<RetryAnalytics | null> {
    // Try memory cache first
    const cached = this.analytics.get(testCaseId);
    if (cached) {
      return cached;
    }

    // Load from database
    const dbResults = await this.prisma.testResult.findMany({
      where: {
        testCaseId,
        status: 'PASSED', // Only count retries that ultimately passed
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    if (dbResults.length === 0) {
      return null;
    }

    // Calculate analytics
    const strategyResults = new Map<RetryStrategyType, {
      attempts: number;
      successes: number;
      avgDurationMs: number;
    }>();

    let totalRetries = 0;
    let successfulRetries = 0;

    // In a real implementation, we'd store retry metadata
    // For now, return basic analytics
    const analytics: RetryAnalytics = {
      testCaseId,
      totalRetries,
      successfulRetries,
      strategyResults,
      lastUpdated: new Date(),
    };

    this.analytics.set(testCaseId, analytics);
    return analytics;
  }

  /**
   * Get all learned strategies for a test case
   */
  getLearnedStrategies(testCaseId: string) {
    return this.planner.getLearnedStrategies().get(testCaseId);
  }

  /**
   * Load learned strategies from database
   */
  async loadPersistedStrategies(): Promise<void> {
    try {
      // In a real implementation, we'd load from a RetryAnalytics table
      // For now, we'll use the FlakyTest data to infer strategies
      const flakyTests = await this.prisma.flakyTest.findMany({
        where: {
          status: { in: ['DETECTED', 'MONITORING', 'QUARANTINED'] },
        },
        include: {
          testCase: true,
        },
      });

      logger.info('Loaded flaky test data for strategy learning', {
        count: flakyTests.length,
      });
    } catch (error) {
      logger.error('Failed to load persisted strategies', { error });
    }
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<SmartRetryConfig>): void {
    this.config = { ...this.config, ...updates };
    this.planner.updateConfig(updates);
    logger.info('Smart retry config updated', updates);
  }

  /**
   * Get current configuration
   */
  getConfig(): SmartRetryConfig {
    return { ...this.config };
  }

  /**
   * Reset learning data
   */
  resetLearning(): void {
    this.planner.resetLearning();
    this.analytics.clear();
    logger.info('Reset all learning data');
  }

  /**
   * Record retry result for analytics and learning
   */
  private async recordResult(testCaseId: string, result: RetryResult): Promise<void> {
    let analytics = this.analytics.get(testCaseId);

    if (!analytics) {
      analytics = {
        testCaseId,
        totalRetries: 0,
        successfulRetries: 0,
        strategyResults: new Map(),
        lastUpdated: new Date(),
      };
      this.analytics.set(testCaseId, analytics);
    }

    analytics.totalRetries++;
    if (result.success) {
      analytics.successfulRetries++;
    }

    let strategyData = analytics.strategyResults.get(result.strategy);
    if (!strategyData) {
      strategyData = {
        attempts: 0,
        successes: 0,
        avgDurationMs: 0,
      };
      analytics.strategyResults.set(result.strategy, strategyData);
    }

    strategyData.attempts++;
    if (result.success) {
      strategyData.successes++;
    }

    // Update average duration
    const totalDuration = strategyData.avgDurationMs * (strategyData.attempts - 1) + result.durationMs;
    strategyData.avgDurationMs = totalDuration / strategyData.attempts;

    analytics.lastUpdated = new Date();

    // Update most successful strategy
    let maxSuccessRate = 0;
    for (const [strategy, data] of analytics.strategyResults) {
      const successRate = data.successes / data.attempts;
      if (successRate > maxSuccessRate && data.attempts >= 3) {
        maxSuccessRate = successRate;
        analytics.mostSuccessfulStrategy = strategy;
      }
    }
  }

  /**
   * Apply pre-retry action
   */
  private async applyPreRetryAction(
    action: string | undefined,
    context: { testCaseId: string; testRunId: string }
  ): Promise<void> {
    if (!action || action === 'NONE') {
      return;
    }

    logger.debug('Applying pre-retry action', {
      action,
      testCaseId: context.testCaseId,
    });

    // In a real implementation, these would interact with the device/session
    // For now, we just log them
    switch (action) {
      case 'REFRESH':
      case 'WAIT_FOR_LOAD':
      case 'SCROLL_INTO_VIEW':
      case 'NAVIGATE_BACK':
      case 'CLEAR_CACHE':
      case 'RESTART_APP':
      case 'DISMISS_ALERTS':
        // Actions would be executed here via the device session manager
        break;
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get failure classifier instance
   */
  getClassifier(): FailureClassifier {
    return this.classifier;
  }

  /**
   * Get retry planner instance
   */
  getPlanner(): RetryPlanner {
    return this.planner;
  }
}

/**
 * Global smart retry strategy instance
 */
let smartRetryInstance: SmartRetryStrategy | undefined;

/**
 * Get or create the smart retry strategy instance
 */
export function getSmartRetryStrategy(config?: Partial<SmartRetryConfig>): SmartRetryStrategy {
  if (!smartRetryInstance) {
    smartRetryInstance = new SmartRetryStrategy(config);
  }
  return smartRetryInstance;
}

/**
 * Reset the smart retry strategy instance
 */
export function resetSmartRetryStrategy(): void {
  smartRetryInstance = undefined;
}
