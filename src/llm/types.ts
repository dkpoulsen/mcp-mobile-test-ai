/**
 * LLM Provider Types and Interfaces
 * Defines common types for all LLM provider implementations
 */

/**
 * Message role in a chat conversation
 */
export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * A single message in a chat conversation
 */
export interface ChatMessage {
  /**
   * The role of the message sender
   */
  role: MessageRole;

  /**
   * The message content
   */
  content: string;

  /**
   * Optional name for the message sender
   */
  name?: string;

  /**
   * Additional metadata for the message
   */
  metadata?: Record<string, unknown>;
}

/**
 * Options for LLM completion requests
 */
export interface CompletionOptions {
  /**
   * Maximum number of tokens to generate
   */
  maxTokens?: number;

  /**
   * Sampling temperature (0-2)
   */
  temperature?: number;

  /**
   * Nucleus sampling parameter (0-1)
   */
  topP?: number;

  /**
   * Stop sequences
   */
  stopSequences?: string[];

  /**
   * Timeout for the request in milliseconds
   */
  timeout?: number;

  /**
   * Stream the response
   */
  stream?: boolean;
}

/**
 * A chunk of a streaming response
 */
export interface StreamChunk {
  /**
   * The delta content for this chunk
   */
  delta: string;

  /**
   * Whether this is the final chunk
   */
  isComplete: boolean;

  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Cost statistics for a completion
 */
export interface CostStats {
  /**
   * Cost for prompt tokens in USD
   */
  promptCost: number;

  /**
   * Cost for completion tokens in USD
   */
  completionCost: number;

  /**
   * Total cost in USD
   */
  totalCost: number;
}

/**
 * Usage statistics for a completion
 */
export interface UsageStats {
  /**
   * Number of tokens in the prompt
   */
  promptTokens: number;

  /**
   * Number of tokens in the completion
   */
  completionTokens: number;

  /**
   * Total tokens used
   */
  totalTokens: number;

  /**
   * Cost breakdown (if calculated)
   */
  cost?: CostStats;
}

/**
 * Response from a completion request
 */
export interface CompletionResponse {
  /**
   * The generated text content
   */
  content: string;

  /**
   * The model used for generation
   */
  model: string;

  /**
   * Usage statistics
   */
  usage?: UsageStats;

  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>;

  /**
   * The provider that generated the response
   */
  provider: string;
}

/**
 * Error types for LLM operations
 */
export enum LLMErrorType {
  /**
   * Authentication failed
   */
  AUTHENTICATION = 'AUTHENTICATION',

  /**
   * Rate limit exceeded
   */
  RATE_LIMIT = 'RATE_LIMIT',

  /**
   * Invalid request
   */
  INVALID_REQUEST = 'INVALID_REQUEST',

  /**
   * Server error
   */
  SERVER_ERROR = 'SERVER_ERROR',

  /**
   * Network error
   */
  NETWORK_ERROR = 'NETWORK_ERROR',

  /**
   * Timeout
   */
  TIMEOUT = 'TIMEOUT',

  /**
   * Unknown error
   */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Custom error class for LLM operations
 */
export class LLMError extends Error {
  constructor(
    public type: LLMErrorType,
    public provider: string,
    message: string,
    public originalError?: unknown,
    public isRetryable: boolean = false
  ) {
    super(`[${provider}] ${type}: ${message}`);
    this.name = 'LLMError';
  }
}

/**
 * Configuration for retry logic
 */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts
   */
  maxAttempts: number;

  /**
   * Initial backoff delay in milliseconds
   */
  initialBackoffMs: number;

  /**
   * Multiplier for exponential backoff
   */
  backoffMultiplier: number;

  /**
   * Maximum backoff delay in milliseconds
   */
  maxBackoffMs: number;

  /**
   * Jitter factor to add to backoff (0-1)
   */
  jitterFactor: number;

  /**
   * Error types that should be retried
   */
  retryableTypes: LLMErrorType[];
}

/**
 * Configuration for rate limiting
 */
export interface RateLimitConfig {
  /**
   * Maximum number of requests per time window
   */
  maxRequests: number;

  /**
   * Time window in milliseconds
   */
  windowMs: number;

  /**
   * Whether rate limiting is enabled
   */
  enabled: boolean;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  /**
   * API key for authentication
   */
  apiKey: string;

  /**
   * Model to use
   */
  model: string;

  /**
   * Base URL for API requests (optional)
   */
  baseUrl?: string;

  /**
   * Default maximum tokens
   */
  maxTokens?: number;

  /**
   * Default temperature
   */
  temperature?: number;

  /**
   * Default timeout in milliseconds
   */
  timeout?: number;

  /**
   * Retry configuration
   */
  retry?: RetryConfig;

  /**
   * Rate limit configuration
   */
  rateLimit?: RateLimitConfig;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  /**
   * Whether the provider is healthy
   */
  healthy: boolean;

  /**
   * Response time in milliseconds
   */
  responseTimeMs?: number;

  /**
   * Error message if unhealthy
   */
  error?: string;

  /**
   * Timestamp of the health check
   */
  timestamp: Date;
}
