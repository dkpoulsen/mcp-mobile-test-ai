/**
 * Failure Classifier
 * Analyzes test failures to categorize them and suggest retry strategies
 */

import type {
  FailurePattern,
  ErrorPattern,
} from './types.js';
import {
  FailureCategory,
  RetryStrategyType,
} from './types.js';
import { createModuleLogger } from '../../utils/logger.js';
import type { Logger } from '../../utils/logger.js';

const logger: Logger = createModuleLogger('smart-retry:failure-classifier');

/**
 * Error patterns for classification
 * Ordered by specificity (more specific patterns first)
 */
const ERROR_PATTERNS: ErrorPattern[] = [
  // Element not found patterns
  {
    pattern: /no such element|unable to locate element|element not found|cannot find element/i,
    category: FailureCategory.ELEMENT_NOT_FOUND,
    confidence: 0.9,
    suggestedStrategy: RetryStrategyType.DIFFERENT_LOCATOR,
  },
  {
    pattern: /selector.*not found|locator.*failed/i,
    category: FailureCategory.ELEMENT_NOT_FOUND,
    confidence: 0.85,
    suggestedStrategy: RetryStrategyType.DIFFERENT_LOCATOR,
  },
  {
    pattern: /xpath.*invalid|css selector.*invalid/i,
    category: FailureCategory.ELEMENT_NOT_FOUND,
    confidence: 0.8,
    suggestedStrategy: RetryStrategyType.DIFFERENT_LOCATOR,
  },

  // Stale element patterns
  {
    pattern: /stale element reference|element is no longer attached|detached/i,
    category: FailureCategory.STALE_ELEMENT,
    confidence: 0.95,
    suggestedStrategy: RetryStrategyType.IMMEDIATE,
  },
  {
    pattern: /element.*not attached to the page document/i,
    category: FailureCategory.STALE_ELEMENT,
    confidence: 0.9,
    suggestedStrategy: RetryStrategyType.IMMEDIATE,
  },

  // Timeout patterns
  {
    pattern: /timeout|timed out|time out/i,
    category: FailureCategory.TIMEOUT,
    confidence: 0.7,
    suggestedStrategy: RetryStrategyType.LONGER_TIMEOUT,
  },
  {
    pattern: /async script timeout|script timeout/i,
    category: FailureCategory.TIMEOUT,
    confidence: 0.85,
    suggestedStrategy: RetryStrategyType.LONGER_TIMEOUT,
  },
  {
    pattern: /element.*clickable.*not found/i,
    category: FailureCategory.TIMEOUT,
    confidence: 0.8,
    suggestedStrategy: RetryStrategyType.LONGER_TIMEOUT,
  },

  // Not interactable patterns
  {
    pattern: /not clickable|not interactable|element.*obscured|other element.*obscures/i,
    category: FailureCategory.NOT_INTERACTABLE,
    confidence: 0.9,
    suggestedStrategy: RetryStrategyType.EXPONENTIAL_BACKOFF,
  },
  {
    pattern: /element.*not visible|element.*displayed.*false/i,
    category: FailureCategory.NOT_INTERACTABLE,
    confidence: 0.85,
    suggestedStrategy: RetryStrategyType.EXPONENTIAL_BACKOFF,
  },
  {
    pattern: /is disabled|read.?only|not enabled/i,
    category: FailureCategory.NOT_INTERACTABLE,
    confidence: 0.9,
    suggestedStrategy: RetryStrategyType.NO_RETRY,
  },

  // Network patterns
  {
    pattern: /network.*error|connection.*refused|econnrefused|econnreset/i,
    category: FailureCategory.NETWORK,
    confidence: 0.85,
    suggestedStrategy: RetryStrategyType.EXPONENTIAL_BACKOFF,
  },
  {
    pattern: /etimedout|socket.*timeout|connection.*timeout/i,
    category: FailureCategory.NETWORK,
    confidence: 0.8,
    suggestedStrategy: RetryStrategyType.EXPONENTIAL_BACKOFF,
  },
  {
    pattern: /502|503|504|bad gateway|service unavailable/i,
    category: FailureCategory.NETWORK,
    confidence: 0.9,
    suggestedStrategy: RetryStrategyType.EXPONENTIAL_BACKOFF,
  },
  {
    pattern: /rate limit|too many requests|429/i,
    category: FailureCategory.NETWORK,
    confidence: 0.95,
    suggestedStrategy: RetryStrategyType.EXPONENTIAL_BACKOFF,
  },

  // Assertion patterns (likely real bugs)
  {
    pattern: /assertion.*failed|expected.*but.*got|assert/i,
    category: FailureCategory.ASSERTION,
    confidence: 0.9,
    suggestedStrategy: RetryStrategyType.NO_RETRY,
  },
  {
    pattern: /expected.*to equal|expected.*to contain|should.*equal/i,
    category: FailureCategory.ASSERTION,
    confidence: 0.85,
    suggestedStrategy: RetryStrategyType.NO_RETRY,
  },

  // Crash patterns
  {
    pattern: /crash|fatal|segmentation fault|exception.*uncaught/i,
    category: FailureCategory.CRASH,
    confidence: 0.9,
    suggestedStrategy: RetryStrategyType.NO_RETRY,
  },
  {
    pattern: /application.*not responding|anr/i,
    category: FailureCategory.CRASH,
    confidence: 0.95,
    suggestedStrategy: RetryStrategyType.NO_RETRY,
  },
  {
    pattern: /out of memory|oom|heap.*overflow/i,
    category: FailureCategory.CRASH,
    confidence: 0.9,
    suggestedStrategy: RetryStrategyType.NO_RETRY,
  },

  // Appium/Selenium specific patterns
  {
    pattern: /invalid session id|session.*not found|session.*expired/i,
    category: FailureCategory.NETWORK,
    confidence: 0.8,
    suggestedStrategy: RetryStrategyType.IMMEDIATE,
  },
  {
    pattern: /driver.*not responsive|session.*deleted/i,
    category: FailureCategory.CRASH,
    confidence: 0.75,
    suggestedStrategy: RetryStrategyType.NO_RETRY,
  },
];

