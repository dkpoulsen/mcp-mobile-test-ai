/**
 * OpenAI LLM Provider Implementation
 * Implements the LLM provider interface for OpenAI-compatible APIs
 */

import {
  BaseLLMProvider,
} from './base.js';
import type {
  ChatMessage,
  CompletionOptions,
  CompletionResponse,
  StreamChunk,
  HealthCheckResult,
  ProviderConfig,
  CostStats,
} from '../types.js';
import { LLMError, LLMErrorType } from '../types.js';

/**
 * OpenAI model pricing per 1M tokens (as of 2024)
 * Prices are in USD
 */
interface ModelPricing {
  promptPricePerMillion: number;
  completionPricePerMillion: number;
}

/**
 * Pricing table for OpenAI models
 */
const OPENAI_PRICING: Record<string, ModelPricing> = {
  // GPT-4o
  'gpt-4o': { promptPricePerMillion: 2.50, completionPricePerMillion: 10.00 },
  'gpt-4o-2024-05-13': { promptPricePerMillion: 5.00, completionPricePerMillion: 15.00 },

  // GPT-4o-mini
  'gpt-4o-mini': { promptPricePerMillion: 0.15, completionPricePerMillion: 0.60 },
  'gpt-4o-mini-2024-07-18': { promptPricePerMillion: 0.15, completionPricePerMillion: 0.60 },

  // GPT-4 Turbo
  'gpt-4-turbo': { promptPricePerMillion: 10.00, completionPricePerMillion: 30.00 },
  'gpt-4-turbo-2024-04-09': { promptPricePerMillion: 10.00, completionPricePerMillion: 30.00 },
  'gpt-4-0125-preview': { promptPricePerMillion: 10.00, completionPricePerMillion: 30.00 },
  'gpt-4-1106-preview': { promptPricePerMillion: 10.00, completionPricePerMillion: 30.00 },

  // GPT-4
  'gpt-4': { promptPricePerMillion: 30.00, completionPricePerMillion: 60.00 },
  'gpt-4-0613': { promptPricePerMillion: 30.00, completionPricePerMillion: 60.00 },

  // GPT-3.5 Turbo
  'gpt-3.5-turbo': { promptPricePerMillion: 0.50, completionPricePerMillion: 1.50 },
  'gpt-3.5-turbo-0125': { promptPricePerMillion: 0.50, completionPricePerMillion: 1.50 },
  'gpt-3.5-turbo-1106': { promptPricePerMillion: 1.00, completionPricePerMillion: 2.00 },

  // GPT-4.1
  'gpt-4.1': { promptPricePerMillion: 2.00, completionPricePerMillion: 8.00 },
  'gpt-4.1-2025-04-14': { promptPricePerMillion: 2.00, completionPricePerMillion: 8.00 },

  // O1 Series
  'o1-preview': { promptPricePerMillion: 15.00, completionPricePerMillion: 60.00 },
  'o1-preview-2024-09-12': { promptPricePerMillion: 15.00, completionPricePerMillion: 60.00 },
  'o1-mini': { promptPricePerMillion: 1.10, completionPricePerMillion: 4.40 },
  'o1-mini-2024-09-12': { promptPricePerMillion: 1.10, completionPricePerMillion: 4.40 },
};

/**
 * Default pricing for unknown models (conservative estimate)
 */
const DEFAULT_PRICING: ModelPricing = {
  promptPricePerMillion: 1.00,
  completionPricePerMillion: 2.00,
};

/**
 * Get pricing for a model
 */
function getPricingForModel(model: string): ModelPricing {
  // Try exact match first
  if (OPENAI_PRICING[model]) {
    return OPENAI_PRICING[model];
  }

  // Try prefix match for model families
  for (const [key, pricing] of Object.entries(OPENAI_PRICING)) {
    if (model.startsWith(key)) {
      return pricing;
    }
  }

  return DEFAULT_PRICING;
}

/**
 * Calculate cost based on token usage
 */
function calculateCost(
  promptTokens: number,
  completionTokens: number,
  model: string
): CostStats {
  const pricing = getPricingForModel(model);

  const promptCost = (promptTokens / 1_000_000) * pricing.promptPricePerMillion;
  const completionCost = (completionTokens / 1_000_000) * pricing.completionPricePerMillion;

  return {
    promptCost,
    completionCost,
    totalCost: promptCost + completionCost,
  };
}

/**
 * OpenAI API response interface
 */
interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI streaming chunk interface
 */
interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI API error response interface
 */
interface OpenAIErrorResponse {
  error?: {
    message: string;
    type: string;
    param?: string;
    code?: string;
  };
}

/**
 * OpenAI Provider
 * Supports both OpenAI and OpenAI-compatible APIs
 */
export class OpenAIProvider extends BaseLLMProvider {
  private readonly baseUrl: string;

  constructor(config: ProviderConfig) {
    super(config, 'openai');
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  }

  get name(): string {
    return 'openai';
  }

