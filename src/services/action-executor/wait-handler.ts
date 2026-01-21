/**
 * Wait Handler for Action Executor
 *
 * Handles implicit and explicit waits for mobile automation
 */

import type { ActionDriver, ActionSelector, WaitConfig } from './types.js';
import { ActionExecutorError, ActionExecutorErrorType } from './types.js';
import { createModuleLogger } from '../../utils/logger.js';

const logger = createModuleLogger('action-executor:wait-handler');

/**
 * Default wait configuration
 */
const DEFAULT_WAIT_CONFIG = {
  implicitTimeout: 5000, // 5 seconds
  explicitTimeout: 30000, // 30 seconds
  pollingInterval: 500, // 500ms
  maxRetries: 30,
};

/**
 * Wait condition check result
 */
interface WaitConditionResult {
  satisfied: boolean;
  error?: string;
  data?: unknown;
}

/**
 * Wait handler class for managing wait conditions
 */
export class WaitHandler {
  private config: typeof DEFAULT_WAIT_CONFIG;
  private driver: ActionDriver;

  constructor(driver: ActionDriver, config?: Partial<typeof DEFAULT_WAIT_CONFIG>) {
    this.driver = driver;
    this.config = { ...DEFAULT_WAIT_CONFIG, ...config };
  }

  /**
   * Implicit wait - wait for element to be present
   */
  async implicitWait(selector: ActionSelector, timeout?: number): Promise<WaitConditionResult> {
    const waitTimeout = timeout ?? this.config.implicitTimeout;
    const startTime = Date.now();

    logger.debug(`Starting implicit wait for selector: ${JSON.stringify(selector)}`);

    while (Date.now() - startTime < waitTimeout) {
      try {
        const element = await this.driver.findElement(selector);
        if (element) {
          logger.debug(`Element found after ${Date.now() - startTime}ms`);
          return { satisfied: true, data: element };
        }
      } catch (error) {
        // Element not found yet, continue waiting
      }

      await this.driver.sleep(this.config.pollingInterval);
    }

    logger.warn(`Implicit wait timeout after ${waitTimeout}ms`);
    return {
      satisfied: false,
      error: `Element not found within ${waitTimeout}ms`,
    };
  }

