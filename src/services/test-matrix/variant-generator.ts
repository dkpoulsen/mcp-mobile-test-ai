/**
 * Test variant generator
 *
 * Generates test variants across browsers, devices, and viewports from a single test definition.
 */

import type {
  TestDefinition,
  TestVariant,
  MatrixDimensions,
  BrowserConfig,
  ViewportConfig,
  DeviceCategory,
  BrowserType,
} from './types.js';
import { PresetDevices } from './preset-devices.js';
import {
  getBrowserQuirks,
  getTimeoutMultiplier,
  getBrowserContextOptions,
  getBrowserLaunchArgs,
} from './browser-quirks.js';

/**
 * Default browsers to test against if none specified
 */
const DEFAULT_BROWSERS: BrowserType[] = ['chromium', 'firefox', 'webkit'];

/**
 * Default devices to test against if none specified
 */
const DEFAULT_DEVICES = ['desktop-1920x1080', 'iphone-14', 'ipad-landscape'];

/**
 * Generate unique ID for a test variant
 */
function generateVariantId(
  testId: string,
  browser: BrowserType,
  deviceName: string
): string {
  return `${testId}-${browser}-${deviceName}`.replace(/\s+/g, '-').toLowerCase();
}

/**
 * Generate display name for a test variant
 */
function generateVariantDisplayName(
  testName: string,
  browser: BrowserType,
  deviceName: string
): string {
  return `${testName} [${browser} / ${deviceName}]`;
}

/**
 * Create a browser configuration
 */
function createBrowserConfig(
  browser: BrowserType,
  customConfig?: Partial<BrowserConfig>
): BrowserConfig {
  const launchArgs = getBrowserLaunchArgs(browser);
  const contextOptions = getBrowserContextOptions(browser);

  return {
    browser,
    launchOptions: {
      headless: true,
      args: launchArgs,
      ...customConfig?.launchOptions,
    },
    contextOptions: {
      ...contextOptions,
      ...customConfig?.contextOptions,
    },
    timeoutMultiplier: getTimeoutMultiplier(browser),
  };
}

/**
 * Create viewport configuration from preset device
 */
function viewportFromPreset(deviceName: string): ViewportConfig | undefined {
  const device = PresetDevices.get(deviceName);
  if (!device) return undefined;

  return {
    width: device.viewport.width,
    height: device.viewport.height,
    deviceScaleFactor: device.deviceScaleFactor,
    hasTouch: device.hasTouch,
    isMobile: device.isMobile,
  };
}

/**
 * Calculate variant priority based on browser and device importance
 */
function calculateVariantPriority(
  browser: BrowserType,
  deviceName: string,
  deviceCategory: DeviceCategory
): number {
  let priority = 100;

  // Desktop tests are generally higher priority
  if (deviceCategory === 'desktop') priority += 50;
  // Mobile tests are high priority
  else if (deviceCategory === 'mobile') priority += 30;
  // Tablet tests are medium priority
  else if (deviceCategory === 'tablet') priority += 20;

  // Chromium is baseline, higher priority
  if (browser === 'chromium' || browser === 'chrome') priority += 20;
  // Firefox is next
  else if (browser === 'firefox') priority += 10;
  // WebKit/Safari might have more issues
  else if (browser === 'webkit') priority += 5;

  // Common device configurations get priority
  if (deviceName === 'desktop-1920x1080') priority += 15;
  if (deviceName === 'iphone-14') priority += 10;
  if (deviceName === 'ipad-landscape') priority += 5;

  return priority;
}

/**
 * Estimate execution duration based on browser and device
 */
function estimateDuration(
  baseTimeout: number,
  browser: BrowserType,
  deviceCategory: DeviceCategory
): number {
  const multiplier = getTimeoutMultiplier(browser);

  // Mobile devices might run slower
  const deviceMultiplier = deviceCategory === 'mobile' ? 1.1 : 1.0;

  return Math.ceil(baseTimeout * multiplier * deviceMultiplier);
}

/**
 * Generate all test variants for a given test definition and matrix dimensions
 */
export function generateVariants(
  testDefinition: TestDefinition,
  dimensions: MatrixDimensions
): TestVariant[] {
  const variants: TestVariant[] = [];

  // Determine browsers to test
  const browsers = dimensions.browsers?.map((b) => b.browser) ?? DEFAULT_BROWSERS;
  const browserConfigs = dimensions.browsers ?? browsers.map((b) => createBrowserConfig(b));

  // Determine devices to test
  let deviceNames: string[] = [];
  let viewportConfigs: ViewportConfig[] = [];

  if (dimensions.devices && dimensions.devices.length > 0) {
    deviceNames = dimensions.devices.map((d) => d.name);
  } else if (dimensions.viewports && dimensions.viewports.length > 0) {
    viewportConfigs = dimensions.viewports;
  } else if (dimensions.customDevices && dimensions.customDevices.length > 0) {
    deviceNames = dimensions.customDevices.map((d) => d.name);
    viewportConfigs = dimensions.customDevices.map((d) => d.viewport);
  } else {
    // Use default devices
    deviceNames = DEFAULT_DEVICES;
  }

  // Generate cartesian product of browsers x devices/viewports
  for (const browserConfig of browserConfigs) {
    const browser = browserConfig.browser;

    // Process preset devices
    for (const deviceName of deviceNames) {
      const device = PresetDevices.get(deviceName);
      if (!device) continue;

      const viewport: ViewportConfig = {
        width: device.viewport.width,
        height: device.viewport.height,
        deviceScaleFactor: device.deviceScaleFactor,
        hasTouch: device.hasTouch,
        isMobile: device.isMobile,
        orientation:
          device.viewport.width > device.viewport.height ? 'landscape' : 'portrait',
      };

      const variant = createVariant(
        testDefinition,
        browserConfig,
        viewport,
        device.category,
        deviceName
      );

      variants.push(variant);
    }

    // Process custom viewports
    for (const viewport of viewportConfigs) {
      const deviceCategory = viewport.isMobile
        ? 'mobile'
        : viewport.width < 1024
          ? 'tablet'
          : 'desktop';

      const variant = createVariant(
        testDefinition,
        browserConfig,
        viewport,
        deviceCategory,
        'custom'
      );

      variants.push(variant);
    }

    // Process custom devices
    if (dimensions.customDevices) {
      for (const customDevice of dimensions.customDevices) {
        const viewport: ViewportConfig = {
          ...customDevice.viewport,
          orientation:
            customDevice.viewport.width > customDevice.viewport.height
              ? 'landscape'
              : 'portrait',
        };

        const deviceCategory = viewport.isMobile
          ? 'mobile'
          : viewport.width < 1024
            ? 'tablet'
            : 'desktop';

        const variant = createVariant(
          testDefinition,
          browserConfig,
          viewport,
          deviceCategory,
          customDevice.name
        );

        variants.push(variant);
      }
    }
  }

  // Sort by priority (highest first)
  variants.sort((a, b) => b.priority - a.priority);

  return variants;
}

