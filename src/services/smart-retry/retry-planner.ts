/**
 * Retry Planner
 * Creates intelligent retry plans based on failure patterns and historical data
 */

import type {
  FailurePattern,
  RetryAttempt,
  RetryPlan,
  SmartRetryConfig,
  LearnedRetryStrategy,
  LocatorAlternative,
} from './types.js';
import {
  FailureCategory,
  RetryStrategyType,
  PreRetryAction,
} from './types.js';
import { createModuleLogger } from '../../utils/logger.js';
import type { Logger } from '../../utils/logger.js';

// For backward compatibility with existing code
const Strategy = RetryStrategyType;
const PreAction = PreRetryAction;

const logger: Logger = createModuleLogger('smart-retry:retry-planner');

/**
 * Default configuration for retry planner
 */
const DEFAULT_CONFIG: SmartRetryConfig = {
  enabled: true,
  maxRetries: 3,
  baseRetryDelayMs: 1000,
  maxRetryDelayMs: 30000,
  backoffMultiplier: 2,
  enableLearning: true,
  minLearningDataPoints: 3,
  learnedStrategySuccessThreshold: 0.5,
  enableDeviceSwitching: false,
  enableLocatorAlternatives: true,
  nonRetryableCategories: [
    FailureCategory.ASSERTION,
    FailureCategory.CRASH,
  ],
};

/**
 * Retry Planner class
 * Generates retry plans based on failure patterns and learned strategies
 */
export class RetryPlanner {
  private config: SmartRetryConfig;
  private learnedStrategies: Map<string, LearnedRetryStrategy[]> = new Map();

  constructor(config?: Partial<SmartRetryConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.info('Retry planner initialized', {
      enabled: this.config.enabled,
      maxRetries: this.config.maxRetries,
      learningEnabled: this.config.enableLearning,
    });
  }

  /**
   * Create a retry plan for a failing test
   */
  createRetryPlan(
    testCaseId: string,
    failurePattern: FailurePattern,
    currentAttempt: number = 0
  ): RetryPlan | null {
    if (!this.config.enabled) {
      logger.debug('Smart retry disabled, no plan created');
      return null;
    }

    // Check if failure is retryable
    if (this.config.nonRetryableCategories.includes(failurePattern.category)) {
      logger.info('Failure category is non-retryable', {
        category: failurePattern.category,
      });
      return null;
    }

    // Get learned strategy if available
    const learned = this.getLearnedStrategy(testCaseId, failurePattern.category);

    // Generate retry attempts
    const attempts = this.generateRetryAttempts(
      testCaseId,
      failurePattern,
      currentAttempt,
      learned
    );

    if (attempts.length === 0) {
      logger.debug('No retry attempts generated');
      return null;
    }

    // Calculate estimated duration
    const estimatedTotalDurationMs = attempts.reduce(
      (sum, attempt) => sum + attempt.delayMs + (attempt.timeoutMs ?? 60000),
      0
    );

    const plan: RetryPlan = {
      failurePattern,
      attempts,
      estimatedTotalDurationMs,
      learningEnabled: this.config.enableLearning,
    };

    logger.info('Retry plan created', {
      testCaseId,
      category: failurePattern.category,
      attemptsCount: attempts.length,
      estimatedDurationMs: estimatedTotalDurationMs,
      hasLearnedStrategy: !!learned,
    });

    return plan;
  }

  /**
   * Generate retry attempts based on failure pattern and learned data
   */
  private generateRetryAttempts(
    testCaseId: string,
    failurePattern: FailurePattern,
    currentAttempt: number,
    learned?: LearnedRetryStrategy
  ): RetryAttempt[] {
    const attempts: RetryAttempt[] = [];
    const remainingAttempts = this.config.maxRetries - currentAttempt;

    if (remainingAttempts <= 0) {
      return attempts;
    }

    // Use learned strategy if available and reliable
    if (
      learned &&
      learned.successRate >= this.config.learnedStrategySuccessThreshold &&
      learned.totalAttempts >= this.config.minLearningDataPoints
    ) {
      logger.info('Using learned retry strategy', {
        strategy: learned.successfulStrategy,
        successRate: learned.successRate,
      });
      return this.createAttemptsForStrategy(
        learned.successfulStrategy,
        failurePattern,
        remainingAttempts,
        learned.parameters
      );
    }

    // Generate attempts based on failure category
    const strategies = this.getStrategiesForCategory(failurePattern.category);

    for (let i = 0; i < Math.min(strategies.length, remainingAttempts); i++) {
      const strategy = strategies[i];
      attempts.push(this.createAttempt(strategy, i, failurePattern, testCaseId));
    }

    return attempts;
  }

