/**
 * Timeout Handler - Manages timeout and retry logic for element location
 * Provides configurable timeout handling with exponential backoff.
 */

import type { ElementLocatorConfig, LocationOptions } from './types.js';
import { createModuleLogger } from '../../utils/logger.js';

const logger = createModuleLogger('timeout-handler');

/**
 * Timeout options for a single operation
 */
export interface TimeoutOptions {
  /** Total timeout for the operation */
  timeout: number;

  /** Maximum number of retries */
  maxRetries: number;

  /** Base delay between retries */
  retryDelay: number;

  /** Enable exponential backoff */
  exponentialBackoff: boolean;

  /** Multiplier for exponential backoff */
  backoffMultiplier: number;

  /** Maximum delay between retries */
  maxRetryDelay: number;

  /** Custom retry condition */
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

/**
 * Result of a timed operation
 */
export interface TimeoutResult<T> {
  /** Whether the operation succeeded */
  success: boolean;

  /** The result value if successful */
  value?: T;

  /** Error if failed */
  error?: Error;

  /** Number of attempts made */
  attempts: number;

  /** Total duration in milliseconds */
  duration: number;
}

/**
 * Timeout Handler class
 */
export class TimeoutHandler {
  private config: TimeoutOptions;

  constructor(config: Partial<TimeoutOptions> = {}) {
    this.config = {
      timeout: config.timeout ?? 10000,
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 500,
      exponentialBackoff: config.exponentialBackoff ?? true,
      backoffMultiplier: config.backoffMultiplier ?? 2,
      maxRetryDelay: config.maxRetryDelay ?? 5000,
      shouldRetry: config.shouldRetry,
    };
  }

  /**
   * Execute a function with timeout and retry logic
   */
  async execute<T>(fn: () => Promise<T>): Promise<TimeoutResult<T>> {
    const startTime = Date.now();
    let lastError: Error | undefined;
    let attempts = 0;

    while (attempts <= this.config.maxRetries) {
      attempts++;

      try {
        // Execute with timeout for this attempt
        const value = await this.executeWithTimeout(fn, this.getAttemptTimeout(attempts));

        return {
          success: true,
          value,
          attempts,
          duration: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        logger.debug(
          {
            attempt: attempts,
            error: lastError.message,
          },
          'Operation attempt failed'
        );

        // Check if we should retry
        if (attempts > this.config.maxRetries) {
          break;
        }

        // Check custom retry condition
        if (this.config.shouldRetry && !this.config.shouldRetry(lastError, attempts)) {
          break;
        }

        // Wait before retry
        const delay = this.getRetryDelay(attempts);
        logger.debug(
          {
            attempt: attempts,
            delay,
          },
          'Waiting before retry'
        );
        await this.sleep(delay);
      }
    }

    return {
      success: false,
      error: lastError,
      attempts,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Execute a function with a timeout
   */
  async executeWithTimeout<T>(fn: () => Promise<T>, timeout: number): Promise<T> {
    return Promise.race([
      fn(),
      this.createTimeoutPromise(timeout),
    ]);
  }

  /**
   * Wait for a condition to be true
   */
  async waitFor(
    condition: () => boolean | Promise<boolean>,
    options?: Partial<TimeoutOptions>
  ): Promise<TimeoutResult<void>> {
    const mergedOptions = { ...this.config, ...options };
    const startTime = Date.now();
    const endTime = startTime + mergedOptions.timeout;

    let attempts = 0;

    while (Date.now() < endTime) {
      attempts++;

      try {
        const result = await condition();
        if (result) {
          return {
            success: true,
            attempts,
            duration: Date.now() - startTime,
          };
        }
      } catch (error) {
        logger.debug(
          {
            attempt: attempts,
            error,
          },
          'Condition check failed'
        );
      }

      // Wait before next check
      const delay = this.getRetryDelay(attempts);
      await this.sleep(Math.min(delay, endTime - Date.now()));
    }

    return {
      success: false,
      error: new Error('Condition not met within timeout'),
      attempts,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Execute multiple operations in parallel with individual timeouts
   */
  async executeParallel<T>(
    operations: Array<() => Promise<T>>,
    options?: { timeout?: number; failFast?: boolean }
  ): Promise<TimeoutResult<T>[]> {
    const timeout = options?.timeout ?? this.config.timeout;
    const startTime = Date.now();

    if (options?.failFast) {
      // Execute sequentially, stopping on first failure
      const results: TimeoutResult<T>[] = [];
      for (const op of operations) {
        const result = await this.executeWithTimeout(op, timeout);
        results.push({
          success: true,
          value: result,
          attempts: 1,
          duration: Date.now() - startTime,
        });
        if (!result) {
          break;
        }
      }
      return results;
    }

    // Execute all in parallel
    const results = await Promise.allSettled(
      operations.map((op) => this.executeWithTimeout(op, timeout))
    );

    return results.map((result, index) => ({
      success: result.status === 'fulfilled',
      value: result.status === 'fulfilled' ? result.value : undefined,
      error: result.status === 'rejected' ? result.reason : undefined,
      attempts: 1,
      duration: Date.now() - startTime,
    }));
  }

  /**
   * Create a timeout promise that rejects after specified milliseconds
   */
  private createTimeoutPromise<T>(timeout: number): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * Get the timeout for a specific attempt
   */
  private getAttemptTimeout(attempt: number): number {
    // Reduce timeout for later attempts to avoid excessive total time
    const reductionFactor = Math.max(0.5, 1 - (attempt - 1) * 0.1);
    return Math.floor(this.config.timeout * reductionFactor);
  }

  /**
   * Get the retry delay for a specific attempt
   */
  private getRetryDelay(attempt: number): number {
    if (!this.config.exponentialBackoff) {
      return this.config.retryDelay;
    }

    const delay = this.config.retryDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
    return Math.min(delay, this.config.maxRetryDelay);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<TimeoutOptions> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TimeoutOptions>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Reset configuration to defaults
   */
  reset(): void {
    this.config = {
      timeout: 10000,
      maxRetries: 3,
      retryDelay: 500,
      exponentialBackoff: true,
      backoffMultiplier: 2,
      maxRetryDelay: 5000,
    };
  }
}

/**
 * Create a timeout handler from element locator config
 */
export function createTimeoutHandler(
  config: ElementLocatorConfig,
  options?: LocationOptions
): TimeoutHandler {
  return new TimeoutHandler({
    timeout: options?.timeout ?? config.defaultTimeout,
    maxRetries: options?.maxRetries ?? config.maxRetries,
    retryDelay: config.retryDelay,
    exponentialBackoff: config.exponentialBackoff,
    backoffMultiplier: config.backoffMultiplier,
    maxRetryDelay: config.maxRetryDelay,
    shouldRetry: options?.shouldRetry,
  });
}
