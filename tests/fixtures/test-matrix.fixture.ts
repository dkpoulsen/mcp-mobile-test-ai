/**
 * Test Matrix Fixture for Playwright
 *
 * Provides Playwright fixtures for using the test matrix system.
 */

import { test as base } from '@playwright/test';
import type { Page, BrowserContext } from '@playwright/test';
import type { TestVariant, TestDefinition } from '../../src/services/test-matrix/types.js';
import { TestMatrix } from '../../src/services/test-matrix/index.js';
import {
  applyVariantToContext,
  applyVariantToPage,
  waitForPageLoad,
} from '../../src/services/test-matrix/playwright-helpers.js';

/**
 * Test matrix fixture type
 */
export interface TestMatrixFixture {
  /**
   * Create test variants from a test definition
   */
  createVariants: (
    definition: TestDefinition,
    type?: 'common' | 'mobile' | 'desktop' | 'all'
  ) => TestVariant[];

  /**
   * Create test variants from custom configuration
   */
  createCustomVariants: (
    definition: TestDefinition,
    browsers: Array<'chromium' | 'firefox' | 'webkit'>,
    devices: string[]
  ) => TestVariant[];

  /**
   * Apply variant configuration to the current page
   */
  applyVariant: (variant: TestVariant) => Promise<void>;

  /**
   * Wait for page load based on browser quirks
   */
  waitForLoad: (variant: TestVariant) => Promise<void>;

  /**
   * The test matrix service
   */
  matrix: typeof TestMatrix;
}

/**
 * Extended test with matrix fixture
 */
export const test = base.extend<TestMatrixFixture>({
  /**
   * Create test variants
   */
  createVariants: async ({}, use) => {
    const createVariantsFn: TestMatrixFixture['createVariants'] = (
      definition,
      type = 'common'
    ) => {
      switch (type) {
        case 'common':
          return TestMatrix.createCommon(definition);
        case 'mobile':
          return TestMatrix.createMobile(definition);
        case 'desktop':
          return TestMatrix.createDesktop(definition);
        case 'all':
          return TestMatrix.createAll(definition);
        default:
          return TestMatrix.createCommon(definition);
      }
    };

    await use(createVariantsFn);
  },

  /**
   * Create custom variants
   */
  createCustomVariants: async ({}, use) => {
    await use((definition, browsers, devices) => {
      return TestMatrix.schedule(definition, browsers, devices).variants;
    });
  },

  /**
   * Apply variant to page
   */
  applyVariant: async ({ page }, use) => {
    await use(async (variant) => {
      await applyVariantToPage(page, variant);
    });
  },

  /**
   * Wait for page load
   */
  waitForLoad: async ({ page }, use) => {
    await use(async (variant) => {
      await waitForPageLoad(page, variant);
    });
  },

  /**
   * Test matrix service
   */
  matrix: async ({}, use) => {
    await use(TestMatrix);
  },
});

/**
 * Variant test fixture - runs a test with a specific variant
 */
export interface VariantTestFixture {
  variant: TestVariant;
  applyVariant: () => Promise<void>;
  waitForLoad: () => Promise<void>;
}

/**
 * Create a test template that runs with all variants
 */
export function createVariantTest(
  name: string,
  definition: TestDefinition,
  type: 'common' | 'mobile' | 'desktop' | 'all' = 'common'
) {
  const variants = TestMatrix.createCommon(definition);

  return test.describe(`Matrix: ${name}`, () => {
    for (const variant of variants) {
      test(variant.displayName, async ({ page }) => {
        await applyVariantToPage(page, variant);
        // Test implementation goes here
      });
    }
  });
}

/**
 * Test that runs across browser matrix only
 */
export function createBrowserMatrixTest(
  name: string,
  testFn: (page: Page, browserName: string) => Promise<void>
) {
  const browsers = ['chromium', 'firefox', 'webkit'] as const;

  for (const browser of browsers) {
    test(`${name} [@${browser}]`, async ({ page }) => {
      await testFn(page, browser);
    });
  }
}

/**
 * Test that runs across device matrix only
 */
export function createDeviceMatrixTest(
  name: string,
  devices: string[],
  testFn: (page: Page, deviceName: string) => Promise<void>
) {
  for (const device of devices) {
    test(`${name} [@${device}]`, async ({ page }) => {
      // Apply device viewport
      const presetDevice = TestMatrix.getDevice(device);
      if (presetDevice) {
        await page.setViewportSize(presetDevice.viewport);
      }
      await testFn(page, device);
    });
  }
}

// Re-export base expect
export const expect = base.expect;
