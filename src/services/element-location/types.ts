/**
 * Element Location Strategies Types
 * Defines types for robust element location with multiple locator types,
 * fallback strategies, and timeout handling.
 */

/**
 * Supported locator types for element identification
 */
export enum LocatorType {
  /** Element ID attribute */
  ID = 'id',

  /** XPath selector */
  XPATH = 'xpath',

  /** Accessibility ID (iOS accessibility identifier, Android content-description) */
  ACCESSIBILITY_ID = 'accessibility_id',

  /** CSS selector (web views and hybrid apps) */
  CSS_SELECTOR = 'css_selector',

  /** Android UIAutomator selector */
  UI_AUTOMATOR = 'ui_automator',

  /** iOS predicate string */
  IOS_PREDICATE = 'ios_predicate',

  /** iOS class chain */
  IOS_CLASS_CHAIN = 'ios_class_chain',

  /** Element text content */
  TEXT = 'text',

  /** Element tag name */
  TAG_NAME = 'tag_name',

  /** Element class name */
  CLASS_NAME = 'class_name',

  /** Element name attribute */
  NAME = 'name',

  /** Custom locator type */
  CUSTOM = 'custom',
}

/**
 * Priority levels for locator strategies
 */
export enum LocatorPriority {
  /** Highest priority - try first */
  CRITICAL = 1,

  /** High priority */
  HIGH = 2,

  /** Medium priority */
  MEDIUM = 3,

  /** Low priority - fallback option */
  LOW = 4,

  /** Last resort */
  FALLBACK = 5,
}

/**
 * A single locator strategy
 */
export interface LocatorStrategy {
  /**
   * Type of locator
   */
  type: LocatorType | string;

  /**
   * The selector value (e.g., "#submit-button", "//button[@type='submit']")
   */
  value: string;

  /**
   * Priority of this strategy (lower = higher priority)
   */
  priority?: LocatorPriority;

  /**
   * Whether this locator is required to succeed
   * If true, failure will not trigger fallback strategies
   */
  required?: boolean;

  /**
   * Custom timeout for this specific locator (ms)
   * Overrides the default timeout
   */
  timeout?: number;
}

/**
 * Element location configuration
 */
export interface ElementLocatorConfig {
  /**
   * Default timeout for element location (milliseconds)
   */
  defaultTimeout: number;

  /**
   * Maximum number of retry attempts
   */
  maxRetries: number;

  /**
   * Base delay between retries (milliseconds)
   */
  retryDelay: number;

  /**
   * Enable exponential backoff for retries
   */
  exponentialBackoff: boolean;

  /**
   * Multiplier for exponential backoff
   */
  backoffMultiplier: number;

  /**
   * Maximum delay between retries (milliseconds)
   */
  maxRetryDelay: number;

  /**
   * Whether to try fallback strategies when primary locator fails
   */
  enableFallbacks: boolean;

  /**
   * Maximum number of fallback strategies to attempt
   */
  maxFallbacks: number;

  /**
   * Whether to wait for element to be visible (not just present)
   */
  waitForVisibility: boolean;

  /**
   * Whether to wait for element to be clickable
   */
  waitForClickable: boolean;

  /**
   * Platform-specific overrides
   */
  platformOverrides?: Partial<Record<'ios' | 'android' | 'web', Partial<ElementLocatorConfig>>>;
}

/**
 * Result of an element location attempt
 */
export interface LocationResult {
  /**
   * Whether the element was found
   */
  found: boolean;

  /**
   * The locator strategy that succeeded
   */
  strategy?: LocatorStrategy;

  /**
   * Number of attempts made
   */
  attempts: number;

  /**
   * Total time spent locating (milliseconds)
   */
  duration: number;

  /**
   * Error message if location failed
   */
  error?: string;

  /**
   * Detailed information about each attempt
   */
  attemptDetails?: LocationAttempt[];
}

/**
 * Details of a single location attempt
 */
export interface LocationAttempt {
  /**
   * The strategy used for this attempt
   */
  strategy: LocatorStrategy;

  /**
   * Whether this attempt succeeded
   */
  success: boolean;

  /**
   * Error message if failed
   */
  error?: string;

  /**
   * Time taken for this attempt (milliseconds)
   */
  duration: number;
}

/**
 * Element location options
 */
export interface LocationOptions {
  /**
   * Override default timeout
   */
  timeout?: number;

  /**
   * Override max retries
   */
  maxRetries?: number;

