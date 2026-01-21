/**
 * Action Executor - Core Mobile Action Execution
 *
 * Executes mobile actions including tap, swipe, scroll, input text, and gestures
 * with support for implicit and explicit waits, and screenshot capture.
 */

import type {
  ActionDriver,
  ActionSelector,
  MobileAction,
  ActionResult,
  BatchExecutionResult,
  BatchExecutionOptions,
  ActionExecutorConfig,
  ElementHandle,
  TapConfig,
  SwipeConfig,
  InputConfig,
  Point,
  Rect,
} from './types.js';
import {
  ActionType,
  ActionExecutorError,
  ActionExecutorErrorType,
  SwipeDirection,
} from './types.js';
import { WaitHandler, createWaitHandler } from './wait-handler.js';
import { ScreenshotCapture, createScreenshotCapture } from './screenshot-capture.js';
import { createModuleLogger } from '../../utils/logger.js';

const logger = createModuleLogger('action-executor');

/**
 * Default action executor configuration
 */
const DEFAULT_CONFIG: Required<ActionExecutorConfig> = {
  implicitWaitTimeout: 5000,
  explicitWaitTimeout: 30000,
  defaultActionTimeout: 10000,
  defaultRetries: 2,
  retryDelay: 500,
  screenshotOnError: true,
  screenshotBeforeAction: false,
  screenshotAfterAction: false,
  screenshotDirectory: './screenshots',
  animateActions: false,
  animationDuration: 300,
};

/**
 * Action Executor class for executing mobile actions
 */
export class ActionExecutor {
  private driver: ActionDriver;
  private config: Required<ActionExecutorConfig>;
  private waitHandler: WaitHandler;
  private screenshotCapture: ScreenshotCapture;
  private actionCount = 0;

  constructor(driver: ActionDriver, config?: ActionExecutorConfig) {
    this.driver = driver;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize wait handler
    this.waitHandler = createWaitHandler(this.driver, {
      implicitTimeout: this.config.implicitWaitTimeout,
      explicitTimeout: this.config.explicitWaitTimeout,
    });

    // Initialize screenshot capture
    this.screenshotCapture = createScreenshotCapture(this.driver, {
      directory: this.config.screenshotDirectory,
    });

    logger.info('Action Executor initialized', {
      implicitWaitTimeout: this.config.implicitWaitTimeout,
      explicitWaitTimeout: this.config.explicitWaitTimeout,
      defaultActionTimeout: this.config.defaultActionTimeout,
    });
  }

  /**
   * Execute a single mobile action
   */
  async executeAction(action: MobileAction): Promise<ActionResult> {
    const startTime = Date.now();
    const screenshots: any[] = [];
    let retries = 0;
    let lastError: Error | undefined;

    // Skip action if marked
    if (action.skip) {
      logger.debug('Action skipped', { type: action.type, id: action.id });
      return {
        action,
        success: true,
        duration: 0,
        retries: 0,
        screenshots,
        data: { skipped: true },
      };
    }

    // Generate action ID if not provided
    if (!action.id) {
      action.id = `action_${this.actionCount++}`;
    }

    logger.info('Executing action', {
      type: action.type,
      id: action.id,
      description: action.description,
    });

    // Capture before screenshot if configured
    if (this.config.screenshotBeforeAction) {
      try {
        const beforeShot = await this.screenshotCapture.captureBefore(action);
        screenshots.push(beforeShot);
      } catch (error) {
        logger.warn('Failed to capture before screenshot', { error });
      }
    }

    // Execute with retries
    const maxRetries = action.retries ?? this.config.defaultRetries;
    const timeout = action.timeout ?? this.config.defaultActionTimeout;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Process wait config if present
        if (action.waitConfig) {
          await this.waitHandler.processWaitConfig(action.waitConfig, timeout);
        }

        // Execute the specific action
        const result = await this.executeActionByType(action);

        // Capture after screenshot if configured
        if (this.config.screenshotAfterAction) {
          try {
            const afterShot = await this.screenshotCapture.captureAfter(action);
            screenshots.push(afterShot);
          } catch (error) {
            logger.warn('Failed to capture after screenshot', { error });
          }
        }

        const duration = Date.now() - startTime;
        logger.info('Action completed successfully', {
          type: action.type,
          id: action.id,
          duration,
          retries: attempt,
        });

        return {
          action,
          success: true,
          duration,
          retries: attempt,
          screenshots,
          data: result,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retries = attempt;

        // Capture error screenshot if configured
        if (this.config.screenshotOnError && attempt === maxRetries) {
          try {
            const errorShot = await this.screenshotCapture.captureAfter(action, {
              path: `${this.config.screenshotDirectory}/error_${action.type}_${action.id}_${Date.now()}.png`,
            });
            screenshots.push(errorShot);
          } catch (screenshotError) {
            logger.warn('Failed to capture error screenshot', { error: screenshotError });
          }
        }

        // Log retry attempt
        if (attempt < maxRetries) {
          logger.debug('Retrying action', {
            type: action.type,
            attempt: attempt + 1,
            maxRetries: maxRetries + 1,
          });
          await this.driver.sleep(this.config.retryDelay);
        }
      }
    }

