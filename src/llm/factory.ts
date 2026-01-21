/**
 * LLM Provider Factory with Graceful Degradation
 * Creates provider instances and handles fallback logic
 */

import type { ProviderConfig, LLMErrorType } from './types.js';
import type { BaseLLMProvider } from './providers/base.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { createModuleLogger } from '../utils/logger.js';
import type { Logger } from '../utils/logger.js';
import { config } from '../config/env.js';
import { LLMErrorType as ErrorTypeEnum } from './types.js';

/**
 * Provider registry for graceful degradation
 */
interface ProviderRegistry {
  primary: BaseLLMProvider;
  fallbacks: BaseLLMProvider[];
}

/**
 * Fallback strategy options
 */
export enum FallbackStrategy {
  /**
   * Only use primary provider, fail if unavailable
   */
  NONE = 'none',

  /**
   * Try fallback providers if primary fails
   */
  FALLBACK = 'fallback',

  /**
   * Round-robin between providers
   */
  ROUND_ROBIN = 'round_robin',

  /**
   * Try all providers in parallel, use first response
   */
  RACE = 'race',
}

/**
 * Factory configuration
 */
export interface ProviderFactoryConfig {
  /**
   * Fallback strategy to use
   */
  fallbackStrategy?: FallbackStrategy;

  /**
   * Whether to enable health checks
   */
  enableHealthChecks?: boolean;

  /**
   * Health check interval in milliseconds
   */
  healthCheckInterval?: number;
}

/**
 * Creates and manages LLM provider instances with graceful degradation
 */
export class LLMProviderFactory {
  private readonly logger: Logger;
  private readonly registry: Map<string, ProviderRegistry> = new Map();
  private healthCheckTimer?: NodeJS.Timeout;
  private readonly config: Required<ProviderFactoryConfig>;

  constructor(config?: ProviderFactoryConfig) {
    this.logger = createModuleLogger('llm:factory');
    this.config = {
      fallbackStrategy: config?.fallbackStrategy ?? FallbackStrategy.NONE,
      enableHealthChecks: config?.enableHealthChecks ?? true,
      healthCheckInterval: config?.healthCheckInterval ?? 30000, // 30 seconds
    };

    if (this.config.enableHealthChecks) {
      this.startHealthChecks();
    }
  }

  /**
   * Create a provider based on the environment configuration
   */
  createProvider(providerName?: string): BaseLLMProvider {
    const name = providerName || config.LLM_PROVIDER;

    const retryableTypes: LLMErrorType[] = [
      ErrorTypeEnum.RATE_LIMIT,
      ErrorTypeEnum.SERVER_ERROR,
      ErrorTypeEnum.NETWORK_ERROR,
      ErrorTypeEnum.TIMEOUT,
    ];

    const providerConfig: ProviderConfig = {
      apiKey: config.LLM_API_KEY,
      model: config.LLM_MODEL,
      baseUrl: config.LLM_API_BASE,
      maxTokens: config.LLM_MAX_TOKENS,
      temperature: config.LLM_TEMPERATURE,
      timeout: 30000,
      retry: {
        maxAttempts: 3,
        initialBackoffMs: 1000,
        backoffMultiplier: 2,
        maxBackoffMs: 10000,
        jitterFactor: 0.1,
        retryableTypes,
      },
      rateLimit: {
        maxRequests: 60,
        windowMs: 60000,
        enabled: true,
      },
    };

    return this.createProviderFromConfig(name, providerConfig);
  }

  /**
   * Create a provider from a specific config
   */
  createProviderFromConfig(name: string, providerConfig: ProviderConfig): BaseLLMProvider {
    switch (name) {
      case 'openai':
        return new OpenAIProvider(providerConfig);
      case 'anthropic':
        return new AnthropicProvider(providerConfig);
      default:
        throw new Error(`Unknown provider: ${name}`);
    }
  }

  /**
   * Create a provider registry with fallback support
   */
  createProviderRegistry(
    providers: Array<{ name: string; config: ProviderConfig }>
  ): ProviderRegistry {
    if (providers.length === 0) {
      throw new Error('At least one provider must be specified');
    }

    const [primaryConfig, ...fallbackConfigs] = providers;

    if (!primaryConfig) {
      throw new Error('Primary provider configuration is required');
    }

    const registry: ProviderRegistry = {
      primary: this.createProviderFromConfig(primaryConfig.name, primaryConfig.config),
      fallbacks: fallbackConfigs.map((f) =>
        this.createProviderFromConfig(f.name, f.config)
      ),
    };

    const key = primaryConfig.name;
    this.registry.set(key, registry);

    this.logger.info('Created provider registry', {
      primary: primaryConfig.name,
      fallbacks: fallbackConfigs.map((f) => f.name),
    });

    return registry;
  }