  /**
   * Create a completion using OpenAI API
   */
  async createCompletion(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): Promise<CompletionResponse> {
    const resolvedOptions = this.resolveOptions(options);

    return this.executeWithRetry(async () => {
      const startTime = Date.now();

      try {
        const response = await this.makeRequest(
          '/chat/completions',
          {
            model: this.config.model,
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
              name: m.name,
            })),
            max_tokens: resolvedOptions.maxTokens,
            temperature: resolvedOptions.temperature,
            top_p: resolvedOptions.topP,
            stop: resolvedOptions.stopSequences.length > 0 ? resolvedOptions.stopSequences : undefined,
          },
          resolvedOptions.timeout
        );

        const data = await response.json() as OpenAIResponse;
        const choice = data.choices[0];

        if (!choice) {
          throw new LLMError(
            LLMErrorType.INVALID_REQUEST,
            this.name,
            'No choices returned in response'
          );
        }

        this.markHealthy();

        // Calculate cost if usage data is available
        const cost = data.usage
          ? calculateCost(
              data.usage.prompt_tokens,
              data.usage.completion_tokens,
              data.model
            )
          : undefined;

        return {
          content: choice.message.content,
          model: data.model,
          usage: data.usage
            ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens,
                cost,
              }
            : undefined,
          metadata: {
            id: data.id,
            finishReason: choice.finish_reason,
            responseTime: Date.now() - startTime,
          },
          provider: this.name,
        };
      } catch (error) {
        throw this.handleError(error);
      }
    }, 'OpenAI.createCompletion');
  }

  /**
   * Create a streaming completion
   */
  async *createStreamingCompletion(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): AsyncIterable<StreamChunk> {
    const resolvedOptions = this.resolveOptions(options);

    await this.rateLimiter.acquireSlot();

    try {
      const response = await this.makeStreamRequest(
        '/chat/completions',
        {
          model: this.config.model,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            name: m.name,
          })),
          max_tokens: resolvedOptions.maxTokens,
          temperature: resolvedOptions.temperature,
          top_p: resolvedOptions.topP,
          stop: resolvedOptions.stopSequences.length > 0 ? resolvedOptions.stopSequences : undefined,
          stream: true,
        },
        resolvedOptions.timeout
      );

      if (!response.body) {
        throw new LLMError(
          LLMErrorType.NETWORK_ERROR,
          this.name,
          'Response body is null'
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter((line) => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            // Check for end of stream
            if (data === '[DONE]') {
              yield {
                delta: '',
                isComplete: true,
              };
              return;
            }

            try {
              const parsed = JSON.parse(data) as OpenAIStreamChunk;
              const choice = parsed.choices[0];

              if (choice?.delta?.content) {
                yield {
                  delta: choice.delta.content,
                  isComplete: choice.finish_reason !== null,
                  metadata: {
                    id: parsed.id,
                    finishReason: choice.finish_reason,
                  },
                };
              }

              // Include usage/cost data in the final chunk
              if (parsed.usage && choice && choice.finish_reason !== null) {
                const cost = calculateCost(
                  parsed.usage.prompt_tokens,
                  parsed.usage.completion_tokens,
                  parsed.model
                );

                yield {
                  delta: '',
                  isComplete: true,
                  metadata: {
                    id: parsed.id,
                    finishReason: choice.finish_reason ?? undefined,
                    usage: {
                      promptTokens: parsed.usage.prompt_tokens,
                      completionTokens: parsed.usage.completion_tokens,
                      totalTokens: parsed.usage.total_tokens,
                      cost,
                    },
                  },
                };
              }
            } catch (parseError) {
              this.logger.warn('Failed to parse streaming chunk', {
                error: parseError instanceof Error ? parseError.message : String(parseError),
              });
            }
          }
        }
      }

      this.markHealthy();
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Health check for OpenAI API
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const response = await this.makeRequest('/models', {}, 5000);

      if (response.ok) {
        this.markHealthy();
        return {
          healthy: true,
          responseTimeMs: Date.now() - startTime,
          timestamp: new Date(),
        };
      }

      throw new LLMError(
        LLMErrorType.SERVER_ERROR,
        this.name,
        `Health check failed with status ${response.status}`
      );
    } catch (error) {
      this.markUnhealthy(error instanceof Error ? error.message : String(error));
      return {
        healthy: false,
        responseTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      };
    }
  }

  /**
   * Make a POST request to the OpenAI API
   */
  private async makeRequest(
    endpoint: string,
    body: Record<string, unknown>,
    timeout: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json() as OpenAIErrorResponse;
        throw this.createErrorFromResponse(response.status, errorData);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Make a streaming POST request to the OpenAI API
   */
  private async makeStreamRequest(
    endpoint: string,
    body: Record<string, unknown>,
    timeout: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json() as OpenAIErrorResponse;
        throw this.createErrorFromResponse(response.status, errorData);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Create an LLMError from an OpenAI API error response
   */
  private createErrorFromResponse(
    status: number,
    errorData: OpenAIErrorResponse
  ): LLMError {
    const message = errorData.error?.message || `HTTP ${status}`;

    switch (status) {
      case 401:
      case 403:
        return new LLMError(LLMErrorType.AUTHENTICATION, this.name, message);

      case 429:
        return new LLMError(LLMErrorType.RATE_LIMIT, this.name, message, undefined, true);

      case 400:
        return new LLMError(LLMErrorType.INVALID_REQUEST, this.name, message);

      case 500:
      case 502:
      case 503:
      case 504:
        return new LLMError(LLMErrorType.SERVER_ERROR, this.name, message, undefined, true);

      default:
        return new LLMError(LLMErrorType.UNKNOWN, this.name, message);
    }
  }

  /**
   * Handle and convert errors to LLMError
   */
  private handleError(error: unknown): LLMError {
    if (error instanceof LLMError) {
      return error;
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        return new LLMError(LLMErrorType.TIMEOUT, this.name, error.message, error, true);
      }

      if (error.message.includes('fetch') || error.message.includes('network')) {
        return new LLMError(LLMErrorType.NETWORK_ERROR, this.name, error.message, error, true);
      }

      return new LLMError(LLMErrorType.UNKNOWN, this.name, error.message, error);
    }

    return new LLMError(LLMErrorType.UNKNOWN, this.name, String(error));
  }
}
