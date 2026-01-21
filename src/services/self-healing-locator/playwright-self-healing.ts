/**
 * Playwright Self-Healing Locator
 * Integrates self-healing capabilities with Playwright
 */

import type { Page, Locator as PlaywrightLocator } from '@playwright/test';
import type {
  SelfHealingLocatorConfig,
  SelfHealingResult,
} from './types.js';
import { SelfHealingLocator, createSelfHealingLocatorWithLLM } from './self-healing-locator.js';
import type { LocatorStrategy, LocationDriver, ElementHandle as LocatorElementHandle } from '../element-location/types.js';
import { createModuleLogger } from '../../utils/logger.js';

const logger = createModuleLogger('playwright-self-healing');

/**
 * Simple element handle wrapper for Playwright elements
 */
class PlaywrightElementHandle implements LocatorElementHandle {
  constructor(private handle: PlaywrightLocator) {}

  async click(): Promise<void> {
    await this.handle.click();
  }

  async sendKeys(keys: string): Promise<void> {
    await this.handle.fill(keys);
  }

  async getText(): Promise<string> {
    return (await this.handle.textContent()) || '';
  }

  async isVisible(): Promise<boolean> {
    return await this.handle.isVisible();
  }

  async isEnabled(): Promise<boolean> {
    return await this.handle.isEnabled();
  }

  async getAttribute(name: string): Promise<string | null> {
    return await this.handle.getAttribute(name);
  }

  async screenshot(): Promise<Buffer> {
    const screenshot = await this.handle.screenshot();
    return screenshot;
  }
}

/**
 * Playwright implementation of LocationDriver for self-healing
 */
class PlaywrightLocationDriver implements LocationDriver {
  constructor(private page: Page) {}

  async findById(id: string): Promise<LocatorElementHandle | null> {
    try {
      const element = await this.page.$(`#${id}`);
      if (!element) return null;
      return new PlaywrightElementHandle(this.page.locator(`#${id}`));
    } catch {
      return null;
    }
  }

  async findByXPath(xpath: string): Promise<LocatorElementHandle | null> {
    try {
      const element = await this.page.$(`xpath=${xpath}`);
      if (!element) return null;
      return new PlaywrightElementHandle(this.page.locator(`xpath=${xpath}`));
    } catch {
      return null;
    }
  }

  async findByAccessibilityId(id: string): Promise<LocatorElementHandle | null> {
    try {
      const locator = this.page.getByTestId(id).first();
      const count = await locator.count();
      if (count === 0) return null;
      return new PlaywrightElementHandle(locator);
    } catch {
      return null;
    }
  }

  async findByCssSelector(selector: string): Promise<LocatorElementHandle | null> {
    try {
      const element = await this.page.$(selector);
      if (!element) return null;
      return new PlaywrightElementHandle(this.page.locator(selector));
    } catch {
      return null;
    }
  }

  async findByText(text: string): Promise<LocatorElementHandle | null> {
    try {
      const locator = this.page.getByText(text).first();
      const count = await locator.count();
      if (count === 0) return null;
      return new PlaywrightElementHandle(locator);
    } catch {
      return null;
    }
  }

  async findByClassName(className: string): Promise<LocatorElementHandle | null> {
    try {
      const element = await this.page.$(`.${className}`);
      if (!element) return null;
      return new PlaywrightElementHandle(this.page.locator(`.${className}`));
    } catch {
      return null;
    }
  }

  async findByName(name: string): Promise<LocatorElementHandle | null> {
    try {
      const element = await this.page.$(`[name="${name}"]`);
      if (!element) return null;
      return new PlaywrightElementHandle(this.page.locator(`[name="${name}"]`));
    } catch {
      return null;
    }
  }

  async findByTagName(tagName: string): Promise<LocatorElementHandle | null> {
    try {
      const element = await this.page.$(tagName);
      if (!element) return null;
      return new PlaywrightElementHandle(this.page.locator(tagName));
    } catch {
      return null;
    }
  }

  async findByCustom(locator: string): Promise<LocatorElementHandle | null> {
    try {
      const element = await this.page.$(locator);
      if (!element) return null;
      return new PlaywrightElementHandle(this.page.locator(locator));
    } catch {
      return null;
    }
  }

  async findByUIAutomator(_selector: string): Promise<LocatorElementHandle | null> {
    // Not applicable for Playwright web
    return null;
  }

  async findByIosPredicate(_predicate: string): Promise<LocatorElementHandle | null> {
    // Not applicable for Playwright web
    return null;
  }

  async findByIosClassChain(_chain: string): Promise<LocatorElementHandle | null> {
    // Not applicable for Playwright web
    return null;
  }

  async getPlatform(): Promise<'ios' | 'android' | 'web'> {
    return 'web';
  }
}

/**
 * Self-healing locator wrapper for Playwright
 * Enhances Playwright locators with AI-powered self-healing capabilities
 */
export class PlaywrightSelfHealingLocator {
  private selfHealingLocator: SelfHealingLocator;
  private driver: PlaywrightLocationDriver;

  constructor(
    private page: Page,
    config?: Partial<SelfHealingLocatorConfig>
  ) {
    this.driver = new PlaywrightLocationDriver(page);
    this.selfHealingLocator = new SelfHealingLocator(this.driver, undefined, config);
  }