  /**
   * Skip fallback strategies
   */
  skipFallbacks?: boolean;

  /**
   * Only wait for element presence, not visibility
   */
  presenceOnly?: boolean;

  /**
   * Don't wait for element to be clickable
   */
  skipClickableCheck?: boolean;

  /**
   * Custom retry condition function
   * Return true to continue retrying
   */
  shouldRetry?: (error: Error, attempt: number) => boolean;

  /**
   * Platform hint for platform-specific locators
   */
  platform?: 'ios' | 'android' | 'web';
}

/**
 * Parsed selector from natural language or test definition
 */
export interface ParsedSelector {
  /**
   * Primary locator strategies in priority order
   */
  strategies: LocatorStrategy[];

  /**
   * Fallback strategies to try if primary fails
   */
  fallbacks?: LocatorStrategy[];

  /**
   * Whether element must be visible
   */
  mustBeVisible?: boolean;

  /**
   * Whether element must be clickable
   */
  mustBeClickable?: boolean;
}

/**
 * Location error types
 */
export enum LocationErrorType {
  /** Timeout waiting for element */
  TIMEOUT = 'TIMEOUT',

  /** Element not found */
  NOT_FOUND = 'NOT_FOUND',

  /** Multiple elements matched */
  MULTIPLE_MATCHES = 'MULTIPLE_MATCHES',

  /** Invalid locator strategy */
  INVALID_LOCATOR = 'INVALID_LOCATOR',

  /** Stale element reference */
  STALE_ELEMENT = 'STALE_ELEMENT',

  /** Element is not interactable */
  NOT_INTERACTABLE = 'NOT_INTERACTABLE',

  /** Unknown error */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Custom error class for element location failures
 */
export class ElementLocationError extends Error {
  constructor(
    public type: LocationErrorType,
    message: string,
    public strategy?: LocatorStrategy,
    public attempts: number = 0,
    public originalError?: unknown
  ) {
    super(`[ElementLocation] ${type}: ${message}${strategy ? ` (using ${strategy.type}: ${strategy.value})` : ''}${attempts > 0 ? ` after ${attempts} attempts` : ''}`);
    this.name = 'ElementLocationError';
  }
}

/**
 * Element handle interface (abstracted for different automation backends)
 */
export interface ElementHandle {
  /**
   * Click the element
   */
  click(): Promise<void>;

  /**
   * Send keys to the element
   */
  sendKeys(keys: string): Promise<void>;

  /**
   * Get text content
   */
  getText(): Promise<string>;

  /**
   * Check if element is visible
   */
  isVisible(): Promise<boolean>;

  /**
   * Check if element is enabled
   */
  isEnabled(): Promise<boolean>;

  /**
   * Get element attribute
   */
  getAttribute(name: string): Promise<string | null>;

  /**
   * Take screenshot of element
   */
  screenshot(): Promise<Buffer>;
}

/**
 * Driver interface for element location
 * Abstracts the automation backend (Appium, Playwright, etc.)
 */
export interface LocationDriver {
  /**
   * Find element by ID
   */
  findById(id: string): Promise<ElementHandle | null>;

  /**
   * Find element by XPath
   */
  findByXPath(xpath: string): Promise<ElementHandle | null>;

  /**
   * Find element by accessibility ID
   */
  findByAccessibilityId(id: string): Promise<ElementHandle | null>;

  /**
   * Find element by CSS selector
   */
  findByCssSelector(selector: string): Promise<ElementHandle | null>;

  /**
   * Find element by text content
   */
  findByText(text: string): Promise<ElementHandle | null>;

  /**
   * Find element by class name
   */
  findByClassName(className: string): Promise<ElementHandle | null>;

  /**
   * Find element by name attribute
   */
  findByName(name: string): Promise<ElementHandle | null>;

  /**
   * Find element by tag name
   */
  findByTagName(tagName: string): Promise<ElementHandle | null>;

  /**
   * Find element using custom locator
   */
  findByCustom(locator: string): Promise<ElementHandle | null>;

  /**
   * Find element using Android UIAutomator
   */
  findByUIAutomator(selector: string): Promise<ElementHandle | null>;

  /**
   * Find element using iOS predicate
   */
  findByIosPredicate(predicate: string): Promise<ElementHandle | null>;

  /**
   * Find element using iOS class chain
   */
  findByIosClassChain(chain: string): Promise<ElementHandle | null>;

  /**
   * Get current platform
   */
  getPlatform(): Promise<'ios' | 'android' | 'web'>;
}
