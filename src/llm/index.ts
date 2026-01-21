/**
 * LLM Module Main Entry Point
 * Exports all LLM provider functionality
 */

// Re-export types
export type {
  ChatMessage,
  CompletionOptions,
  CompletionResponse,
  StreamChunk,
  UsageStats,
  CostStats,
  HealthCheckResult,
  ProviderConfig,
  RetryConfig,
  RateLimitConfig,
} from './types.js';

// Re-export error class and enum
export { LLMError, LLMErrorType } from './types.js';

// Re-export base provider
export { BaseLLMProvider } from './providers/base.js';

// Re-export concrete providers
export { OpenAIProvider } from './providers/openai.js';
export { AnthropicProvider } from './providers/anthropic.js';

// Re-export utility classes
export { RetryManager } from './retry.js';
export { RateLimiter } from './rate-limiter.js';

// Re-export factory
export {
  LLMProviderFactory,
  getProviderFactory,
  createProvider,
  FallbackStrategy,
} from './factory.js';

export type { ProviderFactoryConfig } from './factory.js';
