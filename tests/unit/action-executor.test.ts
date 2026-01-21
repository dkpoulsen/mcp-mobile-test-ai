/**
 * Action Executor Verification Test
 * Tests the core functionality of the action executor service
 */

import { describe, it, mock, before, after } from 'node:test';
import assert from 'node:assert';
import {
  ActionExecutor,
  createActionExecutor,
  WaitHandler,
  createWaitHandler,
  ScreenshotCapture,
  createScreenshotCapture,
  ActionType,
  SwipeDirection,
  ActionExecutorErrorType,
  ActionExecutorError,
  type MobileAction,
  type ActionResult,
  type ActionDriver,
  type ElementHandle,
  type ActionSelector,
  type Rect,
  type Point,
} from '../../src/services/action-executor/index.js';

/**
 * Mock element handle for testing
 */
class MockElementHandle implements ElementHandle {
  private _text = 'Test Element';
  private _visible = true;
  private _enabled = true;
  private _selected = false;
  private _bounds: Rect = { left: 10, top: 10, right: 110, bottom: 60, width: 100, height: 50 };

  constructor(private _id: string) {}

  async click(): Promise<void> {
    this._visible = true;
  }

  async longPress(duration?: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, duration || 1000));
  }

  async sendKeys(keys: string): Promise<void> {
    this._text += keys;
  }

  async clear(): Promise<void> {
    this._text = '';
  }

  async getText(): Promise<string> {
    return this._text;
  }

  getAttribute(_name: string): Promise<string | null> {
    return Promise.resolve('test-value');
  }

  async isVisible(): Promise<boolean> {
    return this._visible;
  }

  async isEnabled(): Promise<boolean> {
    return this._enabled;
  }

  async isSelected(): Promise<boolean> {
    return this._selected;
  }

  async getBounds(): Promise<Rect> {
    return { ...this._bounds };
  }

  async screenshot(): Promise<Buffer> {
    return Buffer.from('mock-screenshot');
  }

  async scrollIntoView(): Promise<void> {
    this._visible = true;
  }

  // Test helpers
  setText(text: string): void {
    this._text = text;
  }

  setVisible(visible: boolean): void {
    this._visible = visible;
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  setSelected(selected: boolean): void {
    this._selected = selected;
  }
}

/**
 * Mock driver for testing
 */
class MockActionDriver implements ActionDriver {
  private elements = new Map<string, MockElementHandle>();
  private windowSize = { width: 400, height: 800 };
  private screenshotCount = 0;

  constructor() {
    // Create some default elements
    this.createElement('button1', 'Submit Button');
    this.createElement('input1', 'text input');
    this.createElement('toggle1', 'Toggle');
  }

  private createElement(id: string, text: string): void {
    const element = new MockElementHandle(id);
    element.setText(text);
    this.elements.set(id, element);
  }

  async findElement(selector: ActionSelector): Promise<ElementHandle | null> {
    await this.sleep(10); // Simulate network delay

    // Check if element exists by value (id)
    const element = this.elements.get(selector.value);
    if (element) {
      return element;
    }

    // Try finding by type value combination
    for (const [id, elem] of this.elements.entries()) {
      if (selector.value.includes(id) || selector.value.includes(elem.getText() || '')) {
        return elem;
      }
    }

    return null;
  }

  async findElements(selector: ActionSelector): Promise<ElementHandle[]> {
    const found: ElementHandle[] = [];
    for (const [id, elem] of this.elements.entries()) {
      if (selector.value.includes(id)) {
        found.push(elem);
      }
    }
    return found;
  }

  async getPageSource(): Promise<string> {
    return '<mock-page-source>';
  }

  async executeScript(script: string, _args: unknown[]): Promise<unknown> {
    if (script.includes('true')) {
      return true;
    }
    return false;
  }

  async screenshot(_path?: string): Promise<Buffer> {
    this.screenshotCount++;
    return Buffer.from(`mock-screenshot-${this.screenshotCount}`);
  }

  async getWindowSize(): Promise<{ width: number; height: number }> {
    return { ...this.windowSize };
  }

  async getElementBounds(element: ElementHandle): Promise<Rect> {
    return element.getBounds();
  }

  async tap(_x: number, _y: number): Promise<void> {
    // Mock tap implementation
  }