/**
 * Failure Classifier class
 */
export class FailureClassifier {
  /**
   * Custom patterns added at runtime
   */
  private customPatterns: ErrorPattern[] = [];

  /**
   * Classify a failure based on error message and stack trace
   */
  classify(errorMessage: string, stackTrace?: string): FailurePattern {
    const combinedMessage = stackTrace
      ? `${errorMessage}\n${stackTrace}`
      : errorMessage;

    let bestMatch: {
      pattern: ErrorPattern;
      confidence: number;
    } | null = null;

    // Check against all patterns
    for (const pattern of [...this.customPatterns, ...ERROR_PATTERNS]) {
      if (pattern.pattern.test(combinedMessage)) {
        // Adjust confidence based on pattern specificity
        const adjustedConfidence = this.adjustConfidence(
          pattern.confidence,
          errorMessage,
          pattern.pattern
        );

        if (!bestMatch || adjustedConfidence > bestMatch.confidence) {
          bestMatch = {
            pattern,
            confidence: adjustedConfidence,
          };
        }
      }
    }

    // Default to unknown if no patterns matched
    if (!bestMatch) {
      return {
        category: FailureCategory.UNKNOWN,
        confidence: 0.3,
        errorMessage,
        stackTrace,
        metadata: {
          classificationMethod: 'default',
        },
      };
    }

    return {
      category: bestMatch.pattern.category,
      confidence: bestMatch.confidence,
      errorMessage,
      stackTrace,
      suggestedStrategy: bestMatch.pattern.suggestedStrategy,
      metadata: {
        matchedPattern: bestMatch.pattern.pattern.source,
        classificationMethod: 'pattern_match',
      },
    };
  }

  /**
   * Classify from a test result object
   */
  classifyFromResult(result: {
    errorMessage?: string | null;
    stackTrace?: string | null;
    status?: string;
  }): FailurePattern {
    const errorMessage = result.errorMessage ?? 'Unknown error';
    return this.classify(errorMessage, result.stackTrace ?? undefined);
  }

