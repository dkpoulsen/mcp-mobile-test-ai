/**
 * Element Locator - Core element location strategy implementation
 * Provides robust element location with multiple locator types,
 * fallback strategies, and timeout handling.
 */

import type {
  ElementHandle,
  ElementLocatorConfig,
  LocationDriver,
  LocationOptions,
  LocationResult,
  LocationAttempt,
  LocatorStrategy,
  LocatorType,
  ParsedSelector,
} from './types.js';
import {
  ElementLocationError,
  LocationErrorType,
} from './types.js';
import { createModuleLogger } from '../../utils/logger.js';

const logger = createModuleLogger('element-locator');

/**
 * Default configuration for element location
 */
const DEFAULT_CONFIG: ElementLocatorConfig = {
  defaultTimeout: 10000, // 10 seconds
  maxRetries: 3,
  retryDelay: 500, // 500ms
  exponentialBackoff: true,
  backoffMultiplier: 2,
  maxRetryDelay: 5000, // 5 seconds
  enableFallbacks: true,
  maxFallbacks: 5,
  waitForVisibility: false, // Default to false for better compatibility
  waitForClickable: false,
};

/**
 * Element Locator class - handles finding elements with multiple strategies
 */
export class ElementLocator {
  private config: ElementLocatorConfig;
  private driver: LocationDriver;