    // All retries failed
    const duration = Date.now() - startTime;
    const errorMsg = lastError?.message || 'Unknown error';

    logger.error('Action failed after all retries', {
      type: action.type,
      id: action.id,
      duration,
      retries,
      error: errorMsg,
    });

    return {
      action,
      success: false,
      error: errorMsg,
      duration,
      retries,
      screenshots,
    };
  }

  /**
   * Execute action based on its type
   */
  private async executeActionByType(action: MobileAction): Promise<Record<string, unknown> | undefined> {
    const type = action.type.toLowerCase();

    switch (type) {
      case ActionType.TAP:
        return this.executeTap(action);

      case ActionType.LONG_PRESS:
        return this.executeLongPress(action);

      case ActionType.SWIPE:
        return this.executeSwipe(action);

      case ActionType.SCROLL:
        return this.executeScroll(action);

      case ActionType.INPUT:
        return this.executeInput(action);

      case ActionType.CLEAR:
        return this.executeClear(action);

      case ActionType.SELECT:
        return this.executeSelect(action);

      case ActionType.TOGGLE:
        return this.executeToggle(action);

      case ActionType.GO_BACK:
        return this.executeGoBack(action);

      case ActionType.HIDE_KEYBOARD:
        return this.executeHideKeyboard(action);

      case ActionType.WAIT:
        return this.executeWait(action);

      case ActionType.SCREENSHOT:
        return this.executeScreenshot(action);

      case ActionType.GESTURE:
        return this.executeGesture(action);

      case ActionType.PINCH:
        return this.executePinch(action);

      case ActionType.CUSTOM:
        return this.executeCustom(action);

      default:
        throw new ActionExecutorError(
          ActionExecutorErrorType.INVALID_ACTION,
          `Unknown action type: ${action.type}`,
          action
        );
    }
  }

  /**
   * Execute tap/click action
   */
  private async executeTap(action: MobileAction): Promise<Record<string, unknown>> {
    if (!action.selector) {
      throw new ActionExecutorError(
        ActionExecutorErrorType.INVALID_SELECTOR,
        'Tap action requires a selector',
        action
      );
    }

    const element = await this.findElementOrFail(action.selector);
    const config = action.tapConfig || {};

    // Apply animation if configured
    if (this.config.animateActions) {
      await this.animateTap(element, config);
    }

    await element.click();

    return {
      tapped: true,
      selector: action.selector,
    };
  }

  /**
   * Execute long press action
   */
  private async executeLongPress(action: MobileAction): Promise<Record<string, unknown>> {
    if (!action.selector) {
      throw new ActionExecutorError(
        ActionExecutorErrorType.INVALID_SELECTOR,
        'Long press action requires a selector',
        action
      );
    }

    const element = await this.findElementOrFail(action.selector);
    const config = action.tapConfig || {};
    const duration = config.duration || 1000;

    await element.longPress(duration);

    return {
      longPressed: true,
      duration,
      selector: action.selector,
    };
  }

  /**
   * Execute swipe action
   */
  private async executeSwipe(action: MobileAction): Promise<Record<string, unknown>> {
    const config = action.swipeConfig || {};
    const windowSize = await this.driver.getWindowSize();

    let start: Point;
    let end: Point;

    if (config.start && config.end) {
      // Absolute coordinates provided
      start = config.start;
      end = config.end;
    } else if (action.selector) {
      // Swipe from element
      const element = await this.findElementOrFail(action.selector);
      const bounds = await element.getBounds();

      // Calculate start point (element center with offset if provided)
      start = {
        x: bounds.left + bounds.width / 2 + (config.offset?.x || 0),
        y: bounds.top + bounds.height / 2 + (config.offset?.y || 0),
      };

      // Calculate end point based on direction
      end = this.calculateSwipeEndPoint(start, config.direction || SwipeDirection.UP, windowSize);
    } else if (config.direction) {
      // Swipe from center of screen in direction
      start = {
        x: windowSize.width / 2,
        y: windowSize.height / 2,
      };
      end = this.calculateSwipeEndPoint(start, config.direction, windowSize);
    } else {
      throw new ActionExecutorError(
        ActionExecutorErrorType.INVALID_ACTION,
        'Swipe action requires selector, start/end points, or direction',
        action
      );
    }

    const duration = config.duration || 500;

    await this.driver.swipe(start.x, start.y, end.x, end.y, duration);

    return {
      swiped: true,
      from: start,
      to: end,
      duration,
    };
  }

  /**
   * Execute scroll action
   */
  private async executeScroll(action: MobileAction): Promise<Record<string, unknown>> {
    const config = action.swipeConfig || {};
    const direction = config.direction || SwipeDirection.UP;
    const distance = config.distance || 0.5; // Default to 50% of screen height

    await this.driver.scroll(direction, distance);

    return {
      scrolled: true,
      direction,
      distance,
    };
  }

  /**
   * Execute input action
   */
  private async executeInput(action: MobileAction): Promise<Record<string, unknown>> {
    if (!action.selector) {
      throw new ActionExecutorError(
        ActionExecutorErrorType.INVALID_SELECTOR,
        'Input action requires a selector',
        action
      );
    }

    if (!action.inputConfig?.text) {
      throw new ActionExecutorError(
        ActionExecutorErrorType.INPUT_FAILED,
        'Input action requires text in inputConfig',
        action
      );
    }

    const element = await this.findElementOrFail(action.selector);
    const config = action.inputConfig;

    // Clear field if configured
    if (config.clearFirst) {
      await element.clear();
    }

    // Send keys
    await element.sendKeys(config.text);

    // Submit if configured (press Enter)
    if (config.submit) {
      await this.driver.sendKeys('\uE007'); // Enter key
    }

    return {
      input: true,
      text: config.text,
      cleared: config.clearFirst,
      submitted: config.submit,
    };
  }

  /**
   * Execute clear action
   */
  private async executeClear(action: MobileAction): Promise<Record<string, unknown>> {
    if (!action.selector) {
      throw new ActionExecutorError(
        ActionExecutorErrorType.INVALID_SELECTOR,
        'Clear action requires a selector',
        action
      );
    }

    const element = await this.findElementOrFail(action.selector);
    await element.clear();

    return {
      cleared: true,
      selector: action.selector,
    };
  }

  /**
   * Execute select action
   */
  private async executeSelect(action: MobileAction): Promise<Record<string, unknown>> {
    if (!action.selector) {
      throw new ActionExecutorError(
        ActionExecutorErrorType.INVALID_SELECTOR,
        'Select action requires a selector',
        action
      );
    }

    const element = await this.findElementOrFail(action.selector);

    // Click to open picker/dropdown
    await element.click();

    // Wait for picker to open
    await this.driver.sleep(500);

    // Find and click the option (implementation depends on platform)
    // This is a simplified version - real implementation would need platform-specific logic
    const optionValue = action.customData?.value as string | undefined;
    if (optionValue) {
      // Try to find and click option with the text
      // This would need to be more sophisticated for real use
      logger.debug('Selecting option', { value: optionValue });
    }

    return {
      selected: true,
      value: optionValue,
    };
  }

  /**
   * Execute toggle action
   */
  private async executeToggle(action: MobileAction): Promise<Record<string, unknown>> {
    if (!action.selector) {
      throw new ActionExecutorError(
        ActionExecutorErrorType.INVALID_SELECTOR,
        'Toggle action requires a selector',
        action
      );
    }

    const element = await this.findElementOrFail(action.selector);

    // Check current state
    const isSelected = await element.isSelected();

    // Toggle if current state doesn't match desired state
    const desiredState = action.customData?.state as boolean | undefined;
    if (desiredState !== undefined && isSelected === desiredState) {
      // Already in desired state
      return {
        toggled: false,
        currentState: isSelected,
      };
    }

    await element.click();

    return {
      toggled: true,
      previousState: isSelected,
    };
  }

  /**
   * Execute go back action
   */
  private async executeGoBack(_action: MobileAction): Promise<Record<string, unknown>> {
    await this.driver.goBack();

    return {
      navigatedBack: true,
    };
  }

  /**
   * Execute hide keyboard action
   */
  private async executeHideKeyboard(_action: MobileAction): Promise<Record<string, unknown>> {
    await this.driver.hideKeyboard();

    return {
      keyboardHidden: true,
    };
  }

  /**
   * Execute wait action
   */
  private async executeWait(action: MobileAction): Promise<Record<string, unknown>> {
    const config = action.waitConfig || {};
    const result = await this.waitHandler.processWaitConfig(config, config.timeout);

    if (!result.satisfied) {
      throw new ActionExecutorError(
        ActionExecutorErrorType.TIMEOUT,
        result.error || 'Wait condition not satisfied',
        action
      );
    }

    return {
      waited: true,
      condition: config.condition || 'duration',
      duration: config.duration,
    };
  }

  /**
   * Execute screenshot action
   */
  private async executeScreenshot(action: MobileAction): Promise<Record<string, unknown>> {
    const config = action.screenshotConfig || {};
    const screenshot = await this.screenshotCapture.captureAfter(action, config);

    return {
      screenshot: true,
      path: screenshot.path,
    };
  }

  /**
   * Execute gesture action
   */
  private async executeGesture(action: MobileAction): Promise<Record<string, unknown>> {
    if (!action.gestureSteps || action.gestureSteps.length === 0) {
      throw new ActionExecutorError(
        ActionExecutorErrorType.INVALID_ACTION,
        'Gesture action requires gestureSteps',
        action
      );
    }

    await this.driver.performGesture(action.gestureSteps);

    return {
      gesture: true,
      steps: action.gestureSteps.length,
    };
  }

  /**
   * Execute pinch action
   */
  private async executePinch(action: MobileAction): Promise<Record<string, unknown>> {
    const config = action.pinchConfig;
    if (!config) {
      throw new ActionExecutorError(
        ActionExecutorErrorType.INVALID_ACTION,
        'Pinch action requires pinchConfig',
        action
      );
    }

    // Convert pinch to gesture steps
    const windowSize = await this.driver.getWindowSize();
    const center = config.center || { x: windowSize.width / 2, y: windowSize.height / 2 };
    const percent = Math.abs(config.percent);

    // Build gesture steps for pinch
    const steps = this.buildPinchGesture(center, config.percent, config.speed || 50);

    await this.driver.performGesture(steps);

    return {
      pinched: true,
      percent: config.percent,
    };
  }

  /**
   * Execute custom action
   */
  private async executeCustom(action: MobileAction): Promise<Record<string, unknown>> {
    const script = action.customData?.script as string | undefined;
    const args = action.customData?.args as unknown[] || [];

    if (script) {
      const result = await this.driver.executeScript(script, args);
      return {
        custom: true,
        result,
      };
    }

    // If no script, just log and return
    logger.debug('Custom action executed', { customData: action.customData });

    return {
      custom: true,
      data: action.customData,
    };
  }

  /**
   * Execute multiple actions in batch
   */
  async executeBatch(
    actions: MobileAction[],
    options?: BatchExecutionOptions
  ): Promise<BatchExecutionResult> {
    const startTime = Date.now();
    const results: ActionResult[] = [];

    const opts = {
      stopOnError: false,
      continueOnError: true,
      actionDelay: 0,
      parallelism: 1,
      ...options,
    };

    logger.info('Executing batch actions', {
      count: actions.length,
      parallelism: opts.parallelism,
    });

    // Process actions in parallel batches
    for (let i = 0; i < actions.length; i += opts.parallelism) {
      const batch = actions.slice(i, i + opts.parallelism);

      const batchResults = await Promise.all(
        batch.map(async (action) => {
          const result = await this.executeAction(action);

          // Add delay between actions if configured
          if (opts.actionDelay && opts.actionDelay > 0) {
            await this.driver.sleep(opts.actionDelay);
          }

          return result;
        })
      );

      results.push(...batchResults);

      // Check if we should stop on error
      if (opts.stopOnError) {
        const hasFailure = batchResults.some((r) => !r.success);
        if (hasFailure) {
          logger.info('Stopping batch due to error');
          break;
        }
      }

      // Check if we should continue on error
      if (!opts.continueOnError) {
        const hasFailure = batchResults.some((r) => !r.success);
        if (hasFailure) {
          logger.info('Stopping batch due to error (continueOnError=false)');
          break;
        }
      }
    }

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    const totalDuration = Date.now() - startTime;

    logger.info('Batch execution completed', {
      total: results.length,
      successful: successful.length,
      failed: failed.length,
      duration: totalDuration,
    });

    return {
      results,
      successful,
      failed,
      total: results.length,
      successCount: successful.length,
      failureCount: failed.length,
      totalDuration,
    };
  }

  /**
   * Find element or throw error
   */
  private async findElementOrFail(selector: ActionSelector): Promise<ElementHandle> {
    const result = await this.waitHandler.implicitWait(
      selector,
      this.config.implicitWaitTimeout
    );

    if (!result.satisfied || !result.data) {
      throw new ActionExecutorError(
        ActionExecutorErrorType.ELEMENT_NOT_FOUND,
        result.error || 'Element not found'
      );
    }

    return result.data as ElementHandle;
  }

  /**
   * Calculate swipe end point based on direction
   */
  private calculateSwipeEndPoint(
    start: Point,
    direction: SwipeDirection,
    windowSize: { width: number; height: number }
  ): Point {
    const distance = Math.min(windowSize.width, windowSize.height) * 0.3;

    switch (direction) {
      case SwipeDirection.UP:
        return { x: start.x, y: start.y - distance };
      case SwipeDirection.DOWN:
        return { x: start.x, y: start.y + distance };
      case SwipeDirection.LEFT:
        return { x: start.x - distance, y: start.y };
      case SwipeDirection.RIGHT:
        return { x: start.x + distance, y: start.y };
      default:
        return start;
    }
  }

  /**
   * Build gesture steps for pinch zoom
   */
  private buildPinchGesture(
    center: Point,
    percent: number,
    speed: number
  ): any[] {
    const isZoomIn = percent > 0;
    const offset = Math.abs(percent) * 2; // Pixels per percent

    const duration = Math.max(100, Math.abs(speed) * 10);

    // For pinch zoom: two fingers moving toward/away from center
    const finger1Start = { x: center.x - offset, y: center.y };
    const finger1End = { x: center.x - (isZoomIn ? offset * 2 : offset / 2), y: center.y };

    const finger2Start = { x: center.x + offset, y: center.y };
    const finger2End = { x: center.x + (isZoomIn ? offset * 2 : offset / 2), y: center.y };

    return [
      { action: 'press', position: finger1Start },
      { action: 'press', position: finger2Start },
      { action: 'wait', duration: duration / 2 },
      { action: 'moveTo', position: finger1End },
      { action: 'moveTo', position: finger2End },
      { action: 'wait', duration: duration / 2 },
      { action: 'release' },
    ];
  }

  /**
   * Animate tap for visual debugging
   */
  private async animateTap(element: ElementHandle, config: TapConfig): Promise<void> {
    // Visual animation feedback - highlight element before tapping
    const duration = this.config.animationDuration;
    await this.driver.sleep(duration / 2);
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<Required<ActionExecutorConfig>> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ActionExecutorConfig>): void {
    this.config = { ...this.config, ...config };

    // Update dependent components
    if (config.implicitWaitTimeout || config.explicitWaitTimeout) {
      this.waitHandler.updateConfig({
        implicitTimeout: this.config.implicitWaitTimeout,
        explicitTimeout: this.config.explicitWaitTimeout,
      });
    }

    if (config.screenshotDirectory) {
      this.screenshotCapture.updateConfig({
        directory: this.config.screenshotDirectory,
      });
    }
  }

  /**
   * Get action count
   */
  getActionCount(): number {
    return this.actionCount;
  }

  /**
   * Reset action count
   */
  resetActionCount(): void {
    this.actionCount = 0;
  }
}

/**
 * Create a new action executor instance
 */
export function createActionExecutor(
  driver: ActionDriver,
  config?: ActionExecutorConfig
): ActionExecutor {
  return new ActionExecutor(driver, config);
}
