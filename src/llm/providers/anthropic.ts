/**
 * Anthropic Claude LLM Provider Implementation
 * Implements the LLM provider interface for Anthropic's Claude API
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
} from '../types.js';
import { LLMError, LLMErrorType } from '../types.js';

/**
 * Anthropic API response interface
 */
interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Anthropic streaming chunk interface
 */
interface AnthropicStreamChunk {
  type: string;
  index?: number;
  delta?: {
    type?: string;
    text?: string;
  };
  message?: {
    id: string;
    type: string;
    role: string;
    content: Array<{ type: string; text: string }>;
    model: string;
    stop_reason: string;
    usage: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}

/**
 * Anthropic API error response interface
 */
interface AnthropicErrorResponse {
  error?: {
    type: string;
    message: string;
  };
}

/**
 * Anthropic Provider
 * Supports Claude models via Anthropic's API
 */
export class AnthropicProvider extends BaseLLMProvider {
  private readonly baseUrl: string;
  private readonly apiVersion = '2023-06-01';

  constructor(config: ProviderConfig) {
    super(config, 'anthropic');
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com/v1';
  }

  get name(): string {
    return 'anthropic';
  }

  /**
   * Convert messages to Anthropic format
   * Anthropic requires a specific format with system message separate
   */
  private convertMessages(messages: ChatMessage[]): {
    system: string | undefined;
    messages: Array<{ role: string; content: string }>;
  } {
    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    return {
      system: systemMessage?.content,
      messages: conversationMessages,
    };
  }

  /**
   * Create a completion using Anthropic API
   */
  async createCompletion(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): Promise<CompletionResponse> {
    const resolvedOptions = this.resolveOptions(options);
    const { system, messages: anthropicMessages } = this.convertMessages(messages);

    return this.executeWithRetry(async () => {
      const startTime = Date.now();

      try {
        const response = await this.makeRequest(
          '/messages',
          {
            model: this.config.model,
            messages: anthropicMessages,
            system,
            max_tokens: resolvedOptions.maxTokens,
            temperature: resolvedOptions.temperature,
            top_p: resolvedOptions.topP,
            stop_sequences:
              resolvedOptions.stopSequences.length > 0
                ? resolvedOptions.stopSequences
                : undefined,
          },
          resolvedOptions.timeout
        );

        const data = await response.json() as AnthropicResponse;

        // Extract text content from response
        const textContent = data.content
          .filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('');

        this.markHealthy();

        return {
          content: textContent,
          model: data.model,
          usage: data.usage
            ? {
                promptTokens: data.usage.input_tokens,
                completionTokens: data.usage.output_tokens,
                totalTokens:
                  data.usage.input_tokens + data.usage.output_tokens,
              }
            : undefined,
          metadata: {
            id: data.id,
            stopReason: data.stop_reason,
            responseTime: Date.now() - startTime,
          },
          provider: this.name,
        };
      } catch (error) {
        throw this.handleError(error);
      }
    }, 'Anthropic.createCompletion');
  }

  /**
   * Create a streaming completion
   */
  async *createStreamingCompletion(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): AsyncIterable<StreamChunk> {
    const resolvedOptions = this.resolveOptions(options);
    const { system, messages: anthropicMessages } = this.convertMessages(messages);

    await this.rateLimiter.acquireSlot();

    try {
      const response = await this.makeStreamRequest(
        '/messages',
        {
          model: this.config.model,
          messages: anthropicMessages,
          system,
          max_tokens: resolvedOptions.maxTokens,
          temperature: resolvedOptions.temperature,
          top_p: resolvedOptions.topP,
          stop_sequences:
            resolvedOptions.stopSequences.length > 0
              ? resolvedOptions.stopSequences
              : undefined,
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

            try {
              const parsed = JSON.parse(data) as AnthropicStreamChunk;

              // Handle content block delta
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                yield {
                  delta: parsed.delta.text,
                  isComplete: false,
                };
              }

              // Handle message stop (end of stream)
              if (parsed.type === 'message_stop') {
                yield {
                  delta: '',
                  isComplete: true,
                };
                return;
              }

              // Handle message delta with metadata
              if (parsed.type === 'message_delta' && parsed.message) {
                yield {
                  delta: '',
                  isComplete: true,
                  metadata: {
                    id: parsed.message.id,
                    stopReason: parsed.message.stop_reason,
                    usage: parsed.message.usage,
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
   * Health check for Anthropic API
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      // Anthropic doesn't have a lightweight health check endpoint,
      // so we make a minimal request
      const response = await this.makeRequest(
        '/messages',
        {
          model: this.config.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        },
        5000
      );

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
   * Make a POST request to the Anthropic API
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
          'x-api-key': this.config.apiKey,
          'anthropic-version': this.apiVersion,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json() as AnthropicErrorResponse;
        throw this.createErrorFromResponse(response.status, errorData);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Make a streaming POST request to the Anthropic API
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
          'x-api-key': this.config.apiKey,
          'anthropic-version': this.apiVersion,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json() as AnthropicErrorResponse;
        throw this.createErrorFromResponse(response.status, errorData);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Create an LLMError from an Anthropic API error response
   */
  private createErrorFromResponse(
    status: number,
    errorData: AnthropicErrorResponse
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

      case 529:
        // Anthropic-specific overload error
        return new LLMError(LLMErrorType.RATE_LIMIT, this.name, message, undefined, true);

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
