/**
 * Screenshot Capture for Action Executor
 *
 * Handles screenshot capture before and after actions
 */

import type { ActionDriver, ScreenshotConfig, ScreenshotMetadata, MobileAction } from './types.js';
import { ActionExecutorError, ActionExecutorErrorType } from './types.js';
import { createModuleLogger } from '../../utils/logger.js';
import { promises as fs } from 'fs';
import { join } from 'path';

const logger = createModuleLogger('action-executor:screenshot');

/**
 * Default screenshot configuration
 */
const DEFAULT_SCREENSHOT_CONFIG = {
  directory: './screenshots',
  format: 'png' as const,
  quality: 80,
  timestamp: true,
  fullPage: false,
};

/**
 * Screenshot capture class
 */
export class ScreenshotCapture {
  private config: typeof DEFAULT_SCREENSHOT_CONFIG;
  private driver: ActionDriver;
  private screenshotCount = 0;

  constructor(driver: ActionDriver, config?: Partial<typeof DEFAULT_SCREENSHOT_CONFIG>) {
    this.driver = driver;
    this.config = { ...DEFAULT_SCREENSHOT_CONFIG, ...config };
  }

  /**
   * Ensure screenshot directory exists
   */
  private async ensureDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.config.directory, { recursive: true });
    } catch (error) {
      logger.warn('Failed to create screenshot directory', { error });
    }
  }

  /**
   * Generate screenshot filename
   */
  private generateFilename(action: MobileAction, phase: 'before' | 'after', customPath?: string): string {
    if (customPath) {
      return customPath;
    }

    const actionType = action.type || 'unknown';
    const actionId = action.id || `${this.screenshotCount}`;
    const timestamp = this.config.timestamp ? `_${Date.now()}` : '';
    const filename = `${actionType}_${actionId}_${phase}${timestamp}.${this.config.format}`;

    return join(this.config.directory, filename);
  }

  /**
   * Capture a screenshot
   */
  async capture(
    action: MobileAction,
    phase: 'before' | 'after',
    config?: Partial<ScreenshotConfig>
  ): Promise<ScreenshotMetadata> {
    const mergedConfig = { ...this.config, ...config };

    await this.ensureDirectory();

    const startTime = Date.now();
    const path = this.generateFilename(action, phase, config?.path);

    logger.debug(`Capturing ${phase} screenshot`, { action: action.type, path });

    try {
      const buffer = await this.driver.screenshot(path);

      // If path was provided, driver should have saved it
      // If no path, we get a buffer and need to save it
      if (!config?.path && buffer) {
        await fs.writeFile(path, buffer);
      }

      const duration = Date.now() - startTime;

      this.screenshotCount++;

      const metadata: ScreenshotMetadata = {
        phase,
        action,
        path,
        timestamp: new Date(),
        buffer: config?.path ? undefined : buffer,
      };

      logger.debug(`Screenshot captured successfully`, { path, duration });

      return metadata;
    } catch (error) {
      logger.error('Failed to capture screenshot', {
        error: error instanceof Error ? error.message : String(error),
        action: action.type,
        phase,
      });

      throw new ActionExecutorError(
        ActionExecutorErrorType.SCREENSHOT_FAILED,
        `Failed to capture ${phase} screenshot: ${error instanceof Error ? error.message : String(error)}`,
        action,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Capture screenshot before action
   */
  async captureBefore(action: MobileAction, config?: Partial<ScreenshotConfig>): Promise<ScreenshotMetadata> {
    return this.capture(action, 'before', config);
  }

  /**
   * Capture screenshot after action
   */
  async captureAfter(action: MobileAction, config?: Partial<ScreenshotConfig>): Promise<ScreenshotMetadata> {
    return this.capture(action, 'after', config);
  }

  /**
   * Capture screenshots before and after an action
   */
  async captureAround(
    action: MobileAction,
    actionFn: () => Promise<void>,
    config?: Partial<ScreenshotConfig>
  ): Promise<{ before: ScreenshotMetadata; after: ScreenshotMetadata }> {
    const before = await this.captureBefore(action, config);

    try {
      await actionFn();
    } catch (error) {
      // Still capture after screenshot even on error
      logger.warn('Action failed, capturing after screenshot', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const after = await this.captureAfter(action, config);

    return { before, after };
  }

  /**
   * Capture screenshot of a specific element
   */
  async captureElement(
    element: { screenshot(): Promise<Buffer> },
    action: MobileAction,
    phase: 'before' | 'after',
    config?: Partial<ScreenshotConfig>
  ): Promise<ScreenshotMetadata> {
    await this.ensureDirectory();

    const path = this.generateFilename(action, phase, config?.path);
    const timestamp = this.config.timestamp ? `_${Date.now()}` : '';
    const filename = `element_${action.type}_${phase}${timestamp}.${this.config.format}`;
    const elementPath = join(this.config.directory, filename);

    logger.debug(`Capturing element screenshot`, { action: action.type, path: elementPath });

    try {
      const buffer = await element.screenshot();
      await fs.writeFile(elementPath, buffer);

      this.screenshotCount++;

      return {
        phase,
        action,
        path: elementPath,
        timestamp: new Date(),
        buffer,
      };
    } catch (error) {
      logger.error('Failed to capture element screenshot', {
        error: error instanceof Error ? error.message : String(error),
      });

      throw new ActionExecutorError(
        ActionExecutorErrorType.SCREENSHOT_FAILED,
        `Failed to capture element screenshot: ${error instanceof Error ? error.message : String(error)}`,
        action,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get screenshot count
   */
  getCount(): number {
    return this.screenshotCount;
  }

  /**
   * Reset screenshot count
   */
  resetCount(): void {
    this.screenshotCount = 0;
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<typeof DEFAULT_SCREENSHOT_CONFIG> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<typeof DEFAULT_SCREENSHOT_CONFIG>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Create a new screenshot capture instance
 */
export function createScreenshotCapture(
  driver: ActionDriver,
  config?: Partial<typeof DEFAULT_SCREENSHOT_CONFIG>
): ScreenshotCapture {
  return new ScreenshotCapture(driver, config);
}
