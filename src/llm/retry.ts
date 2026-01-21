/**
 * Retry Manager with Exponential Backoff
 * Handles retry logic with configurable exponential backoff and jitter
 */

import type { RetryConfig, LLMErrorType } from './types.js';
import type { Logger } from '../utils/logger.js';
import { LLMErrorType as ErrorTypeEnum } from './types.js';

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialBackoffMs: 1000,
  backoffMultiplier: 2,
  maxBackoffMs: 10000,
  jitterFactor: 0.1,
  retryableTypes: [
    ErrorTypeEnum.RATE_LIMIT,
    ErrorTypeEnum.SERVER_ERROR,
    ErrorTypeEnum.NETWORK_ERROR,
    ErrorTypeEnum.TIMEOUT,
  ],
};

/**
 * Manages retry logic with exponential backoff and jitter
 */
export class RetryManager {
  private readonly config: RetryConfig;
  private readonly logger: Logger | Console;

  constructor(config?: RetryConfig, logger?: Logger) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
    this.logger = logger ?? console;
  }

  /**
   * Execute a function with retry logic
   */
  async execute<T>(
    fn: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: unknown;
    let attempt = 0;

    while (attempt < this.config.maxAttempts) {
      attempt++;

      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // Check if error is retryable
        if (!this.isRetryable(error)) {
          this.logger.error('Non-retryable error encountered', {
            context,
            attempt,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }

        // Check if we should retry
        if (attempt >= this.config.maxAttempts) {
          this.logger.error('Max retry attempts reached', {
            context,
            attempts: attempt,
          });
          throw error;
        }

        // Calculate backoff delay
        const delay = this.calculateBackoff(attempt);

        this.logger.warn('Retrying after error', {
          context,
          attempt,
          maxAttempts: this.config.maxAttempts,
          delayMs: delay,
          error: error instanceof Error ? error.message : String(error),
        });

        // Wait before retrying
        await this.delay(delay);
      }
    }

    throw lastError;
  }

  /**
   * Calculate exponential backoff with jitter
   */
  private calculateBackoff(attempt: number): number {
    // Calculate base exponential backoff
    const baseDelay = Math.min(
      this.config.initialBackoffMs *
        Math.pow(this.config.backoffMultiplier, attempt - 1),
      this.config.maxBackoffMs
    );

    // Add jitter to prevent thundering herd
    const jitter = baseDelay * this.config.jitterFactor * (Math.random() * 2 - 1);

    return Math.max(0, Math.round(baseDelay + jitter));
  }

  /**
   * Check if an error is retryable
   */
  private isRetryable(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    // Check for LLMError with type
    const llmError = error as { type?: LLMErrorType; isRetryable?: boolean };
    if (llmError.type) {
      return (
        llmError.isRetryable ??
        this.config.retryableTypes.includes(llmError.type)
      );
    }

    // Check for common retryable error patterns
    const message = error.message.toLowerCase();
    const retryablePatterns = [
      'timeout',
      'econnreset',
      'econnrefused',
      'etimedout',
      'enotfound',
      'eai_again',
      'rate limit',
      'too many requests',
      'service unavailable',
      'gateway timeout',
      'bad gateway',
      'server error',
      'internal server error',
      '503',
      '502',
      '500',
    ];

    return retryablePatterns.some((pattern) => message.includes(pattern));
  }

  /**
   * Delay for a specified number of milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