  constructor(driver: LocationDriver, config?: Partial<ElementLocatorConfig>) {
    this.driver = driver;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Locate an element using the provided strategies
   */
  async locate(
    selector: string | ParsedSelector | LocatorStrategy[],
    options?: LocationOptions
  ): Promise<LocationResult> {
    const startTime = Date.now();
    const strategies = this.parseSelector(selector);
    const mergedOptions = this.mergeOptions(options);

    logger.debug(
      {
        strategies: strategies.length,
        options: mergedOptions,
      },
      'Starting element location'
    );

    const attemptDetails: LocationAttempt[] = [];
    let currentAttempt = 0;
    let lastError: Error | undefined;

    // Try each strategy in order
    for (const strategy of strategies) {
      if (strategy.required && currentAttempt > 0) {
        // If previous strategy failed and this one is marked as required,
        // skip fallback strategies
        break;
      }

      const result = await this.tryStrategy(strategy, mergedOptions);
      attemptDetails.push(result);

      if (result.success) {
        const duration = Date.now() - startTime;
        logger.debug(
          {
            strategy: strategy.type,
            value: strategy.value,
            attempts: currentAttempt + 1,
            duration,
          },
          'Element found successfully'
        );

        return {
          found: true,
          strategy,
          attempts: currentAttempt + 1,
          duration,
          attemptDetails,
        };
      }

      lastError = result.error ? new Error(result.error) : undefined;
      currentAttempt++;

      // If this was a required strategy, don't try fallbacks
      if (strategy.required) {
        break;
      }

      // If skipping fallbacks, stop after first attempt
      if (mergedOptions.skipFallbacks) {
        break;
      }

      // Check if we've hit max fallbacks
      if (currentAttempt >= mergedOptions.maxRetries) {
        break;
      }

      // Add delay before retry (with exponential backoff if enabled)
      await this.getRetryDelay(currentAttempt, mergedOptions);
    }

    // All strategies failed
    const duration = Date.now() - startTime;
    const error = lastError?.message || 'Element not found with any strategy';

    logger.warn(
      {
        attempts: currentAttempt,
        duration,
        lastError: error,
      },
      'Element location failed'
    );

    return {
      found: false,
      attempts: currentAttempt,
      duration,
      error,
      attemptDetails,
    };
  }

  /**
   * Locate an element and return the element handle
   * Throws an error if the element is not found
   */
  async locateOrFail(
    selector: string | ParsedSelector | LocatorStrategy[],
    options?: LocationOptions
  ): Promise<{ element: ElementHandle; result: LocationResult }> {
    const result = await this.locate(selector, options);

    if (!result.found) {
      throw new ElementLocationError(
        LocationErrorType.NOT_FOUND,
        result.error || 'Failed to locate element',
        result.strategy,
        result.attempts
      );
    }

    // The actual element would be returned by the driver in a real implementation
    // For now, we'll need to re-find it to get the handle
    const element = await this.findElement(result.strategy!);
    return { element: element!, result };
  }

  /**
   * Wait for an element to be present
   */
  async waitForElement(
    selector: string | ParsedSelector | LocatorStrategy[],
    options?: LocationOptions
  ): Promise<LocationResult> {
    return this.locate(selector, {
      ...options,
      presenceOnly: true,
      skipClickableCheck: true,
    });
  }

  /**
   * Wait for an element to be visible
   */
  async waitForVisible(
    selector: string | ParsedSelector | LocatorStrategy[],
    options?: LocationOptions
  ): Promise<LocationResult> {
    return this.locate(selector, {
      ...options,
      skipClickableCheck: true,
    });
  }

  /**
   * Wait for an element to be clickable
   */
  async waitForClickable(
    selector: string | ParsedSelector | LocatorStrategy[],
    options?: LocationOptions
  ): Promise<LocationResult> {
    return this.locate(selector, {
      ...options,
    });
  }

  /**
   * Check if an element exists without waiting
   */
  async exists(
    selector: string | ParsedSelector | LocatorStrategy[],
    options?: LocationOptions
  ): Promise<boolean> {
    const result = await this.locate(selector, {
      ...options,
      timeout: 0,
      maxRetries: 0,
      skipFallbacks: true,
    });
    return result.found;
  }

  /**
   * Try a single locator strategy
   */
  private async tryStrategy(
    strategy: LocatorStrategy,
    options: LocationOptions
  ): Promise<LocationAttempt> {
    const startTime = Date.now();

    try {
      const element = await this.findElement(strategy);

      if (!element) {
        return {
          strategy,
          success: false,
          error: 'Element not found',
          duration: Date.now() - startTime,
        };
      }

      // Check visibility if required
      if (!options.presenceOnly && this.config.waitForVisibility) {
        const visible = await element.isVisible();
        if (!visible) {
          return {
            strategy,
            success: false,
            error: 'Element found but not visible',
            duration: Date.now() - startTime,
          };
        }
      }

      // Check clickability if required
      if (!options.skipClickableCheck && this.config.waitForClickable) {
        const enabled = await element.isEnabled();
        if (!enabled) {
          return {
            strategy,
            success: false,
            error: 'Element found but not clickable',
            duration: Date.now() - startTime,
          };
        }
      }

      return {
        strategy,
        success: true,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        strategy,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Find an element using a specific strategy
   */
  private async findElement(strategy: LocatorStrategy): Promise<ElementHandle | null> {
    const { type, value } = strategy;

    switch (type as LocatorType) {
      case 'id':
        return this.driver.findById(value);

      case 'xpath':
        return this.driver.findByXPath(value);

      case 'accessibility_id':
        return this.driver.findByAccessibilityId(value);

      case 'css_selector':
        return this.driver.findByCssSelector(value);

      case 'text':
        return this.driver.findByText(value);

      case 'class_name':
        return this.driver.findByClassName(value);

      case 'name':
        return this.driver.findByName(value);

      case 'tag_name':
        return this.driver.findByTagName(value);

      case 'ui_automator':
        return this.driver.findByUIAutomator(value);

      case 'ios_predicate':
        return this.driver.findByIosPredicate(value);

      case 'ios_class_chain':
        return this.driver.findByIosClassChain(value);

      case 'custom':
        return this.driver.findByCustom(value);

      default:
        throw new ElementLocationError(
          LocationErrorType.INVALID_LOCATOR,
          `Unsupported locator type: ${type}`
        );
    }
  }

  /**
   * Parse selector input into strategy array
   */
  private parseSelector(
    selector: string | ParsedSelector | LocatorStrategy[]
  ): LocatorStrategy[] {
    if (Array.isArray(selector)) {
      return selector;
    }

    if (typeof selector === 'string') {
      return this.parseSelectorString(selector);
    }

    // ParsedSelector - combine strategies and fallbacks
    const strategies = selector.strategies || [];
    const fallbacks = selector.fallbacks || [];
    return [...strategies, ...fallbacks];
  }

  /**
   * Parse a selector string and generate multiple strategies
   */
  private parseSelectorString(selector: string): LocatorStrategy[] {
    const strategies: LocatorStrategy[] = [];

    // Detect selector type from format
    if (selector.startsWith('//') || selector.startsWith('(//')) {
      // XPath
      strategies.push({
        type: 'xpath',
        value: selector,
        priority: 1,
      });
    } else if (selector.startsWith('#') && !selector.includes(' ')) {
      // ID selector
      strategies.push({
        type: 'id',
        value: selector.slice(1),
        priority: 1,
      });
      // Add CSS fallback
      strategies.push({
        type: 'css_selector',
        value: selector,
        priority: 2,
      });
    } else if (selector.startsWith('.')) {
      // Class selector
      strategies.push({
        type: 'css_selector',
        value: selector,
        priority: 1,
      });
      strategies.push({
        type: 'class_name',
        value: selector.slice(1),
        priority: 2,
      });
    } else if (selector.includes('[') && selector.includes('=')) {
      // CSS attribute selector
      strategies.push({
        type: 'css_selector',
        value: selector,
        priority: 1,
      });
      // Try to extract ID for fallback
      const idMatch = selector.match(/\[id=['"]([^'"]+)['"]\]/);
      if (idMatch) {
        strategies.push({
          type: 'id',
          value: idMatch[1],
          priority: 2,
        });
      }
    } else if (selector.includes('>')) {
      // CSS combinator - use CSS selector
      strategies.push({
        type: 'css_selector',
        value: selector,
        priority: 1,
      });
      // Generate XPath fallback
      strategies.push({
        type: 'xpath',
        value: this.cssToXPath(selector),
        priority: 2,
      });
    } else {
      // Text content or generic selector
      strategies.push({
        type: 'text',
        value: selector,
        priority: 1,
      });
      strategies.push({
        type: 'css_selector',
        value: selector,
        priority: 2,
      });
      // Generate accessibility ID fallback for common patterns
      strategies.push({
        type: 'accessibility_id',
        value: selector.toLowerCase().replace(/\s+/g, '_'),
        priority: 3,
      });
    }

    return strategies;
  }

  /**
   * Convert CSS selector to XPath (basic implementation)
   */
  private cssToXPath(css: string): string {
    let xpath = '//';

    // Handle ID selector
    if (css.startsWith('#')) {
      return `//*[@id="${css.slice(1)}"]`;
    }

    // Handle class selector
    if (css.startsWith('.')) {
      return `//*[@class="${css.slice(1)}"]`;
    }

    // Handle descendant combinator
    const parts = css.split(/\s+/);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.includes('>')) {
        // Direct child combinator
        const [parent, child] = part.split('>').map((p) => p.trim());
        xpath += `${parent || '*'}/${child || '*'}`;
      } else if (part.startsWith('#')) {
        xpath += `[@id="${part.slice(1)}"]`;
      } else if (part.startsWith('.')) {
        xpath += `[contains(@class, "${part.slice(1)}")]`;
      } else if (part) {
        xpath += `/${part}`;
      }

      if (i < parts.length - 1 && !parts[i + 1].includes('>')) {
        xpath += '//';
      }
    }

    return xpath;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private async getRetryDelay(attempt: number, options: LocationOptions): Promise<void> {
    let delay = this.config.retryDelay;

    if (this.config.exponentialBackoff) {
      delay = Math.min(
        this.config.retryDelay * Math.pow(this.config.backoffMultiplier, attempt - 1),
        this.config.maxRetryDelay
      );
    }

    logger.debug(
      {
        attempt,
        delay,
      },
      'Retry delay'
    );

    await this.sleep(delay);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Merge options with defaults
   */
  private mergeOptions(options?: LocationOptions): LocationOptions & { maxRetries: number } {
    return {
      timeout: options?.timeout ?? this.config.defaultTimeout,
      maxRetries: options?.maxRetries ?? this.config.maxRetries,
      skipFallbacks: options?.skipFallbacks ?? false,
      presenceOnly: options?.presenceOnly ?? false,
      skipClickableCheck: options?.skipClickableCheck ?? false,
      platform: options?.platform,
      shouldRetry: options?.shouldRetry,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<ElementLocatorConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ElementLocatorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Create a new ElementLocator instance
 */
export function createElementLocator(
  driver: LocationDriver,
  config?: Partial<ElementLocatorConfig>
): ElementLocator {
  return new ElementLocator(driver, config);
}