  async longPress(_x: number, _y: number, duration?: number): Promise<void> {
    await this.sleep(duration || 1000);
  }

  async swipe(_startX: number, _startY: number, _endX: number, _endY: number, _duration?: number): Promise<void> {
    await this.sleep(100);
  }

  async scroll(_direction: SwipeDirection, _distance?: number): Promise<void> {
    await this.sleep(100);
  }

  async sendKeys(_keys: string): Promise<void> {
    // Mock send keys implementation
  }

  async goBack(): Promise<void> {
    await this.sleep(100);
  }

  async hideKeyboard(): Promise<void> {
    await this.sleep(50);
  }

  async performGesture(_steps: unknown[]): Promise<void> {
    await this.sleep(200);
  }

  async getPlatform(): Promise<'ios' | 'android' | 'web'> {
    return 'android';
  }

  async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Test helpers
  getMockElement(id: string): MockElementHandle | undefined {
    return this.elements.get(id);
  }

  addMockElement(id: string, text: string): MockElementHandle {
    const element = new MockElementHandle(id);
    element.setText(text);
    this.elements.set(id, element);
    return element;
  }

  setWindowSize(width: number, height: number): void {
    this.windowSize = { width, height };
  }
}

describe('Action Executor Service', () => {
  let driver: MockActionDriver;

  before(() => {
    driver = new MockActionDriver();
  });

  describe('ActionExecutor', () => {
    it('should create an executor instance', () => {
      const executor = createActionExecutor(driver);
      assert.ok(executor);
      assert.strictEqual(executor.getActionCount(), 0);
    });

    it('should execute a tap action successfully', async () => {
      const executor = createActionExecutor(driver);
      const action: MobileAction = {
        type: ActionType.TAP,
        selector: { value: 'button1' },
        description: 'Tap submit button',
      };

      const result = await executor.executeAction(action);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.action.type, ActionType.TAP);
      assert.strictEqual(result.retries, 0);
      assert.ok(result.duration > 0);
    });

    it('should execute an input action successfully', async () => {
      const executor = createActionExecutor(driver);
      const action: MobileAction = {
        type: ActionType.INPUT,
        selector: { value: 'input1' },
        inputConfig: {
          text: 'Hello World',
          clearFirst: true,
        },
      };

      const result = await executor.executeAction(action);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.input, true);
      assert.strictEqual(result.data?.text, 'Hello World');
      assert.strictEqual(result.data?.cleared, true);
    });

    it('should execute a clear action successfully', async () => {
      const executor = createActionExecutor(driver);
      const action: MobileAction = {
        type: ActionType.CLEAR,
        selector: { value: 'input1' },
      };

      const result = await executor.executeAction(action);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.cleared, true);
    });

    it('should execute a swipe action successfully', async () => {
      const executor = createActionExecutor(driver, {
        defaultActionTimeout: 5000,
        implicitWaitTimeout: 1000,
        screenshotBeforeAction: false,
        screenshotAfterAction: false,
        screenshotOnError: false,
      });
      const action: MobileAction = {
        type: ActionType.SWIPE,
        swipeConfig: {
          direction: SwipeDirection.UP,
          duration: 500,
        },
      };

      const result = await executor.executeAction(action);

      // If failed, log the error for debugging
      if (!result.success) {
        console.log('Swipe action failed with error:', result.error);
        console.log('Result:', JSON.stringify(result, null, 2));
      }

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.swiped, true);
      assert.strictEqual(result.data?.duration, 500);
    });

    it('should execute a scroll action successfully', async () => {
      const executor = createActionExecutor(driver);
      const action: MobileAction = {
        type: ActionType.SCROLL,
        swipeConfig: {
          direction: SwipeDirection.DOWN,
          distance: 0.5,
        },
      };

      const result = await executor.executeAction(action);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.scrolled, true);
      assert.strictEqual(result.data?.direction, SwipeDirection.DOWN);
    });

    it('should execute a long press action successfully', async () => {
      const executor = createActionExecutor(driver);
      const action: MobileAction = {
        type: ActionType.LONG_PRESS,
        selector: { value: 'button1' },
        tapConfig: {
          duration: 100,
        },
      };

      const result = await executor.executeAction(action);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.longPressed, true);
      assert.strictEqual(result.data?.duration, 100);
    });

    it('should execute a toggle action successfully', async () => {
      const executor = createActionExecutor(driver);
      const mockToggle = driver.getMockElement('toggle1')!;
      mockToggle.setSelected(false);

      const action: MobileAction = {
        type: ActionType.TOGGLE,
        selector: { value: 'toggle1' },
      };

      const result = await executor.executeAction(action);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.toggled, true);
      assert.strictEqual(result.data?.previousState, false);
    });

    it('should execute go back action successfully', async () => {
      const executor = createActionExecutor(driver);
      const action: MobileAction = {
        type: ActionType.GO_BACK,
      };

      const result = await executor.executeAction(action);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.navigatedBack, true);
    });

    it('should execute hide keyboard action successfully', async () => {
      const executor = createActionExecutor(driver);
      const action: MobileAction = {
        type: ActionType.HIDE_KEYBOARD,
      };

      const result = await executor.executeAction(action);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.keyboardHidden, true);
    });

    it('should execute a wait action with duration', async () => {
      const executor = createActionExecutor(driver);
      const action: MobileAction = {
        type: ActionType.WAIT,
        waitConfig: {
          duration: 50,
        },
      };

      const startTime = Date.now();
      const result = await executor.executeAction(action);
      const duration = Date.now() - startTime;

      assert.strictEqual(result.success, true);
      assert.ok(duration >= 50);
    });

    it('should skip an action marked with skip: true', async () => {
      const executor = createActionExecutor(driver);
      const action: MobileAction = {
        type: ActionType.TAP,
        selector: { value: 'button1' },
        skip: true,
      };

      const result = await executor.executeAction(action);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.skipped, true);
      assert.strictEqual(result.duration, 0);
    });

    it('should handle element not found error', async () => {
      const executor = createActionExecutor(driver);
      const action: MobileAction = {
        type: ActionType.TAP,
        selector: { value: 'nonexistent' },
      };

      const result = await executor.executeAction(action);

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
      assert.ok(result.retries > 0);
    });

    it('should execute batch actions', async () => {
      const executor = createActionExecutor(driver);
      const actions: MobileAction[] = [
        { type: ActionType.TAP, selector: { value: 'button1' } },
        { type: ActionType.WAIT, waitConfig: { duration: 25 } },
        { type: ActionType.GO_BACK },
      ];

      const result = await executor.executeBatch(actions);

      assert.strictEqual(result.total, 3);
      assert.strictEqual(result.successCount, 3);
      assert.strictEqual(result.failureCount, 0);
      assert.strictEqual(result.results.length, 3);
    });

    it('should handle batch with failures', async () => {
      const executor = createActionExecutor(driver);
      const actions: MobileAction[] = [
        { type: ActionType.TAP, selector: { value: 'button1' } },
        { type: ActionType.TAP, selector: { value: 'nonexistent' } },
        { type: ActionType.GO_BACK },
      ];

      const result = await executor.executeBatch(actions, { continueOnError: true });

      assert.strictEqual(result.total, 3);
      assert.strictEqual(result.successCount, 2);
      assert.strictEqual(result.failureCount, 1);
    });

    it('should update configuration', () => {
      const executor = createActionExecutor(driver);
      const originalConfig = executor.getConfig();

      executor.updateConfig({
        screenshotBeforeAction: true,
        screenshotAfterAction: true,
        defaultRetries: 5,
      });

      const newConfig = executor.getConfig();
      assert.strictEqual(newConfig.screenshotBeforeAction, true);
      assert.strictEqual(newConfig.screenshotAfterAction, true);
      assert.strictEqual(newConfig.defaultRetries, 5);
      assert.strictEqual(newConfig.implicitWaitTimeout, originalConfig.implicitWaitTimeout);
    });
  });

  describe('WaitHandler', () => {
    it('should create a wait handler', () => {
      const handler = createWaitHandler(driver);
      assert.ok(handler);
    });

    it('should perform implicit wait for existing element', async () => {
      const handler = createWaitHandler(driver);
      const result = await handler.implicitWait({ value: 'button1' }, 1000);

      assert.strictEqual(result.satisfied, true);
      assert.ok(result.data);
    });

    it('should timeout on implicit wait for non-existent element', async () => {
      const handler = createWaitHandler(driver);
      const result = await handler.implicitWait({ value: 'nonexistent' }, 100);

      assert.strictEqual(result.satisfied, false);
      assert.ok(result.error);
    });

    it('should wait for element to be visible', async () => {
      const handler = createWaitHandler(driver);
      const element = driver.getMockElement('button1')!;
      element.setVisible(true);

      const result = await handler.waitForVisible({ value: 'button1' }, 1000);

      assert.strictEqual(result.satisfied, true);
    });

    it('should wait for element to be enabled', async () => {
      const handler = createWaitHandler(driver);
      const element = driver.getMockElement('button1')!;
      element.setEnabled(true);

      const result = await handler.waitForEnabled({ value: 'button1' }, 1000);

      assert.strictEqual(result.satisfied, true);
    });

    it('should wait for text content', async () => {
      const handler = createWaitHandler(driver);
      const element = driver.getMockElement('button1')!;
      element.setText('Submit Button');

      const result = await handler.waitForText({ value: 'button1' }, 'Submit', 1000);

      assert.strictEqual(result.satisfied, true);
    });

    it('should perform explicit wait with custom condition', async () => {
      const handler = createWaitHandler(driver);
      let conditionMet = false;

      setTimeout(() => {
        conditionMet = true;
      }, 50);

      const result = await handler.explicitWait(
        async () => {
          return { satisfied: conditionMet };
        },
        500,
        50
      );

      assert.strictEqual(result.satisfied, true);
    });

    it('should timeout on explicit wait', async () => {
      const handler = createWaitHandler(driver);

      const result = await handler.explicitWait(
        async () => {
          return { satisfied: false, error: 'Condition not met' };
        },
        100,
        50
      );

      assert.strictEqual(result.satisfied, false);
      assert.ok(result.error);
    });
  });

  describe('ScreenshotCapture', () => {
    it('should create a screenshot capture instance', () => {
      const capture = createScreenshotCapture(driver, { directory: './test-screenshots' });
      assert.ok(capture);
    });

    it('should capture before screenshot', async () => {
      const capture = createScreenshotCapture(driver, { directory: './test-screenshots' });
      const action: MobileAction = {
        type: ActionType.TAP,
        selector: { value: 'button1' },
      };

      const screenshot = await capture.captureBefore(action);

      assert.strictEqual(screenshot.phase, 'before');
      assert.ok(screenshot.path);
      assert.ok(screenshot.timestamp);
    });

    it('should capture after screenshot', async () => {
      const capture = createScreenshotCapture(driver, { directory: './test-screenshots' });
      const action: MobileAction = {
        type: ActionType.TAP,
        selector: { value: 'button1' },
      };

      const screenshot = await capture.captureAfter(action);

      assert.strictEqual(screenshot.phase, 'after');
      assert.ok(screenshot.path);
    });

    it('should capture screenshots around an action', async () => {
      const capture = createScreenshotCapture(driver, { directory: './test-screenshots' });
      const action: MobileAction = {
        type: ActionType.TAP,
        selector: { value: 'button1' },
      };

      const { before, after } = await capture.captureAround(action, async () => {
        await driver.sleep(10);
      });

      assert.strictEqual(before.phase, 'before');
      assert.strictEqual(after.phase, 'after');
      assert.ok(capture.getCount() > 0);
    });

    it('should track screenshot count', () => {
      const capture = createScreenshotCapture(driver);

      assert.strictEqual(capture.getCount(), 0);

      capture.resetCount();
      assert.strictEqual(capture.getCount(), 0);
    });
  });

  describe('ActionExecutorError', () => {
    it('should create action executor error', () => {
      const action: MobileAction = {
        type: ActionType.TAP,
        selector: { value: 'button1' },
      };

      const error = new ActionExecutorError(
        ActionExecutorErrorType.ELEMENT_NOT_FOUND,
        'Element not found',
        action
      );

      assert.strictEqual(error.name, 'ActionExecutorError');
      assert.strictEqual(error.type, ActionExecutorErrorType.ELEMENT_NOT_FOUND);
      assert.strictEqual(error.action, action);
      assert.ok(error.message.includes('ELEMENT_NOT_FOUND'));
    });
  });
});