  /**
   * Get suggested retry strategy for a failure pattern
   */
  getSuggestedStrategy(pattern: FailurePattern): RetryStrategyType {
    // Use suggested strategy from classification if available
    if (pattern.suggestedStrategy) {
      return pattern.suggestedStrategy;
    }

    // Default strategies by category
    const defaultStrategies: Record<FailureCategory, RetryStrategyType> = {
      [FailureCategory.ELEMENT_NOT_FOUND]: RetryStrategyType.DIFFERENT_LOCATOR,
      [FailureCategory.TIMEOUT]: RetryStrategyType.LONGER_TIMEOUT,
      [FailureCategory.NETWORK]: RetryStrategyType.EXPONENTIAL_BACKOFF,
      [FailureCategory.ASSERTION]: RetryStrategyType.NO_RETRY,
      [FailureCategory.CRASH]: RetryStrategyType.NO_RETRY,
      [FailureCategory.STALE_ELEMENT]: RetryStrategyType.IMMEDIATE,
      [FailureCategory.NOT_INTERACTABLE]: RetryStrategyType.EXPONENTIAL_BACKOFF,
      [FailureCategory.UNKNOWN]: RetryStrategyType.EXPONENTIAL_BACKOFF,
    };

    return defaultStrategies[pattern.category] ?? RetryStrategyType.EXPONENTIAL_BACKOFF;
  }

  /**
   * Check if a failure category is retryable
   */
  isRetryable(category: FailureCategory, nonRetryableCategories: FailureCategory[] = []): boolean {
    const defaultNonRetryable = [
      FailureCategory.ASSERTION,
      FailureCategory.CRASH,
    ];

    const nonRetryable = new Set([...defaultNonRetryable, ...nonRetryableCategories]);
    return !nonRetryable.has(category);
  }

  /**
   * Add a custom error pattern for classification
   */
  addCustomPattern(pattern: ErrorPattern): void {
    this.customPatterns.push(pattern);
    logger.info('Added custom error pattern', {
      category: pattern.category,
      pattern: pattern.pattern.source,
    });
  }

  /**
   * Remove custom patterns
   */
  clearCustomPatterns(): void {
    this.customPatterns = [];
  }

  /**
   * Adjust confidence based on match quality
   */
  private adjustConfidence(
    baseConfidence: number,
    errorMessage: string,
    pattern: RegExp
  ): number {
    const match = errorMessage.match(pattern);

    if (!match) {
      return baseConfidence * 0.5;
    }

    // Increase confidence if match is exact (longer match string)
    const matchedLength = match[0]?.length ?? 0;
    const messageLength = errorMessage.length;
    const coverageRatio = matchedLength / messageLength;

    // Adjust confidence based on coverage
    if (coverageRatio > 0.5) {
      return Math.min(1, baseConfidence + 0.1);
    } else if (coverageRatio < 0.1) {
      return Math.max(0.3, baseConfidence - 0.2);
    }

    return baseConfidence;
  }

  /**
   * Extract element locator info from error message
   */
  extractLocatorInfo(errorMessage: string): {
    type?: string;
    value?: string;
  } {
    const locatorPatterns = [
      { regex: /selector[^:]*:\s*['"]([^'"]+)['"]/i, type: 'css' },
      { regex: /xpath[^:]*:\s*['"]([^'"]+)['"]/i, type: 'xpath' },
      { regex: /id[^:]*:\s*['"]([^'"]+)['"]/i, type: 'id' },
      { regex: /accessibility.*id[^:]*:\s*['"]([^'"]+)['"]/i, type: 'accessibility_id' },
      { regex: /using\s+['"]([^'"]+)['"]/i, type: 'generic' },
    ];

    for (const { regex, type } of locatorPatterns) {
      const match = errorMessage.match(regex);
      if (match && match[1]) {
        return { type, value: match[1] };
      }
    }

    return {};
  }

  /**
   * Extract timeout info from error message
   */
  extractTimeoutInfo(errorMessage: string): {
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
}

/**
 * Global classifier instance
 */
let classifierInstance: FailureClassifier | undefined;

/**
 * Get or create the failure classifier instance
 */
export function getFailureClassifier(): FailureClassifier {
  if (!classifierInstance) {
    classifierInstance = new FailureClassifier();
  }
  return classifierInstance;
}

/**
 * Reset the classifier instance
 */
export function resetFailureClassifier(): void {
  classifierInstance = undefined;
}