  /**
   * Get retry strategies for a failure category
   */
  private getStrategiesForCategory(category: FailureCategory): RetryStrategyType[] {
    const strategyMap: Record<FailureCategory, RetryStrategyType[]> = {
      [FailureCategory.ELEMENT_NOT_FOUND]: [
        Strategy.IMMEDIATE,
        Strategy.EXPONENTIAL_BACKOFF,
        Strategy.DIFFERENT_LOCATOR,
      ],
      [FailureCategory.TIMEOUT]: [
        Strategy.LONGER_TIMEOUT,
        Strategy.EXPONENTIAL_BACKOFF,
      ],
      [FailureCategory.NETWORK]: [
        Strategy.EXPONENTIAL_BACKOFF,
        Strategy.FIXED_DELAY,
      ],
      [FailureCategory.STALE_ELEMENT]: [
        Strategy.IMMEDIATE,
      ],
      [FailureCategory.NOT_INTERACTABLE]: [
        Strategy.EXPONENTIAL_BACKOFF,
        Strategy.IMMEDIATE,
      ],
      [FailureCategory.ASSERTION]: [], // Not retryable
      [FailureCategory.CRASH]: [], // Not retryable
      [FailureCategory.UNKNOWN]: [
        Strategy.EXPONENTIAL_BACKOFF,
        Strategy.FIXED_DELAY,
      ],
    };

    return strategyMap[category] ?? [Strategy.EXPONENTIAL_BACKOFF];
  }

  /**
   * Create retry attempts for a specific strategy
   */
  private createAttemptsForStrategy(
    strategy: RetryStrategyType,
    failurePattern: FailurePattern,
    count: number,
    parameters?: Record<string, unknown>
  ): RetryAttempt[] {
    const attempts: RetryAttempt[] = [];

    for (let i = 0; i < count; i++) {
      attempts.push(this.createAttempt(strategy, i, failurePattern, '', parameters));
    }

    return attempts;
  }

  /**
   * Create a single retry attempt
   */
  private createAttempt(
    strategy: RetryStrategyType,
    attemptNumber: number,
    failurePattern: FailurePattern,
    testCaseId: string,
    parameters?: Record<string, unknown>
  ): RetryAttempt {
    const delayMs = this.calculateDelay(attemptNumber, strategy);
    const preRetryAction = this.getPreRetryAction(strategy, failurePattern);
    const alternativeLocator = this.getAlternativeLocator(strategy, failurePattern, parameters);

    let timeoutMs: number | undefined;
    if (strategy === Strategy.LONGER_TIMEOUT) {
      // Extract current timeout and increase it
      const timeoutInfo = this.extractTimeoutInfo(failurePattern.errorMessage);
      const currentTimeout = timeoutInfo.currentTimeout ?? parameters?.currentTimeout as number ?? 30000;
      timeoutMs = Math.min(currentTimeout * 2, this.config.maxRetryDelayMs * 10);
    }

    return {
      attemptNumber,
      strategy,
      delayMs,
      timeoutMs,
      alternativeLocator,
      alternativeDeviceId: parameters?.deviceId as string | undefined,
      preRetryAction,
    };
  }

