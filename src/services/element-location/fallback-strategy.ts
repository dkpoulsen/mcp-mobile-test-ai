/**
 * Fallback Strategy - Manages fallback locator strategies
 * Provides intelligent fallback selection and execution.
 */

import type {
  ElementHandle,
  LocationDriver,
  LocatorStrategy,
  LocationResult,
  ParsedSelector,
} from './types.js';
import { LocatorPriority, LocationErrorType } from './types.js';
import { ElementLocationError } from './types.js';
import { createModuleLogger } from '../../utils/logger.js';

const logger = createModuleLogger('fallback-strategy');

/**
 * Fallback strategy configuration
 */
export interface FallbackConfig {
  /** Maximum number of fallback strategies to attempt */
  maxFallbacks: number;

  /** Whether to enable platform-specific fallbacks */
  enablePlatformFallbacks: boolean;

  /** Whether to enable AI-powered fallback suggestions (future feature) */
  enableAiFallbacks: boolean;

  /** Priority threshold for considering a strategy as fallback */
  fallbackPriorityThreshold: LocatorPriority;
}

/**
 * Fallback execution result
 */
export interface FallbackResult {
  /** Whether any fallback strategy succeeded */
  success: boolean;

  /** The strategy that succeeded */
  strategy?: LocatorStrategy;

  /** Element handle if found */
  element?: ElementHandle;

  /** Number of fallback attempts made */
  attempts: number;

