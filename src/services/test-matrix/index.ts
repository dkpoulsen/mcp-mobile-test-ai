/**
 * Test Matrix Service
 *
 * Automatically generates test variants across browsers, devices, and viewport sizes
 * from a single test definition. Handles browser-specific quirks and configurations
 * automatically. Schedules execution across the matrix.
 *
 * @example
 * ```ts
 * import { TestMatrix } from './services/test-matrix/index.js';
 *
 * // Define a test
 * const test = {
 *   id: 'login-test',
 *   name: 'User Login Flow',
 *   testFile: './tests/login.spec.ts',
 *   testFn: 'shouldLoginSuccessfully',
 *   timeout: 30000,
 * };
 *
 * // Create a matrix for common browsers and devices
 * const matrix = TestMatrix.createCommon(test);
 * console.log(`Generated ${matrix.variants.length} test variants`);
 *
 * // Execute the matrix
 * const result = await TestMatrix.execute(matrix, async (variant) => {
 *   // Run your test with the variant configuration
 *   return await runTest(variant);
 * });
 *
 * console.log(`Passed: ${result.passedVariants}/${result.totalVariants}`);
 * ```
 */

export * from './types.js';
export * from './preset-devices.js';
export * from './browser-quirks.js';
export * from './variant-generator.js';
export * from './scheduler.js';

import type {
  TestDefinition,
  TestVariant,
  MatrixDimensions,
  MatrixOptions,
  MatrixSchedule,
  MatrixResult,
  BrowserType,
  DeviceCategory,
  BrowserConfig,
  ViewportConfig,
  PresetDevice,
} from './types.js';
import { PresetDevices } from './preset-devices.js';
import {
  generateVariants,
  generateCommonVariants,
  generateMobileVariants,
  generateDesktopVariants,
  generateAllVariants,
  generateViewportVariants,
  filterVariantsByTags,
  getVariantStatistics,
} from './variant-generator.js';
import { MatrixScheduler, createMatrixSchedule } from './scheduler.js';

/**
 * Test Matrix Service API
 */
export const TestMatrix = {
  // === Variant Generation ===

  /**
   * Generate variants for common browsers and devices
   * @param testDefinition - The test definition to matrix
   * @returns Array of test variants
   */
  createCommon: (testDefinition: TestDefinition): TestVariant[] => {
    return generateCommonVariants(testDefinition);
  },

  /**
   * Generate variants for mobile devices only
   * @param testDefinition - The test definition to matrix
   * @returns Array of test variants
   */
  createMobile: (testDefinition: TestDefinition): TestVariant[] => {
    return generateMobileVariants(testDefinition);
  },

  /**
   * Generate variants for desktop browsers only
   * @param testDefinition - The test definition to matrix
   * @returns Array of test variants
   */
  createDesktop: (testDefinition: TestDefinition): TestVariant[] => {
    return generateDesktopVariants(testDefinition);
  },

  /**
   * Generate variants for all preset devices and browsers
   * @param testDefinition - The test definition to matrix
   * @returns Array of test variants
   */
  createAll: (testDefinition: TestDefinition): TestVariant[] => {
    return generateAllVariants(testDefinition);
  },

  /**
   * Generate variants from custom configurations
   * @param testDefinition - The test definition to matrix
   * @param dimensions - Matrix dimensions (browsers, devices, viewports)
   * @param options - Matrix options
   * @returns Array of test variants
   */
  createCustom: (
    testDefinition: TestDefinition,
    dimensions: MatrixDimensions,
    options?: MatrixOptions
  ): TestVariant[] => {
    let variants = generateVariants(testDefinition, dimensions);

    if (options?.includeTags || options?.excludeTags) {
      variants = filterVariantsByTags(
        variants,
        options.includeTags ?? [],
        options.excludeTags ?? []
      );
    }

    if (options?.priorityFn) {
      variants.sort((a, b) => options.priorityFn!(b) - options.priorityFn!(a));
    }

    return variants;
  },

  /**
   * Generate variants from viewport configurations
   * @param testDefinition - The test definition to matrix
   * @param viewports - Array of viewport dimensions
   * @param browsers - Browsers to test (default: chromium, firefox, webkit)
   * @returns Array of test variants
   */
  createFromViewports: (
    testDefinition: TestDefinition,
    viewports: Array<{ width: number; height: number }>,
    browsers?: BrowserType[]
  ): TestVariant[] => {
    return generateViewportVariants(testDefinition, viewports, browsers);
  },

  // === Scheduling ===

  /**
   * Create a matrix schedule with execution batches
   * @param testDefinition - The test definition to matrix
   * @param browsers - Browsers to test
   * @param devices - Devices to test
   * @param options - Matrix options
   * @returns Matrix schedule
   */
  schedule: (
    testDefinition: TestDefinition,
    browsers?: BrowserType[],
    devices?: string[],
    options?: MatrixOptions
  ): MatrixSchedule => {
    return createMatrixSchedule(testDefinition, { browsers, devices }, options);
  },

  /**
   * Execute a matrix schedule
   * @param schedule - The matrix schedule
   * @param executor - Function to execute each variant
   * @returns Matrix execution result
   */
  execute: MatrixScheduler.execute,

  /**
   * Execute an array of variants in parallel
   * @param variants - Array of test variants
   * @param executor - Function to execute each variant
   * @param maxParallel - Maximum parallel executions
   * @returns Array of variant results
   */
  executeVariants: async (
    variants: TestVariant[],
    executor: (variant: TestVariant) => Promise<{ variantId: string; status: string; duration: number }>,
    maxParallel?: number
  ): Promise<MatrixResult[]> => {
    const schedule = createMatrixSchedule(variants[0].testDefinition, {}, { maxParallel });
    schedule.variants = variants;
    // Recalculate batches
    const parallel = maxParallel ?? 1;
    schedule.batches = [];
    for (let i = 0; i < variants.length; i += parallel) {
      schedule.batches.push(variants.slice(i, i + parallel));
    }
    return [await MatrixScheduler.execute(schedule, executor as any)];
  },

  // === Utilities ===

  /**
   * Get statistics for a set of variants
   * @param variants - Array of test variants
   * @returns Statistics about the variants
   */
  getStats: getVariantStatistics,

  /**
   * Filter variants by tags
   * @param variants - Array of test variants
   * @param includeTags - Tags to include
   * @param excludeTags - Tags to exclude
   * @returns Filtered array of variants
   */
  filterByTags: filterVariantsByTags,

  // === Preset Devices ===

  /**
   * Access to preset device library
   */
  devices: PresetDevices,

  /**
   * Get a specific preset device
   * @param name - Device name
   * @returns Device configuration or undefined
   */
  getDevice: (name: string): PresetDevice | undefined => {
    return PresetDevices.get(name);
  },

  /**
   * Get all preset devices
   * @returns Array of all preset devices
   */
  getAllDevices: (): PresetDevice[] => {
    return PresetDevices.all;
  },

  /**
   * Get devices by category
   * @param category - Device category (desktop, tablet, mobile)
   * @returns Array of devices in the category
   */
  getDevicesByCategory: (category: DeviceCategory): PresetDevice[] => {
    return PresetDevices[category] ?? [];
  },
};

// Re-export types for convenience
export type {
  TestDefinition,
  TestVariant,
  MatrixDimensions,
  MatrixOptions,
  MatrixSchedule,
  MatrixResult,
} from './types.js';
export type { VariantResult } from './scheduler.js';
export type { BrowserQuirks } from './types.js';
export type {
  BrowserType,
  DeviceCategory,
  BrowserConfig,
  ViewportConfig,
  PresetDevice,
} from './types.js';