  /**
   * Calculate delay before retry attempt
   */
  private calculateDelay(attemptNumber: number, strategy: RetryStrategyType): number {
    switch (strategy) {
      case Strategy.IMMEDIATE:
        return 0;

      case Strategy.FIXED_DELAY:
        return this.config.baseRetryDelayMs;

      case Strategy.EXPONENTIAL_BACKOFF:
        return Math.min(
          this.config.baseRetryDelayMs * Math.pow(this.config.backoffMultiplier, attemptNumber),
          this.config.maxRetryDelayMs
        );

      case Strategy.LONGER_TIMEOUT:
        // Give more time for the longer timeout to work
        return this.config.baseRetryDelayMs;

      case Strategy.DIFFERENT_LOCATOR:
        // Small delay to let page settle
        return 500;

      case Strategy.DIFFERENT_DEVICE:
        // Longer delay for device switching
        return 2000;

      default:
        return this.config.baseRetryDelayMs;
    }
  }

  /**
   * Get pre-retry action for a strategy
   */
  private getPreRetryAction(
    strategy: RetryStrategyType,
    failurePattern: FailurePattern
  ): PreRetryAction {
    // Stale elements often need refresh
    if (failurePattern.category === FailureCategory.STALE_ELEMENT) {
      return PreAction.WAIT_FOR_LOAD;
    }

    // Not interactable might need scroll
    if (failurePattern.category === FailureCategory.NOT_INTERACTABLE) {
      return PreAction.SCROLL_INTO_VIEW;
    }

    // Element not found might benefit from waiting
    if (failurePattern.category === FailureCategory.ELEMENT_NOT_FOUND) {
      return PreAction.WAIT_FOR_LOAD;
    }

    return PreAction.NONE;
  }

  /**
   * Get alternative locator for element not found failures
   */
  private getAlternativeLocator(
    strategy: RetryStrategyType,
    failurePattern: FailurePattern,
    parameters?: Record<string, unknown>
  ): LocatorAlternative | undefined {
    if (strategy !== Strategy.DIFFERENT_LOCATOR) {
      return undefined;
    }

    // If parameters contain an alternative locator, use it
    if (parameters?.alternativeLocator) {
      return parameters.alternativeLocator as LocatorAlternative;
    }

    // Generate alternative based on error message
    const locatorInfo = this.extractLocatorInfo(failurePattern.errorMessage);

    if (locatorInfo.type && locatorInfo.value) {
      // Suggest trying with different locator type
      const alternatives: Record<string, { type: string; reason: string }> = {
        'css': { type: 'xpath', reason: 'Try XPath as alternative to CSS selector' },
        'xpath': { type: 'css', reason: 'Try CSS selector as alternative to XPath' },
        'id': { type: 'xpath', reason: 'Try XPath with attribute selector' },
        'accessibility_id': { type: 'id', reason: 'Try regular ID as alternative' },
      };

      const alternative = alternatives[locatorInfo.type];
      if (alternative) {
        return {
          type: alternative.type,
          value: locatorInfo.value,
          reason: alternative.reason,
        };
      }
    }

    return undefined;
  }

  /**
   * Get learned strategy for a test case and failure category
   */
  private getLearnedStrategy(
    testCaseId: string,
    category: FailureCategory
  ): LearnedRetryStrategy | undefined {
    const strategies = this.learnedStrategies.get(testCaseId);
    if (!strategies) {
      return undefined;
    }

    return strategies.find(s => s.failureCategory === category);
  }

  /**
   * Record retry result for learning
   */
  recordRetryResult(
    testCaseId: string,
    failureCategory: FailureCategory,
    strategy: RetryStrategyType,
    success: boolean,
    durationMs: number
  ): void {
    if (!this.config.enableLearning) {
      return;
    }

    let strategies = this.learnedStrategies.get(testCaseId);
    if (!strategies) {
      strategies = [];
      this.learnedStrategies.set(testCaseId, strategies);
    }

    let learned = strategies.find(s => s.failureCategory === failureCategory);
    if (!learned) {
      learned = {
        testCaseId,
        failureCategory,
        successfulStrategy: strategy,
        successRate: 0,
        totalAttempts: 0,
        successCount: 0,
        lastUpdated: new Date(),
      };
      strategies.push(learned);
    }

    // Update statistics
    learned.totalAttempts++;
    if (success) {
      learned.successCount++;
      // If this strategy is working better than the current best, update it
      const currentSuccessRate = learned.successCount / learned.totalAttempts;
      if (currentSuccessRate > learned.successRate) {
        learned.successfulStrategy = strategy;
        learned.successRate = currentSuccessRate;
      }
    }
    learned.lastUpdated = new Date();

    logger.debug('Recorded retry result', {
      testCaseId,
      failureCategory,
      strategy,
      success,
      totalAttempts: learned.totalAttempts,
      successRate: learned.successCount / learned.totalAttempts,
    });
  }

