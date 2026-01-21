/**
 * Browser-specific quirks and configurations
 *
 * Handles browser-specific behaviors, workarounds, and optimizations.
 */

import type { BrowserType, BrowserQuirks } from './types.js';

/**
 * Known browser quirks and their workarounds
 */
const BROWSER_QUIRKS: Record<BrowserType, BrowserQuirks> = {
  chromium: {
    waitForNetworkIdle: false,
    pageLoadWait: 0,
    useNativeEvents: false,
    preferSelectors: ['css', 'aria', 'text', 'xpath'],
    disableAnimations: false,
  },

  chrome: {
    waitForNetworkIdle: false,
    pageLoadWait: 0,
    useNativeEvents: false,
    preferSelectors: ['css', 'aria', 'text', 'xpath'],
    disableAnimations: false,
  },

  firefox: {
    waitForNetworkIdle: true,
    pageLoadWait: 100,
    useNativeEvents: true,
    avoidSelectors: [
      '-webkit-', // WebKit-specific pseudo-classes
      ':empty', // Firefox handles :empty differently
    ],
    preferSelectors: ['css', 'aria', 'text', 'xpath'],
    disableAnimations: false,
    injectedCSS: `
      /* Firefox-specific scrollbar fix */
      * { scrollbar-width: thin; }
    `,
  },

  webkit: {
    waitForNetworkIdle: true,
    pageLoadWait: 150,
    useNativeEvents: true,
    avoidSelectors: [
      '::-webkit-', // WebKit-specific pseudo-elements need different handling
    ],
    preferSelectors: ['css', 'text', 'aria', 'xpath'],
    disableAnimations: false,
    injectedCSS: `
      /* WebKit-specific tap highlight fix */
      * { -webkit-tap-highlight-color: transparent; }
      /* WebKit input styling fix */
      input, textarea { -webkit-appearance: none; border-radius: 0; }
    `,
  },

  edge: {
    waitForNetworkIdle: false,
    pageLoadWait: 0,
    useNativeEvents: false,
    preferSelectors: ['css', 'aria', 'text', 'xpath'],
    disableAnimations: false,
  },
};

/**
 * Default timeout multipliers per browser
 */
const TIMEOUT_MULTIPLIERS: Record<BrowserType, number> = {
  chromium: 1.0,
  chrome: 1.0,
  firefox: 1.2,
  webkit: 1.3,
  edge: 1.0,
};

/**
 * Get browser-specific quirks for a browser type
 */
export function getBrowserQuirks(browser: BrowserType): BrowserQuirks {
  return { ...BROWSER_QUIRKS[browser] };
}

/**
 * Get timeout multiplier for a browser
 */
export function getTimeoutMultiplier(browser: BrowserType): number {
  return TIMEOUT_MULTIPLIERS[browser] ?? 1.0;
}

/**
 * Get launch arguments for a browser
 */
export function getBrowserLaunchArgs(browser: BrowserType): string[] {
  const commonArgs = [
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--no-sandbox',
  ];

  const browserSpecificArgs: Record<BrowserType, string[]> = {
    chromium: [
      ...commonArgs,
      '--disable-extensions',
      '--disable-gpu',
    ],
    chrome: [
      ...commonArgs,
      '--disable-extensions',
    ],
    firefox: [],
    webkit: [],
    edge: [
      ...commonArgs,
      '--disable-extensions',
    ],
  };

  return browserSpecificArgs[browser] ?? commonArgs;
}

/**
 * Browser-specific selectors that should be avoided or transformed
 */
export function transformSelectorForBrowser(
  selector: string,
  browser: BrowserType
): string {
  // Firefox doesn't support -webkit- pseudo-elements
  if (browser === 'firefox') {
    return selector
      .replace(/::-webkit-[\w-]+/g, '')
      .replace(/:-webkit-[\w-]+/g, '');
  }

  // WebKit sometimes needs extra handling for pseudo-elements
  if (browser === 'webkit') {
    // WebKit selectors generally work as-is
    return selector;
  }

  return selector;
}

/**
 * Get browser-specific context options
 */
export function getBrowserContextOptions(browser: BrowserType): {
  locale?: string;
  timezoneId?: string;
  permissions?: string[];
  colorScheme?: 'light' | 'dark' | 'no-preference';
  reducedMotion?: 'no-preference' | 'prefer-reduced';
} {
  const commonOptions = {
    colorScheme: 'light' as const,
    reducedMotion: 'no-preference' as const,
  };

  // WebKit has stricter permission handling
  if (browser === 'webkit') {
    return {
      ...commonOptions,
      permissions: [],
    };
  }

  return commonOptions;
}

/**
 * Determine if a browser requires special handling for file uploads
 */
export function requiresSpecialFileUpload(browser: BrowserType): boolean {
  return browser === 'firefox' || browser === 'webkit';
}

/**
 * Get wait strategy for a browser
 */
export function getWaitStrategy(browser: BrowserType): {
  waitForNetworkIdle: boolean;
  networkIdleTimeout: number;
  domContentLoadedWait: number;
} {
  const quirks = getBrowserQuirks(browser);
  return {
    waitForNetworkIdle: quirks.waitForNetworkIdle ?? false,
    networkIdleTimeout: quirks.waitForNetworkIdle ? 500 : 0,
    domContentLoadedWait: quirks.pageLoadWait ?? 0,
  };
}

/**
 * Mobile-specific browser configurations
 */
export function getMobileBrowserConfig(
  browser: BrowserType,
  isMobile: boolean
): {
  userAgent?: string;
  viewport?: { width: number; height: number };
  hasTouch: boolean;
} {
  if (!isMobile) {
    return { hasTouch: false };
  }

  // Mobile browsers typically have touch
  return {
    hasTouch: true,
  };
}

/**
 * Export all quirks helpers
 */
export const BrowserQuirksHelper = {
  getBrowserQuirks,
  getTimeoutMultiplier,
  getBrowserLaunchArgs,
  transformSelectorForBrowser,
  getBrowserContextOptions,
  requiresSpecialFileUpload,
  getWaitStrategy,
  getMobileBrowserConfig,
};