/**
 * Create a single test variant
 */
function createVariant(
  testDefinition: TestDefinition,
  browserConfig: BrowserConfig,
  viewport: ViewportConfig,
  deviceCategory: DeviceCategory,
  deviceName: string
): TestVariant {
  const browser = browserConfig.browser;
  const quirks = getBrowserQuirks(browser);
  const baseTimeout = testDefinition.timeout ?? 30000;

  const variantId = generateVariantId(testDefinition.id, browser, deviceName);
  const displayName = generateVariantDisplayName(testDefinition.name, browser, deviceName);
  const priority = calculateVariantPriority(browser, deviceName, deviceCategory);
  const estimatedDuration = estimateDuration(baseTimeout, browser, deviceCategory);

  return {
    id: variantId,
    testDefinition,
    browser: browserConfig,
    viewport,
    deviceCategory,
    deviceName,
    quirks,
    displayName,
    priority,
    estimatedDuration,
  };
}

/**
 * Generate variants for common browsers and devices
 */
export function generateCommonVariants(
  testDefinition: TestDefinition
): TestVariant[] {
  return generateVariants(testDefinition, {
    browsers: [
      createBrowserConfig('chromium'),
      createBrowserConfig('firefox'),
      createBrowserConfig('webkit'),
    ],
    devices: PresetDevices.common,
  });
}

/**
 * Generate variants for mobile devices only
 */
export function generateMobileVariants(
  testDefinition: TestDefinition
): TestVariant[] {
  return generateVariants(testDefinition, {
    browsers: [
      createBrowserConfig('chromium'),
      createBrowserConfig('firefox'),
    ],
    devices: PresetDevices.mobile,
  });
}

/**
 * Generate variants for desktop browsers only
 */
export function generateDesktopVariants(
  testDefinition: TestDefinition
): TestVariant[] {
  return generateVariants(testDefinition, {
    browsers: [
      createBrowserConfig('chromium'),
      createBrowserConfig('firefox'),
      createBrowserConfig('webkit'),
    ],
    devices: PresetDevices.desktop,
  });
}

/**
 * Generate variants for all preset devices and browsers
 */
export function generateAllVariants(
  testDefinition: TestDefinition
): TestVariant[] {
  return generateVariants(testDefinition, {
    browsers: [
      createBrowserConfig('chromium'),
      createBrowserConfig('firefox'),
      createBrowserConfig('webkit'),
    ],
    devices: PresetDevices.all,
  });
}

/**
 * Generate variants from custom viewport configurations
 */
export function generateViewportVariants(
  testDefinition: TestDefinition,
  viewports: Array<{ width: number; height: number }>,
  browsers: BrowserType[] = DEFAULT_BROWSERS
): TestVariant[] {
  return generateVariants(testDefinition, {
    browsers: browsers.map((b) => createBrowserConfig(b)),
    viewports: viewports.map((v) => ({
      width: v.width,
      height: v.height,
      orientation: v.width > v.height ? 'landscape' : 'portrait',
    })),
  });
}

/**
 * Filter variants by tags
 */
export function filterVariantsByTags(
  variants: TestVariant[],
  includeTags: string[],
  excludeTags: string[] = []
): TestVariant[] {
  return variants.filter((variant) => {
    const testTags = variant.testDefinition.tags ?? [];

    // Check exclude tags first
    if (excludeTags.length > 0) {
      for (const excludeTag of excludeTags) {
        if (testTags.includes(excludeTag)) {
          return false;
        }
      }
    }

    // Check include tags
    if (includeTags.length > 0) {
      return includeTags.some((tag) => testTags.includes(tag));
    }

    return true;
  });
}

/**
 * Get variant statistics
 */
export function getVariantStatistics(variants: TestVariant[]): {
  total: number;
  byBrowser: Record<string, number>;
  byDeviceCategory: Record<string, number>;
  totalEstimatedDuration: number;
} {
  const stats = {
    total: variants.length,
    byBrowser: {} as Record<string, number>,
    byDeviceCategory: {} as Record<string, number>,
    totalEstimatedDuration: 0,
  };

  for (const variant of variants) {
    stats.byBrowser[variant.browser.browser] =
      (stats.byBrowser[variant.browser.browser] ?? 0) + 1;
    stats.byDeviceCategory[variant.deviceCategory] =
      (stats.byDeviceCategory[variant.deviceCategory] ?? 0) + 1;
    stats.totalEstimatedDuration += variant.estimatedDuration ?? 0;
  }

  return stats;
}
