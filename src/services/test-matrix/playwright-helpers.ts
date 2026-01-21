/**
 * Playwright helpers for Test Matrix
 *
 * Provides utilities to integrate the test matrix system with Playwright tests.
 */

import type { Page, Browser, BrowserContext } from '@playwright/test';
import type {
  TestVariant,
  BrowserConfig,
  ViewportConfig,
  BrowserQuirks,
} from './types.js';
import { transformSelectorForBrowser, getWaitStrategy } from './browser-quirks.js';

/**
 * Apply variant configuration to a Playwright browser context
 */
export async function applyVariantToContext(
  context: any, // BrowserContext from Playwright doesn't have all methods in types
  variant: TestVariant
): Promise<void> {
  // Apply viewport via the first page if setViewportSize is not on context
  if (context.setViewportSize) {
    await context.setViewportSize({
      width: variant.viewport.width,
      height: variant.viewport.height,
    });
  }

  // Apply device metrics
  if (context.emulateMedia) {
    await context.emulateMedia({
      media: variant.viewport.isMobile ? 'handheld' : 'screen',
      colorScheme: variant.browser.contextOptions?.colorScheme ?? 'light',
      reducedMotion: variant.browser.contextOptions?.reducedMotion ?? 'no-preference',
    });
  }

  // Inject browser-specific CSS if configured
  if (variant.quirks.injectedCSS && context.addInitScript) {
    await context.addInitScript({
      content: `
        const style = document.createElement('style');
        style.textContent = ${JSON.stringify(variant.quirks.injectedCSS)};
        document.head.appendChild(style);
      `,
    });
  }

  // Disable animations if configured
  if (variant.quirks.disableAnimations && context.addInitScript) {
    await context.addInitScript({
      content: `
        const style = document.createElement('style');
        style.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }';
        document.head.appendChild(style);
      `,
    });
  }
}

/**
 * Apply variant configuration to a Playwright page
 */
export async function applyVariantToPage(
  page: Page,
  variant: TestVariant
): Promise<void> {
  // Apply viewport (if not already applied via context)
  await page.setViewportSize({
    width: variant.viewport.width,
    height: variant.viewport.height,
  });

  // Transform selectors for browser quirks
  const originalLocator = page.locator.bind(page);
  page.locator = function (selector: string, options?: any) {
    const transformed = transformSelectorForBrowser(
      selector,
      variant.browser.browser
    );
    return originalLocator(transformed, options);
  } as any;
}

/**
 * Wait for page load based on browser quirks
 */
export async function waitForPageLoad(
  page: Page,
  variant: TestVariant
): Promise<void> {
  const waitStrategy = getWaitStrategy(variant.browser.browser);

  // Wait for DOM content loaded
  if (waitStrategy.domContentLoadedWait > 0) {
    await page.waitForTimeout(waitStrategy.domContentLoadedWait);
  }

  // Wait for network idle if required
  if (waitStrategy.waitForNetworkIdle) {
    try {
      await page.waitForLoadState('networkidle', {
        timeout: waitStrategy.networkIdleTimeout,
      });
    } catch {
      // Ignore timeout - some pages never fully idle
    }
  }
}

/**
 * Transform a selector based on browser quirks
 */
export function transformSelector(
  selector: string,
  browser: string
): string {
  return transformSelectorForBrowser(browser as 'chromium' | 'firefox' | 'webkit' | 'edge' | 'chrome', selector);
}

/**
 * Get Playwright launch options from browser config
 */
export function getPlaywrightLaunchOptions(config: BrowserConfig): any {
  return {
    headless: config.launchOptions?.headless ?? true,
    slowMo: config.launchOptions?.slowMo ?? 0,
    args: config.launchOptions?.args ?? [],
    channel: config.launchOptions?.channel,
    proxy: config.launchOptions?.proxy,
  };
}

/**
 * Get Playwright context options from browser config
 */
export function getPlaywrightContextOptions(config: BrowserConfig): any {
  const options: Record<string, unknown> = {};

  if (config.contextOptions?.locale) {
    options.locale = config.contextOptions.locale;
  }

  if (config.contextOptions?.timezoneId) {
    options.timezoneId = config.contextOptions.timezoneId;
  }

  if (config.contextOptions?.permissions) {
    options.permissions = config.contextOptions.permissions;
  }

  if (config.contextOptions?.colorScheme) {
    options.colorScheme = config.contextOptions.colorScheme;
  }

  if (config.contextOptions?.reducedMotion) {
    options.reducedMotion = config.contextOptions.reducedMotion;
  }

  return options;
}

/**
 * Create a test wrapper that applies variant configuration
 */
export function createVariantTestWrapper<TArgs extends any[] = []>(
  testFn: (page: Page, variant: TestVariant, ...args: TArgs) => Promise<void>
) {
  return async (page: Page, variant: TestVariant, ...args: TArgs): Promise<void> => {
    // Apply variant configuration
    await applyVariantToPage(page, variant);

    // Run the test
    await testFn(page, variant, ...args);
  };
}

/**
 * Run a test with all variants of a matrix
 */
export async function runTestWithVariants(
  page: Page,
  variants: TestVariant[],
  testFn: (page: Page, variant: TestVariant) => Promise<void>,
  onVariantComplete?: (variant: TestVariant, passed: boolean, error?: Error) => void
): Promise<Array<{ variant: TestVariant; passed: boolean; error?: Error }>> {
  const results: Array<{ variant: TestVariant; passed: boolean; error?: Error }> = [];

  for (const variant of variants) {
    try {
      await applyVariantToPage(page, variant);
      await testFn(page, variant);
      results.push({ variant, passed: true });
      onVariantComplete?.(variant, true);
    } catch (error) {
      results.push({
        variant,
        passed: false,
        error: error as Error,
      });
      onVariantComplete?.(variant, false, error as Error);
    }
  }

  return results;
}

/**
 * Export helpers
 */
export const PlaywrightMatrixHelpers = {
  applyVariantToContext,
  applyVariantToPage,
  waitForPageLoad,
  transformSelector,
  getPlaywrightLaunchOptions,
  getPlaywrightContextOptions,
  createVariantTestWrapper,
  runTestWithVariants,
};