  /**
   * Get a provider registry by primary provider name
   */
  getRegistry(primaryProviderName: string): ProviderRegistry | undefined {
    return this.registry.get(primaryProviderName);
  }

  /**
   * Execute a completion with graceful degradation
   * Will try fallback providers if configured and primary fails
   */
  async executeWithDegradation(
    registry: ProviderRegistry,
    messages: import('./types.js').ChatMessage[],
    options?: import('./types.js').CompletionOptions
  ): Promise<import('./types.js').CompletionResponse> {
    const { fallbackStrategy } = this.config;

    if (fallbackStrategy === FallbackStrategy.RACE) {
      return this.executeRace(registry, messages, options);
    }

    // Try primary first
    try {
      const health = await registry.primary.healthCheck();
      if (health.healthy) {
        this.logger.debug('Using primary provider');
        return await registry.primary.createCompletion(messages, options);
      }
    } catch (error) {
      this.logger.warn('Primary provider failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Try fallbacks if configured
    if (fallbackStrategy === FallbackStrategy.FALLBACK && registry.fallbacks.length > 0) {
      for (const [index, fallback] of registry.fallbacks.entries()) {
        try {
          this.logger.info(`Attempting fallback provider ${index + 1}`, {
            provider: fallback.name,
          });

          const health = await fallback.healthCheck();
          if (health.healthy) {
            return await fallback.createCompletion(messages, options);
          }
        } catch (error) {
          this.logger.warn(`Fallback provider ${index + 1} failed`, {
            provider: fallback.name,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    throw new Error('All providers failed or are unhealthy');
  }

  /**
   * Execute with race strategy - try all providers in parallel
   */
  private async executeRace(
    registry: ProviderRegistry,
    messages: import('./types.js').ChatMessage[],
    options?: import('./types.js').CompletionOptions
  ): Promise<import('./types.js').CompletionResponse> {
    const allProviders = [registry.primary, ...registry.fallbacks];

    const promises = allProviders.map(async (provider) => {
      try {
        return await provider.createCompletion(messages, options);
      } catch (error) {
        this.logger.warn('Provider failed in race', {
          provider: provider.name,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    });

    try {
      // Return first successful response
      return await Promise.any(promises);
    } catch (error) {
      throw new Error('All providers failed in race');
    }
  }

  /**
   * Start periodic health checks for all registered providers
   */
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(async () => {
      for (const [, registry] of this.registry.entries()) {
        await this.checkRegistryHealth(registry);
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * Check health of all providers in a registry
   */
  private async checkRegistryHealth(registry: ProviderRegistry): Promise<void> {
    const providers = [registry.primary, ...registry.fallbacks];

    for (const provider of providers) {
      try {
        const health = await provider.healthCheck();
        this.logger.debug('Health check result', {
          provider: provider.name,
          healthy: health.healthy,
          responseTimeMs: health.responseTimeMs,
        });
      } catch (error) {
        this.logger.warn('Health check failed', {
          provider: provider.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Stop health checks and cleanup resources
   */
  destroy(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
    this.registry.clear();
    this.logger.info('Provider factory destroyed');
  }

  /**
   * Get all registered provider registries
   */
  getRegistries(): Map<string, ProviderRegistry> {
    return new Map(this.registry);
  }

  /**
   * Get health status of all providers
   */
  async getHealthStatus(): Promise<
    Array<{
      registry: string;
      providers: Array<{
        name: string;
        healthy: boolean;
        responseTimeMs?: number;
      }>;
    }>
  > {
    const results: Array<{
      registry: string;
      providers: Array<{
        name: string;
        healthy: boolean;
        responseTimeMs?: number;
      }>;
    }> = [];

    for (const [key, registry] of this.registry.entries()) {
      const providers = [registry.primary, ...registry.fallbacks];
      const providerResults = await Promise.all(
        providers.map(async (provider) => {
          try {
            const health = await provider.healthCheck();
            return {
              name: provider.name,
              healthy: health.healthy,
              responseTimeMs: health.responseTimeMs,
            };
          } catch {
            return {
              name: provider.name,
              healthy: false,
            };
          }
        })
      );

      results.push({
        registry: key,
        providers: providerResults,
      });
    }

    return results;
  }
}

/**
 * Create a singleton provider factory instance
 */
let factoryInstance: LLMProviderFactory | undefined;

export function getProviderFactory(
  config?: ProviderFactoryConfig
): LLMProviderFactory {
  if (!factoryInstance) {
    factoryInstance = new LLMProviderFactory(config);
  }
  return factoryInstance;
}

/**
 * Create a provider using the factory
 */
export function createProvider(providerName?: string): BaseLLMProvider {
  return getProviderFactory().createProvider(providerName);
}
