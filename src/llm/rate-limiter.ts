/**
 * Rate Limiter for LLM API Requests
 * Implements sliding window algorithm for rate limiting
 */

import type { RateLimitConfig } from './types.js';
import type { Logger } from '../utils/logger.js';

/**
 * Rate limiter using sliding window algorithm
 */
export class RateLimiter {
  private readonly config: Required<RateLimitConfig>;
  private readonly logger: Logger | Console;
  private readonly requestTimestamps: number[] = [];

  constructor(config?: RateLimitConfig, logger?: Logger) {
    this.config = {
      maxRequests: config?.maxRequests ?? 60,
      windowMs: config?.windowMs ?? 60000, // 1 minute default
      enabled: config?.enabled ?? true,
    };
    this.logger = logger ?? console;
  }

  /**
   * Acquire a slot for making a request
   * Will wait if rate limit has been reached
   */
  async acquireSlot(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const now = Date.now();

    // Clean up old timestamps outside the window
    this.cleanupOldTimestamps(now);

    // Check if we can proceed immediately
    if (this.requestTimestamps.length < this.config.maxRequests) {
      this.requestTimestamps.push(now);
      return;
    }

    // Calculate wait time
    const oldestTimestamp = this.requestTimestamps[0];
    if (oldestTimestamp === undefined) {
      this.requestTimestamps.push(now);
      return;
    }
    const waitTime = oldestTimestamp + this.config.windowMs - now;

    if (waitTime <= 0) {
      // Window has passed, we can proceed
      this.requestTimestamps.shift();
      this.requestTimestamps.push(now);
      return;
    }

    this.logger.debug('Rate limit reached, waiting', {
      waitTimeMs: waitTime,
      maxRequests: this.config.maxRequests,
      windowMs: this.config.windowMs,
    });

    // Wait until a slot is available
    await this.delay(waitTime);

    // Retry acquiring the slot
    await this.acquireSlot();
  }

  /**
   * Get the number of available request slots
   */
  getAvailableSlots(): number {
    if (!this.config.enabled) {
      return Infinity;
    }

    const now = Date.now();
    this.cleanupOldTimestamps(now);
    return Math.max(0, this.config.maxRequests - this.requestTimestamps.length);
  }

  /**
   * Get the time until the next available slot in milliseconds
   */
  getTimeUntilNextSlot(): number {
    if (!this.config.enabled) {
      return 0;
    }

    const now = Date.now();
    this.cleanupOldTimestamps(now);

    if (this.requestTimestamps.length < this.config.maxRequests) {
      return 0;
    }

    const oldestTimestamp = this.requestTimestamps[0];
    if (oldestTimestamp === undefined) {
      return 0;
    }
    return Math.max(0, oldestTimestamp + this.config.windowMs - now);
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.requestTimestamps.length = 0;
    this.logger.debug('Rate limiter reset');
  }

  /**
   * Remove timestamps outside the current window
   */
  private cleanupOldTimestamps(now: number): void {
    const cutoff = now - this.config.windowMs;
    while (
      this.requestTimestamps.length > 0
    ) {
      const oldestTimestamp = this.requestTimestamps[0];
      if (oldestTimestamp === undefined || oldestTimestamp >= cutoff) {
        break;
      }
      this.requestTimestamps.shift();
    }
  }

  /**
   * Delay for a specified number of milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