  /**
   * Explicit wait with custom condition
   */
  async explicitWait(
    condition: () => Promise<WaitConditionResult>,
    timeout?: number,
    interval?: number
  ): Promise<WaitConditionResult> {
    const waitTimeout = timeout ?? this.config.explicitTimeout;
    const pollInterval = interval ?? this.config.pollingInterval;
    const startTime = Date.now();

    logger.debug(`Starting explicit wait with timeout ${waitTimeout}ms`);

    while (Date.now() - startTime < waitTimeout) {
      try {
        const result = await condition();
        if (result.satisfied) {
          logger.debug(`Wait condition satisfied after ${Date.now() - startTime}ms`);
          return result;
        }
      } catch (error) {
        logger.debug('Wait condition threw error, continuing...', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      await this.driver.sleep(pollInterval);
    }

    logger.warn(`Explicit wait timeout after ${waitTimeout}ms`);
    return {
      satisfied: false,
      error: `Wait condition not satisfied within ${waitTimeout}ms`,
    };
  }

  /**
   * Wait for element to be visible
   */
  async waitForVisible(selector: ActionSelector, timeout?: number): Promise<WaitConditionResult> {
    logger.debug(`Waiting for element to be visible: ${JSON.stringify(selector)}`);

    return this.explicitWait(
      async () => {
        const element = await this.driver.findElement(selector);
        if (!element) {
          return { satisfied: false, error: 'Element not found' };
        }

        const visible = await element.isVisible();
        if (!visible) {
          return { satisfied: false, error: 'Element not visible' };
        }

        return { satisfied: true, data: element };
      },
      timeout
    );
  }

  /**
   * Wait for element to be clickable
   */
  async waitForClickable(selector: ActionSelector, timeout?: number): Promise<WaitConditionResult> {
    logger.debug(`Waiting for element to be clickable: ${JSON.stringify(selector)}`);

    return this.explicitWait(
      async () => {
        const element = await this.driver.findElement(selector);
        if (!element) {
          return { satisfied: false, error: 'Element not found' };
        }

        const visible = await element.isVisible();
        if (!visible) {
          return { satisfied: false, error: 'Element not visible' };
        }

        const enabled = await element.isEnabled();
        if (!enabled) {
          return { satisfied: false, error: 'Element not enabled' };
        }

        return { satisfied: true, data: element };
      },
      timeout
    );
  }

  /**
   * Wait for element to be enabled
   */
  async waitForEnabled(selector: ActionSelector, timeout?: number): Promise<WaitConditionResult> {
    logger.debug(`Waiting for element to be enabled: ${JSON.stringify(selector)}`);

    return this.explicitWait(
      async () => {
        const element = await this.driver.findElement(selector);
        if (!element) {
          return { satisfied: false, error: 'Element not found' };
        }

        const enabled = await element.isEnabled();
        if (!enabled) {
          return { satisfied: false, error: 'Element not enabled' };
        }

        return { satisfied: true, data: element };
      },
      timeout
    );
  }

  /**
   * Wait for element to contain text
   */
  async waitForText(selector: ActionSelector, text: string, timeout?: number): Promise<WaitConditionResult> {
    logger.debug(`Waiting for element to contain text: "${text}"`);

    return this.explicitWait(
      async () => {
        const element = await this.driver.findElement(selector);
        if (!element) {
          return { satisfied: false, error: 'Element not found' };
        }

        const elementText = await element.getText();
        if (!elementText.includes(text)) {
          return { satisfied: false, error: `Element text "${elementText}" does not contain "${text}"` };
        }

        return { satisfied: true, data: element };
      },
      timeout
    );
  }

  /**
   * Wait for element to be selected
   */
  async waitForSelected(selector: ActionSelector, timeout?: number): Promise<WaitConditionResult> {
    logger.debug(`Waiting for element to be selected: ${JSON.stringify(selector)}`);

    return this.explicitWait(
      async () => {
        const element = await this.driver.findElement(selector);
        if (!element) {
          return { satisfied: false, error: 'Element not found' };
        }

        const selected = await element.isSelected();
        if (!selected) {
          return { satisfied: false, error: 'Element not selected' };
        }

        return { satisfied: true, data: element };
      },
      timeout
    );
  }

  /**
   * Wait for element to not be present
   */
  async waitForNotPresent(selector: ActionSelector, timeout?: number): Promise<WaitConditionResult> {
    logger.debug(`Waiting for element to not be present: ${JSON.stringify(selector)}`);

    return this.explicitWait(
      async () => {
        const element = await this.driver.findElement(selector);
        if (element) {
          return { satisfied: false, error: 'Element still present' };
        }

        return { satisfied: true };
      },
      timeout
    );
  }

  /**
   * Wait for element to not be visible
   */
  async waitForNotVisible(selector: ActionSelector, timeout?: number): Promise<WaitConditionResult> {
    logger.debug(`Waiting for element to not be visible: ${JSON.stringify(selector)}`);

    return this.explicitWait(
      async () => {
        const element = await this.driver.findElement(selector);
        if (!element) {
          return { satisfied: true };
        }

        const visible = await element.isVisible();
        if (visible) {
          return { satisfied: false, error: 'Element still visible' };
        }

        return { satisfied: true };
      },
      timeout
    );
  }

  /**
   * Wait using JavaScript condition
   */
  async waitForCondition(script: string, timeout?: number, args: unknown[] = []): Promise<WaitConditionResult> {
    logger.debug(`Waiting for JavaScript condition: ${script}`);

    return this.explicitWait(
      async () => {
        try {
          const result = await this.driver.executeScript(script, args);
          if (result) {
            return { satisfied: true, data: result };
          }
          return { satisfied: false, error: 'Condition returned falsy value' };
        } catch (error) {
          return {
            satisfied: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
      timeout
    );
  }

  /**
   * Process a wait configuration
   */
  async processWaitConfig(config: WaitConfig, timeout?: number): Promise<WaitConditionResult> {
    // Fixed duration wait
    if (config.duration) {
      logger.debug(`Waiting for fixed duration: ${config.duration}ms`);
      await this.driver.sleep(config.duration);
      return { satisfied: true };
    }

    // Wait for element to be present
    if (config.waitForElement) {
      return this.implicitWait(config.waitForElement, timeout ?? config.timeout);
    }

    // Wait for element to be visible
    if (config.waitForVisible) {
      return this.waitForVisible(config.waitForVisible, timeout ?? config.timeout);
    }

    // Wait for element to be clickable
    if (config.waitForClickable) {
      return this.waitForClickable(config.waitForClickable, timeout ?? config.timeout);
    }

    // Wait for custom condition
    if (config.condition) {
      return this.waitForCondition(config.condition, timeout ?? config.timeout);
    }

    // Default: just wait with specified timeout
    const waitTime = timeout ?? config.timeout ?? this.config.explicitTimeout;
    await this.driver.sleep(waitTime);
    return { satisfied: true };
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<typeof DEFAULT_WAIT_CONFIG> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<typeof DEFAULT_WAIT_CONFIG>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Create a new wait handler instance
 */
export function createWaitHandler(
  driver: ActionDriver,
  config?: Partial<typeof DEFAULT_WAIT_CONFIG>
): WaitHandler {
  return new WaitHandler(driver, config);
}
