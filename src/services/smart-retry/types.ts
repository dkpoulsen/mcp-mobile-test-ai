/**
 * Smart Retry Strategy Types
 * Defines types for intelligent retry mechanisms that adapt based on failure patterns
 */

/**
 * Failure categories that determine retry strategy
 */
export enum FailureCategory {
  /** Element not found - may need different locator or longer wait */
  ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',

  /** Timeout - may need longer timeout or faster action */
  TIMEOUT = 'TIMEOUT',

  /** Network error - may need retry with backoff */
  NETWORK = 'NETWORK',

  /** Assertion failed - likely a real bug, minimal retry */
  ASSERTION = 'ASSERTION',

  /** Crash - should not retry immediately */
  CRASH = 'CRASH',

  /** Stale element - needs refresh */
  STALE_ELEMENT = 'STALE_ELEMENT',

  /** Not interactable - element exists but can't be interacted with */
  NOT_INTERACTABLE = 'NOT_INTERACTABLE',

  /** Unknown failure */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Retry strategy types
 */
export enum RetryStrategyType {
  /** Retry with increasing wait times */
  EXPONENTIAL_BACKOFF = 'EXPONENTIAL_BACKOFF',

  /** Retry with fixed wait time */
  FIXED_DELAY = 'FIXED_DELAY',

  /** Retry immediately with no delay */
  IMMEDIATE = 'IMMEDIATE',

  /** Retry with different element locator */
  DIFFERENT_LOCATOR = 'DIFFERENT_LOCATOR',

  /** Retry on different device */
  DIFFERENT_DEVICE = 'DIFFERENT_DEVICE',

  /** Retry with longer timeout */
  LONGER_TIMEOUT = 'LONGER_TIMEOUT',

  /** No retry - fail immediately */
  NO_RETRY = 'NO_RETRY',
}

/**
 * Single retry attempt configuration
 */
export interface RetryAttempt {
  /** Attempt number (0-based) */
  attemptNumber: number;

  /** Strategy to use for this attempt */
  strategy: RetryStrategyType;

  /** Delay before this attempt (ms) */
  delayMs: number;

  /** Timeout for this attempt (ms) - overrides default */
  timeoutMs?: number;

  /** Alternative locator to try */
  alternativeLocator?: LocatorAlternative;

  /** Alternative device to try */
  alternativeDeviceId?: string;

  /** Any special actions to take before retry */
  preRetryAction?: PreRetryAction;
}

/**
 * Alternative locator strategy
 */
export interface LocatorAlternative {
  /** Locator type (id, xpath, css_selector, etc.) */
  type: string;

  /** Locator value */
  value: string;

  /** Description of why this alternative might work */
  reason: string;
}

/**
 * Actions to take before retrying
 */
export enum PreRetryAction {
  /** Refresh the page/screen */
  REFRESH = 'REFRESH',

  /** Navigate back and return */
  NAVIGATE_BACK = 'NAVIGATE_BACK',

  /** Clear app cache/data */
  CLEAR_CACHE = 'CLEAR_CACHE',

  /** Restart the app */
  RESTART_APP = 'RESTART_APP',

  /** Wait for page load */
  WAIT_FOR_LOAD = 'WAIT_FOR_LOAD',

  /** Scroll element into view */
  SCROLL_INTO_VIEW = 'SCROLL_INTO_VIEW',

  /** Dismiss any alerts/dialogs */
  DISMISS_ALERTS = 'DISMISS_ALERTS',

  /** No special action */
  NONE = 'NONE',
}

/**
 * Detected failure pattern
 */
export interface FailurePattern {
  /** Category of the failure */
  category: FailureCategory;

  /** Confidence in this classification (0-1) */
  confidence: number;

  /** Error message that triggered this pattern */
  errorMessage: string;

  /** Stack trace for analysis */
  stackTrace?: string;

  /** Metadata about the failure */
  metadata?: Record<string, unknown>;

  /** Suggested retry strategy (computed by classifier) */
  suggestedStrategy?: RetryStrategyType;
}

/**
 * Retry plan for a failing test
 */
export interface RetryPlan {
  /** Original failure that triggered this plan */
  failurePattern: FailurePattern;

  /** Retry attempts to execute in order */
  attempts: RetryAttempt[];

  /** Total estimated time for all retries (ms) */
  estimatedTotalDurationMs: number;

  /** Whether learning is enabled for this failure type */
  learningEnabled: boolean;
}

/**
 * Result of a retry attempt
 */
export interface RetryResult {
  /** Attempt number */
  attemptNumber: number;

  /** Strategy used */
  strategy: RetryStrategyType;

  /** Whether this attempt succeeded */
  success: boolean;

  /** Duration of attempt (ms) */
  durationMs: number;

  /** Error if failed */
  error?: string;

  /** Any metadata about the attempt */
  metadata?: Record<string, unknown>;
}

/**
 * Learned retry strategy from historical data
 */
export interface LearnedRetryStrategy {
  /** Test case ID this applies to */
  testCaseId: string;

  /** Failure category */
  failureCategory: FailureCategory;

  /** Strategy that worked most often */
  successfulStrategy: RetryStrategyType;

  /** Success rate (0-1) */
  successRate: number;

  /** Total times this strategy was tried */
  totalAttempts: number;

  /** Total times this strategy succeeded */
  successCount: number;

  /** Last time this strategy was updated */
  lastUpdated: Date;

  /** Specific parameters that worked */
  parameters?: Record<string, unknown>;
}

/**
 * Smart retry configuration
 */
export interface SmartRetryConfig {
  /** Whether smart retry is enabled */
  enabled: boolean;

  /** Maximum number of retry attempts */
  maxRetries: number;

  /** Default delay before first retry (ms) */
  baseRetryDelayMs: number;

  /** Maximum delay between retries (ms) */
  maxRetryDelayMs: number;

  /** Backoff multiplier for exponential backoff */
  backoffMultiplier: number;

  /** Whether to enable learning from past retries */
  enableLearning: boolean;

  /** Minimum data points before applying learned strategy */
  minLearningDataPoints: number;

  /** Success rate threshold for using learned strategy */
  learnedStrategySuccessThreshold: number;

  /** Whether to try different devices on failure */
  enableDeviceSwitching: boolean;

  /** Whether to try alternative locators on element not found */
  enableLocatorAlternatives: boolean;

  /** Categories that should not be retried */
  nonRetryableCategories: FailureCategory[];

  /** Platform-specific overrides */
  platformOverrides?: Partial<Record<'ios' | 'android' | 'web', Partial<SmartRetryConfig>>>;
}

/**
 * Retry analytics for tracking what works
 */
export interface RetryAnalytics {
  /** Test case ID */
  testCaseId: string;

  /** Total retry attempts */
  totalRetries: number;

  /** Successful retries (test passed after retry) */
  successfulRetries: number;

  /** Strategies tried and their results */
  strategyResults: Map<RetryStrategyType, {
    attempts: number;
    successes: number;
    avgDurationMs: number;
  }>;

  /** Most successful strategy */
  mostSuccessfulStrategy?: RetryStrategyType;

  /** Last updated */
  lastUpdated: Date;
}

/**
 * Error pattern for classification
 */
export interface ErrorPattern {
  /** Regex pattern to match error message */
  pattern: RegExp;

  /** Category to assign */
  category: FailureCategory;

  /** Confidence in this classification */
  confidence: number;

  /** Suggested retry strategy */
  suggestedStrategy?: RetryStrategyType;
}