  /**
   * Initialize with LLM provider for AI-powered healing
   */
  async initializeWithLLM(config?: Partial<SelfHealingLocatorConfig> & { llmProviderName?: string }): Promise<void> {
    this.selfHealingLocator = await createSelfHealingLocatorWithLLM(this.driver, config);
    logger.info('Playwright self-healing locator initialized with LLM');
  }

  /**
   * Get a Playwright locator with self-healing capabilities
   */
  async getLocator(
    selector: string | LocatorStrategy,
    options?: {
      action?: string;
      expectedElementType?: string;
      enableSelfHealing?: boolean;
    }
  ): Promise<PlaywrightLocator> {
    const locatorStrategy = typeof selector === 'string'
      ? { type: 'css_selector', value: selector, priority: 1 }
      : selector;

    try {
      // First try the original locator
      const initialElement = await this.tryLocator(locatorStrategy);
      if (initialElement) {
        return this.page.locator(
          this.strategyToSelector(locatorStrategy)
        );
      }

      // If enabled, try self-healing
      if (options?.enableSelfHealing !== false && this.selfHealingLocator) {
        const pageSource = await this.getPageSource();
        const healResult = await this.selfHealingLocator.healLocator(
          locatorStrategy,
          'Element not found with original selector',
          {
            pageSource,
            pageUrl: this.page.url(),
            action: options?.action,
            expectedElementType: options?.expectedElementType,
          }
        );

        if (healResult.healed && healResult.finalLocator) {
          logger.info('Self-healing successful', {
            original: `${locatorStrategy.type}:${locatorStrategy.value}`,
            healed: `${healResult.finalLocator.type}:${healResult.finalLocator.value}`,
            attempts: healResult.attempts,
          });

          return this.page.locator(
            this.strategyToSelector(healResult.finalLocator)
          );
        }
      }

      // Fallback to original selector (will fail if element doesn't exist)
      return this.page.locator(
        this.strategyToSelector(locatorStrategy)
      );
    } catch (error) {
      logger.error('Error in getLocator', { error });
      throw error;
    }
  }

  /**
   * Try to find an element with a specific strategy
   */
  private async tryLocator(strategy: LocatorStrategy): Promise<boolean> {
    try {
      const selector = this.strategyToSelector(strategy);
      const locator = this.page.locator(selector);
      const count = await locator.count();
      return count > 0;
    } catch {
      return false;
    }
  }

  /**
   * Convert a locator strategy to a Playwright selector string
   */
  private strategyToSelector(strategy: LocatorStrategy): string {
    switch (strategy.type.toLowerCase()) {
      case 'id':
        return `#${strategy.value}`;
      case 'xpath':
        return `xpath=${strategy.value}`;
      case 'text':
        return `text=${strategy.value}`;
      case 'css_selector':
      default:
        return strategy.value;
    }
  }

  /**
   * Get page source for AI analysis
   */
  private async getPageSource(): Promise<string> {
    try {
      return await this.page.content();
    } catch {
      return '';
    }
  }

  /**
   * Get self-healing statistics
   */
  getStats() {
    return this.selfHealingLocator.getStats();
  }

  /**
   * Clear the self-healing cache
   */
  clearCache() {
    this.selfHealingLocator.clearCache();
  }

  /**
   * Get the underlying self-healing locator
   */
  getSelfHealingLocator(): SelfHealingLocator {
    return this.selfHealingLocator;
  }
}

/**
 * Create a self-healing locator for Playwright
 */
export function createPlaywrightSelfHealingLocator(
  page: Page,
  config?: Partial<SelfHealingLocatorConfig>
): PlaywrightSelfHealingLocator {
  return new PlaywrightSelfHealingLocator(page, config);
}

/**
 * Extension method to add self-healing to a Playwright Page
 */
export async function withSelfHealing(
  page: Page,
  config?: Partial<SelfHealingLocatorConfig>
): Promise<{
  page: Page;
  selfHealing: PlaywrightSelfHealingLocator;
  locator: (selector: string, options?: { action?: string; expectedElementType?: string; enableSelfHealing?: boolean }) => Promise<PlaywrightLocator>;
  $: (selector: string, options?: { action?: string; expectedElementType?: string; enableSelfHealing?: boolean }) => Promise<ElementHandle | null>;
  $$: (selector: string, options?: { action?: string; expectedElementType?: string; enableSelfHealing?: boolean }) => Promise<ElementHandle[]>;
}> {
  const selfHealing = createPlaywrightSelfHealingLocator(page, config);

  // Override locator methods with self-healing versions
  const originalLocator = page.locator.bind(page);
  const original$ = page.$.bind(page);
  const original$$ = page.$$.bind(page);

  const selfHealingLocator = async (
    selector: string,
    options?: { action?: string; expectedElementType?: string; enableSelfHealing?: boolean }
  ) => {
    return selfHealing.getLocator(selector, options);
  };

  const selfHealing$ = async (
    selector: string,
    options?: { action?: string; expectedElementType?: string; enableSelfHealing?: boolean }
  ) => {
    const locator = await selfHealing.getLocator(selector, options);
    return locator.elementHandle();
  };

  const selfHealing$$ = async (
    selector: string,
    options?: { action?: string; expectedElementType?: string; enableSelfHealing?: boolean }
  ) => {
    const locator = await selfHealing.getLocator(selector, options);
    return locator.elementHandles();
  };

  return {
    page,
    selfHealing,
    locator: selfHealingLocator,
    $: selfHealing$,
    $$: selfHealing$$,
  };
}