  /** All results from each attempt */
  results: Array<{
    strategy: LocatorStrategy;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Fallback Strategy Manager class
 */
export class FallbackStrategyManager {
  private driver: LocationDriver;
  private config: FallbackConfig;

  constructor(driver: LocationDriver, config?: Partial<FallbackConfig>) {
    this.driver = driver;
    this.config = {
      maxFallbacks: config?.maxFallbacks ?? 5,
      enablePlatformFallbacks: config?.enablePlatformFallbacks ?? true,
      enableAiFallbacks: config?.enableAiFallbacks ?? false,
      fallbackPriorityThreshold: config?.fallbackPriorityThreshold ?? LocatorPriority.MEDIUM,
    };
  }

  /**
   * Execute fallback strategies for a failed primary locator
   */
  async executeFallbacks(
    primary: LocatorStrategy[],
    selector: ParsedSelector,
    primaryError?: Error
  ): Promise<FallbackResult> {
    const results: FallbackResult['results'] = [];
    let attempts = 0;

    logger.debug(
      {
        primaryCount: primary.length,
        fallbackCount: selector.fallbacks?.length,
        primaryError: primaryError?.message,
      },
      'Starting fallback strategy execution'
    );

    // Get candidate strategies
    const candidates = await this.selectFallbackStrategies(primary, selector);

    // Try each fallback strategy
    for (const strategy of candidates.slice(0, this.config.maxFallbacks)) {
      attempts++;

      try {
        const result = await this.tryStrategy(strategy);
        results.push(result);

        if (result.success) {
          logger.info(
            {
              strategy: strategy.type,
              value: strategy.value,
              attempts,
            },
            'Fallback strategy succeeded'
          );

          return {
            success: true,
            strategy,
            element: result.element,
            attempts,
            results,
          };
        }
      } catch (error) {
        results.push({
          strategy,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });

        logger.debug(
          {
            strategy: strategy.type,
            value: strategy.value,
            error: error instanceof Error ? error.message : String(error),
          },
          'Fallback strategy failed'
        );
      }
    }

    logger.warn(
      {
        attempts,
        totalCandidates: candidates.length,
      },
      'All fallback strategies failed'
    );

    return {
      success: false,
      attempts,
      results,
    };
  }

  /**
   * Select appropriate fallback strategies based on context
   */
  private async selectFallbackStrategies(
    primary: LocatorStrategy[],
    selector: ParsedSelector
  ): Promise<LocatorStrategy[]> {
    let candidates: LocatorStrategy[] = [];

    // Add explicitly defined fallbacks from selector
    if (selector.fallbacks && selector.fallbacks.length > 0) {
      candidates = [...selector.fallbacks];
    }

    // Generate intelligent fallbacks based on primary strategies
    const generated = this.generateFallbacks(primary);
    candidates = [...candidates, ...generated];

    // Add platform-specific fallbacks if enabled
    if (this.config.enablePlatformFallbacks) {
      const platform = await this.driver.getPlatform();
      const platformFallbacks = this.generatePlatformFallbacks(primary, platform);
      candidates = [...candidates, ...platformFallbacks];
    }

    // Deduplicate and prioritize
    candidates = this.deduplicateStrategies(candidates);
    candidates = this.sortByPriority(candidates);

    return candidates;
  }

  /**
   * Generate fallback strategies based on primary strategies
   */
  private generateFallbacks(primary: LocatorStrategy[]): LocatorStrategy[] {
    const fallbacks: LocatorStrategy[] = [];

    for (const strategy of primary) {
      switch (strategy.type) {
        case 'id':
          // ID fallbacks
          fallbacks.push(
            {
              type: 'css_selector',
              value: `#${strategy.value}`,
              priority: LocatorPriority.LOW,
            },
            {
              type: 'name',
              value: strategy.value,
              priority: LocatorPriority.LOW,
            },
            {
              type: 'accessibility_id',
              value: strategy.value,
              priority: LocatorPriority.FALLBACK,
            }
          );
          break;

        case 'css_selector':
          // CSS fallbacks
          fallbacks.push(...this.generateCssFallbacks(strategy.value));
          break;

        case 'xpath':
          // XPath fallbacks - try alternative xpaths
          fallbacks.push(...this.generateXPathFallbacks(strategy.value));
          break;

        case 'text':
          // Text fallbacks
          fallbacks.push(
            {
              type: 'xpath',
              value: `//*[contains(text(), "${strategy.value}")]`,
              priority: LocatorPriority.LOW,
            },
            {
              type: 'accessibility_id',
              value: strategy.value.toLowerCase().replace(/\s+/g, '_'),
              priority: LocatorPriority.LOW,
            }
          );
          break;

        case 'accessibility_id':
          // Accessibility ID fallbacks
          fallbacks.push(
            {
              type: 'id',
              value: strategy.value,
              priority: LocatorPriority.LOW,
            },
            {
              type: 'name',
              value: strategy.value,
              priority: LocatorPriority.LOW,
            },
            {
              type: 'text',
              value: strategy.value.replace(/_/g, ' '),
              priority: LocatorPriority.FALLBACK,
            }
          );
          break;
      }
    }

    return fallbacks;
  }

  /**
   * Generate CSS-specific fallbacks
   */
  private generateCssFallbacks(css: string): LocatorStrategy[] {
    const fallbacks: LocatorStrategy[] = [];

    // Extract ID if present
    const idMatch = css.match(/#([a-zA-Z0-9_-]+)/);
    if (idMatch) {
      fallbacks.push({
        type: 'id',
        value: idMatch[1],
        priority: LocatorPriority.HIGH,
      });
    }

    // Extract class if present
    const classMatch = css.match(/\.([a-zA-Z0-9_-]+)/);
    if (classMatch) {
      fallbacks.push({
        type: 'class_name',
        value: classMatch[1],
        priority: LocatorPriority.MEDIUM,
      });
    }

    // Extract attribute selectors
    const attrMatches = css.matchAll(/\[([a-zA-Z-]+)\s*=\s*["']?([^"'\]]+)["']?\]/g);
    for (const match of attrMatches) {
      const attrName = match[1];
      const attrValue = match[2];

      if (attrName === 'id') {
        fallbacks.push({
          type: 'id',
          value: attrValue,
          priority: LocatorPriority.HIGH,
        });
      } else if (attrName === 'name') {
        fallbacks.push({
          type: 'name',
          value: attrValue,
          priority: LocatorPriority.MEDIUM,
        });
      }
    }

    // Convert to XPath
    fallbacks.push({
      type: 'xpath',
      value: this.cssToXPath(css),
      priority: LocatorPriority.LOW,
    });

    return fallbacks;
  }

  /**
   * Generate XPath-specific fallbacks
   */
  private generateXPathFallbacks(xpath: string): LocatorStrategy[] {
    const fallbacks: LocatorStrategy[] = [];

    // Try with contains instead of exact match
    if (xpath.includes('=')) {
      const containsXPath = xpath.replace(/=["']([^"']+)["']/g, '[contains(., "$1")]');
      if (containsXPath !== xpath) {
        fallbacks.push({
          type: 'xpath',
          value: containsXPath,
          priority: LocatorPriority.MEDIUM,
        });
      }
    }

    // Try without position predicates
    const positionlessXPath = xpath.replace(/\[\d+\]/g, '');
    if (positionlessXPath !== xpath) {
      fallbacks.push({
        type: 'xpath',
        value: positionlessXPath,
        priority: LocatorPriority.LOW,
      });
    }

    return fallbacks;
  }

  /**
   * Generate platform-specific fallback strategies
   */
  private generatePlatformFallbacks(
    primary: LocatorStrategy[],
    platform: 'ios' | 'android' | 'web'
  ): LocatorStrategy[] {
    const fallbacks: LocatorStrategy[] = [];

    for (const strategy of primary) {
      if (platform === 'ios') {
        // iOS-specific fallbacks
        if (strategy.type === 'accessibility_id') {
          fallbacks.push({
            type: 'ios_predicate',
            value: `label == "${strategy.value}"`,
            priority: LocatorPriority.LOW,
          });
        }
        if (strategy.type === 'text') {
          fallbacks.push({
            type: 'ios_predicate',
            value: `label == "${strategy.value}"`,
            priority: LocatorPriority.LOW,
          });
        }
      } else if (platform === 'android') {
        // Android-specific fallbacks
        if (strategy.type === 'text') {
          fallbacks.push({
            type: 'ui_automator',
            value: `new UiSelector().text("${strategy.value}")`,
            priority: LocatorPriority.LOW,
          });
        }
        if (strategy.type === 'id') {
          fallbacks.push({
            type: 'ui_automator',
            value: `new UiSelector().resourceId("${strategy.value}")`,
            priority: LocatorPriority.LOW,
          });
        }
      }
    }

    return fallbacks;
  }

  /**
   * Try a single fallback strategy
   */
  private async tryStrategy(strategy: LocatorStrategy): Promise<{
    success: boolean;
    element?: ElementHandle;
    error?: string;
  }> {
    try {
      const element = await this.findWithStrategy(strategy);
      if (element) {
        return { success: true, element };
      }
      return { success: false, error: 'Element not found' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Find element using a specific strategy
   */
  private async findWithStrategy(strategy: LocatorStrategy): Promise<ElementHandle | null> {
    switch (strategy.type) {
      case 'id':
        return this.driver.findById(strategy.value);
      case 'xpath':
        return this.driver.findByXPath(strategy.value);
      case 'accessibility_id':
        return this.driver.findByAccessibilityId(strategy.value);
      case 'css_selector':
        return this.driver.findByCssSelector(strategy.value);
      case 'text':
        return this.driver.findByText(strategy.value);
      case 'class_name':
        return this.driver.findByClassName(strategy.value);
      case 'name':
        return this.driver.findByName(strategy.value);
      case 'tag_name':
        return this.driver.findByTagName(strategy.value);
      case 'ui_automator':
        return this.driver.findByUIAutomator(strategy.value);
      case 'ios_predicate':
        return this.driver.findByIosPredicate(strategy.value);
      case 'ios_class_chain':
        return this.driver.findByIosClassChain(strategy.value);
      case 'custom':
        return this.driver.findByCustom(strategy.value);
      default:
        throw new ElementLocationError(
          LocationErrorType.INVALID_LOCATOR,
          `Unsupported locator type: ${strategy.type}`
        );
    }
  }

  /**
   * Remove duplicate strategies
   */
  private deduplicateStrategies(strategies: LocatorStrategy[]): LocatorStrategy[] {
    const seen = new Set<string>();
    const unique: LocatorStrategy[] = [];

    for (const strategy of strategies) {
      const key = `${strategy.type}:${strategy.value}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(strategy);
      }
    }

    return unique;
  }

  /**
   * Sort strategies by priority
   */
  private sortByPriority(strategies: LocatorStrategy[]): LocatorStrategy[] {
    return [...strategies].sort((a, b) => {
      const priorityA = a.priority ?? LocatorPriority.FALLBACK;
      const priorityB = b.priority ?? LocatorPriority.FALLBACK;
      return priorityA - priorityB;
    });
  }

  /**
   * Convert CSS selector to XPath (basic implementation)
   */
  private cssToXPath(css: string): string {
    if (css.startsWith('#')) {
      return `//*[@id="${css.slice(1)}"]`;
    }
    if (css.startsWith('.')) {
      return `//*[contains(@class, "${css.slice(1)}")]`;
    }
    return `//*[@class="${css}"]`;
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<FallbackConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FallbackConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Create a fallback strategy manager
 */
export function createFallbackManager(
  driver: LocationDriver,
  config?: Partial<FallbackConfig>
): FallbackStrategyManager {
  return new FallbackStrategyManager(driver, config);
}
