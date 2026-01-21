/**
 * Action Executor Service - Index
 *
 * Exports all action executor functionality including:
 * - Mobile action execution (tap, swipe, scroll, input, gestures)
 * - Implicit and explicit waits
 * - Screenshot capture before and after actions
 * - Batch action execution
 */

// Types
export {
  ActionType,
  SwipeDirection,
  type ActionSelector,
  type Point,
  type Rect,
  type SwipeConfig,
  type TapConfig,
  type InputConfig,
  type WaitConfig,
  type ScreenshotConfig,
  type GestureStep,
  type PinchConfig,
  type MobileAction,
  type ScreenshotMetadata,
  type ActionResult,
  type BatchExecutionOptions,
  type BatchExecutionResult,
  type ActionExecutorConfig,
  type ActionDriver,
  type ElementHandle,
  ActionExecutorErrorType,
  ActionExecutorError,
} from './types.js';

// Action Executor
export {
  ActionExecutor,
  createActionExecutor,
} from './action-executor.js';

// Wait Handler
export {
  WaitHandler,
  createWaitHandler,
} from './wait-handler.js';

// Screenshot Capture
export {
  ScreenshotCapture,
  createScreenshotCapture,
} from './screenshot-capture.js';

// Convenience functions
import { createActionExecutor } from './action-executor.js';
import type { ActionDriver, ActionExecutorConfig, MobileAction, BatchExecutionOptions, BatchExecutionResult, ActionResult } from './types.js';

/**
 * Global action executor instance
 */
let globalExecutor: ReturnType<typeof createActionExecutor> | null = null;

/**
 * Get or create the global action executor
 */
export function getActionExecutor(driver: ActionDriver, config?: ActionExecutorConfig) {
  if (!globalExecutor) {
    globalExecutor = createActionExecutor(driver, config);
  }
  return globalExecutor;
}

/**
 * Reset the global action executor
 */
export function resetActionExecutor(): void {
  globalExecutor = null;
}

/**
 * Execute a single action with a new executor instance
 */
export async function executeAction(
  driver: ActionDriver,
  action: MobileAction,
  config?: ActionExecutorConfig
): Promise<ActionResult> {
  const executor = createActionExecutor(driver, config);
  return executor.executeAction(action);
}

/**
 * Execute multiple actions in batch
 */
export async function executeBatch(
  driver: ActionDriver,
  actions: MobileAction[],
  options?: BatchExecutionOptions,
  config?: ActionExecutorConfig
): Promise<BatchExecutionResult> {
  const executor = createActionExecutor(driver, config);
  return executor.executeBatch(actions, options);
}