  /**
   * Get all learned strategies
   */
  getLearnedStrategies(): Map<string, LearnedRetryStrategy[]> {
    return new Map(this.learnedStrategies);
  }

  /**
   * Load learned strategies from storage
   */
  loadLearnedStrategies(strategies: LearnedRetryStrategy[]): void {
    this.learnedStrategies.clear();

    for (const strategy of strategies) {
      let testCaseStrategies = this.learnedStrategies.get(strategy.testCaseId);
      if (!testCaseStrategies) {
        testCaseStrategies = [];
        this.learnedStrategies.set(strategy.testCaseId, testCaseStrategies);
      }
      testCaseStrategies.push(strategy);
    }

    logger.info('Loaded learned strategies', {
      totalStrategies: strategies.length,
      testCases: this.learnedStrategies.size,
    });
  }

  /**
   * Reset learned strategies
   */
  resetLearning(): void {
    this.learnedStrategies.clear();
    logger.info('Reset all learned retry strategies');
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<SmartRetryConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('Retry planner config updated', updates);
  }

  /**
   * Get current configuration
   */
  getConfig(): SmartRetryConfig {
    return { ...this.config };
  }

  /**
   * Extract timeout info from error message
   */
  private extractTimeoutInfo(errorMessage: string): {
    currentTimeout?: number;
    unit?: string;
  } {
    const timeoutPatterns = [
      { regex: /(\d+)\s*ms.*timeout/i, unit: 'ms' },
      { regex: /timeout.*(\d+)\s*ms/i, unit: 'ms' },
      { regex: /(\d+)\s*seconds?.*timeout/i, unit: 'seconds' },
      { regex: /timeout.*(\d+)\s*seconds?/i, unit: 'seconds' },
    ];

    for (const { regex, unit } of timeoutPatterns) {
      const match = errorMessage.match(regex);
      if (match && match[1]) {
        return { currentTimeout: parseInt(match[1], 10), unit };
      }
    }

    return {};
  }

  /**
   * Extract locator info from error message
   */
  private extractLocatorInfo(errorMessage: string): {
    type?: string;
    value?: string;
  } {
    const locatorPatterns = [
      { regex: /selector[^:]*:\s*['"]([^'"]+)['"]/i, type: 'css' },
      { regex: /xpath[^:]*:\s*['"]([^'"]+)['"]/i, type: 'xpath' },
      { regex: /id[^:]*:\s*['"]([^'"]+)['"]/i, type: 'id' },
      { regex: /accessibility.*id[^:]*:\s*['"]([^'"]+)['"]/i, type: 'accessibility_id' },
    ];

    for (const { regex, type } of locatorPatterns) {
      const match = errorMessage.match(regex);
      if (match && match[1]) {
        return { type, value: match[1] };
      }
    }

    return {};
  }
}

/**
 * Global retry planner instance
 */
let plannerInstance: RetryPlanner | undefined;

/**
 * Get or create the retry planner instance
 */
export function getRetryPlanner(config?: Partial<SmartRetryConfig>): RetryPlanner {
  if (!plannerInstance) {
    plannerInstance = new RetryPlanner(config);
  } else if (config) {
    plannerInstance.updateConfig(config);
  }
  return plannerInstance;
}

/**
 * Reset the retry planner instance
 */
export function resetRetryPlanner(): void {
  plannerInstance = undefined;
}
