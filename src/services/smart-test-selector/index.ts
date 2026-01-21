/**
 * Smart Test Selector Service
 * Main entry point for intelligent test selection based on code changes
 */

export * from './types.js';
export * from './change-analyzer.js';
export * from './coverage-mapper.js';
export * from './smart-test-selector.js';
export * from './cli.js';

import { createModuleLogger } from '../../utils/logger.js';
import {
  SmartTestSelector,
  getGlobalSmartTestSelector,
  DEFAULT_SELECTOR_CONFIG,
} from './smart-test-selector.js';
import type {
  TestSelectorConfig,
  ChangedFile,
  TestSelectionResult,
  SelectedTest,
} from './types.js';

const logger = createModuleLogger('smart-test-selector-service');

/**
 * Smart Test Selector Service
 * High-level API for intelligent test selection
 */
export class SmartTestSelectorService {
  private selector: SmartTestSelector;

  constructor(config?: Partial<TestSelectorConfig>) {
    this.selector = getGlobalSmartTestSelector(undefined, config);
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    logger.info('Initializing smart test selector service');
    // Service is ready to use
  }

  /**
   * Select tests based on changed files
   */
  async selectTests(changedFiles: ChangedFile[]): Promise<TestSelectionResult> {
    return this.selector.selectTests(changedFiles);
  }

  /**
   * Get selected test paths as an array
   */
  async getSelectedTestPaths(changedFiles: ChangedFile[]): Promise<string[]> {
    const result = await this.selectTests(changedFiles);
    return result.selectedTests.map((t: SelectedTest) => t.testPath);
  }

  /**
   * Get test command with selected tests
   */
  async getTestCommand(
    changedFiles: ChangedFile[],
    commandTemplate: string = 'npm test --'
  ): Promise<string> {
    const testPaths = await this.getSelectedTestPaths(changedFiles);

    if (testPaths.length === 0) {
      return `${commandTemplate} --force-exit`; // Run no tests
    }

    const testArgs = testPaths.map((p) => `"${p}"`).join(' ');
    return `${commandTemplate} ${testArgs}`;
  }

  /**
   * Get configuration
   */
  getConfig(): TestSelectorConfig {
    return this.selector.getConfig();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TestSelectorConfig>): void {
    this.selector.updateConfig(config);
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.selector.clearCache();
  }
}

/**
 * Get the service instance
 */
export function getSmartTestSelectorService(
  config?: Partial<TestSelectorConfig>
): SmartTestSelectorService {
  return new SmartTestSelectorService(config);
}

/**
 * Export default config
 */
export { DEFAULT_SELECTOR_CONFIG };
