/**
 * Base LLM Provider Interface
 * Abstract base class defining the contract for all LLM providers
 */

import type {
  ChatMessage,
  CompletionOptions,
  CompletionResponse,
  StreamChunk,
  HealthCheckResult,
  ProviderConfig,
} from '../types.js';
import { createModuleLogger } from '../../utils/logger.js';
import type { Logger } from '../../utils/logger.js';
import { RetryManager } from '../retry.js';
import { RateLimiter } from '../rate-limiter.js';

/**
 * Abstract base class for LLM providers
 * Implements common functionality and defines the interface for all providers
 */
export abstract class BaseLLMProvider {
  protected readonly config: ProviderConfig;
  protected readonly logger: Logger;
  protected readonly retryManager: RetryManager;
  protected readonly rateLimiter: RateLimiter;
  protected isHealthy: boolean = true;

  constructor(config: ProviderConfig, providerName: string) {
    this.config = config;
    this.logger = createModuleLogger(`llm:${providerName}`);
    this.retryManager = new RetryManager(config.retry, this.logger);
    this.rateLimiter = new RateLimiter(config.rateLimit, this.logger);
  }

  /**
   * Get the provider name
   */
  abstract get name(): string;

  /**
   * Create a completion (non-streaming)
   */
  abstract createCompletion(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): Promise<CompletionResponse>;

  /**
   * Create a streaming completion
   * Returns an async iterable of chunks
   */
  abstract createStreamingCompletion(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): AsyncIterable<StreamChunk>;

  /**
   * Health check for the provider
   */
  abstract healthCheck(): Promise<HealthCheckResult>;

  /**
   * Execute a request with retry logic and rate limiting
   */
  protected async executeWithRetry<T>(
    requestFn: () => Promise<T>,
    context: string
  ): Promise<T> {
    // Apply rate limiting
    await this.rateLimiter.acquireSlot();

    // Execute with retry logic
    return this.retryManager.execute(requestFn, context);
  }

  /**
   * Check if the provider is currently marked as healthy
   */
  protected checkHealthStatus(): boolean {
    return this.isHealthy;
  }

  /**
   * Mark the provider as unhealthy
   */
  protected markUnhealthy(reason: string): void {
    this.isHealthy = false;
    this.logger.warn('Provider marked as unhealthy', { reason });
  }

  /**
   * Mark the provider as healthy
   */
  protected markHealthy(): void {
    this.isHealthy = true;
    this.logger.debug('Provider marked as healthy');
  }

  /**
   * Merge default options with provided options
   */
  protected resolveOptions(options?: CompletionOptions): Required<CompletionOptions> {
    return {
      maxTokens: options?.maxTokens ?? this.config.maxTokens ?? 2000,
      temperature: options?.temperature ?? this.config.temperature ?? 0.7,
      topP: options?.topP ?? 1.0,
      stopSequences: options?.stopSequences ?? [],
      timeout: options?.timeout ?? this.config.timeout ?? 30000,
      stream: options?.stream ?? false,
    };
  }
}
