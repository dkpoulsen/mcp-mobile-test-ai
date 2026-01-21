/**
 * Test Data Generator Service
 * Uses LLMs to generate realistic test data based on schema definitions
 */

import type {
  DataSchema,
  EdgeCaseType,
  GenerationOptions,
  GenerationResult,
  BatchGenerationRequest,
  BatchGenerationResult,
} from './types.js';
import { getSchema, schemaRegistry } from './schemas.js';
import type { BaseLLMProvider } from '../../llm/providers/base.js';
import type { ChatMessage } from '../../llm/types.js';
import { createProvider } from '../../llm/factory.js';
import { createModuleLogger } from '../../utils/logger.js';
import type { Logger } from '../../utils/logger.js';

/**
 * Edge case generation prompts for different edge case types
 */
const EDGE_CASE_PROMPTS: Record<EdgeCaseType, string> = {
  empty: 'an empty value (blank string, empty array, or empty object depending on type)',
  null: 'a null or undefined value',
  min_length: 'a value at the minimum allowed length (shortest valid)',
  max_length: 'a value at the maximum allowed length (longest valid)',
  min_value: 'the minimum allowed numeric value',
  max_value: 'the maximum allowed numeric value',
  negative_zero: 'the value -0 for numeric fields',
  very_long: 'an excessively long value (10000+ characters)',
  special_chars: 'a value containing many special characters: !@#$%^&*()[]{};:\'"<>?,./`~',
  unicode: 'a value containing unicode characters and emojis: 日本語 Ñoño café 😀🎉',
  sql_injection: 'a value that attempts SQL injection: \'; DROP TABLE users; --',
  xss: 'a value that attempts XSS: <script>alert(\'XSS\')</script>',
  invalid_format: 'a value with intentionally invalid format',
  boundary_below: 'a value just below the minimum valid boundary',
  boundary_above: 'a value just above the maximum valid boundary',
};

/**
 * Main test data generator class
 */
export class TestDataGenerator {
  private readonly logger: Logger;
  private readonly llmProvider: BaseLLMProvider;

  constructor(llmProvider?: BaseLLMProvider) {
    this.logger = createModuleLogger('services:test-data-generator');
    this.llmProvider = llmProvider ?? createProvider();
  }

  /**
   * Generate test data based on a schema name
   */
  async generate(
    schemaName: string,
    options: GenerationOptions = {}
  ): Promise<GenerationResult> {
    const startTime = Date.now();

    // Get the schema
    const schema = typeof schemaName === 'string' ? getSchema(schemaName) : schemaName;
    if (!schema) {
      throw new Error(`Schema not found: ${schemaName}`);
    }

    // Merge options with defaults
    const opts: Required<GenerationOptions> = {
      count: options.count ?? 5,
      includeEdgeCases: options.includeEdgeCases ?? false,
      edgeCaseTypes: options.edgeCaseTypes ?? [],
      seed: options.seed ?? Date.now(),
      locale: options.locale ?? 'en-US',
      validate: options.validate ?? true,
      overrides: options.overrides ?? {},
    };

    // Generate regular data
    const data: unknown[] = [];
    const errors: Array<{ index: number; error: string; value: unknown }> = [];

    for (let i = 0; i < opts.count; i++) {
      try {
        const item = await this.generateItem(schema, opts);
        if (opts.validate) {
          const validated = schema.schema.safeParse(item);
          if (validated.success) {
            data.push(validated.data);
          } else {
            errors.push({
              index: i,
              error: validated.error.issues.map((e) => e.message).join(', '),
              value: item,
            });
          }
        } else {
          data.push(item);
        }
      } catch (error) {
        this.logger.warn('Failed to generate item', {
          index: i,
          error: error instanceof Error ? error.message : String(error),
        });
        errors.push({
          index: i,
          error: error instanceof Error ? error.message : String(error),
          value: null,
        });
      }
    }

    // Generate edge cases if requested
    const edgeCases = new Map<EdgeCaseType, unknown>();
    if (opts.includeEdgeCases || opts.edgeCaseTypes.length > 0) {
      const edgeCaseTypesToGenerate =
        opts.edgeCaseTypes.length > 0
          ? opts.edgeCaseTypes
          : ([
              'empty',
              'min_length',
              'max_length',
              'special_chars',
              'unicode',
            ] as EdgeCaseType[]);

      for (const edgeCaseType of edgeCaseTypesToGenerate) {
        try {
          const edgeCaseValue = await this.generateEdgeCase(schema, edgeCaseType, opts);
          edgeCases.set(edgeCaseType, edgeCaseValue);
        } catch (error) {
          this.logger.warn('Failed to generate edge case', {
            edgeCaseType,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const duration = Date.now() - startTime;

    return {
      data: data as unknown[],
      edgeCases: edgeCases.size > 0 ? edgeCases : undefined,
      errors,
      metadata: {
        schema: schema.name,
        count: data.length,
        edgeCaseTypes: opts.includeEdgeCases ? opts.edgeCaseTypes : undefined,
        duration,
      },
    };
  }

  /**
   * Generate a single data item based on schema
   */
  private async generateItem(schema: DataSchema, options: Required<GenerationOptions>): Promise<unknown> {
    const prompt = this.buildGenerationPrompt(schema, options);

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: this.getSystemPrompt(),
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    const response = await this.llmProvider.createCompletion(messages, {
      temperature: 0.8,
      maxTokens: 1000,
    });

    return this.parseGeneratedData(schema, response.content);
  }

  /**
   * Generate an edge case value
   */
  private async generateEdgeCase(
    schema: DataSchema,
    edgeCaseType: EdgeCaseType,
    options: Required<GenerationOptions>
  ): Promise<unknown> {
    const edgeCaseDescription = EDGE_CASE_PROMPTS[edgeCaseType];
    const prompt = this.buildEdgeCasePrompt(schema, edgeCaseType, edgeCaseDescription, options);

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: this.getSystemPrompt(),
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    const response = await this.llmProvider.createCompletion(messages, {
      temperature: 0.7,
      maxTokens: 1000,
    });

    return this.parseGeneratedData(schema, response.content);
  }

  /**
   * Build the generation prompt for a schema
   */
  private buildGenerationPrompt(schema: DataSchema, options: Required<GenerationOptions>): string {
    let prompt = `Generate ${options.count} realistic ${schema.description}.\n\n`;

    if (schema.examples && schema.examples.length > 0) {
      prompt += `Examples:\n`;
      for (const example of schema.examples) {
        prompt += `- ${JSON.stringify(example)}\n`;
      }
      prompt += `\n`;
    }

    if (schema.fields) {
      prompt += `The data should have the following fields:\n`;
      for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
        prompt += `  - ${fieldName}: ${fieldDef.description} (${fieldDef.type})`;
        if (fieldDef.required) {
          prompt += ` [required]`;
        }
        if (fieldDef.examples && fieldDef.examples.length > 0) {
          prompt += ` - e.g., ${fieldDef.examples.join(', ')}`;
        }
        prompt += `\n`;
      }
      prompt += `\n`;
    }

    if (schema.constraints) {
      prompt += `Constraints:\n`;
      if (schema.constraints.minLength) {
        prompt += `  - Minimum length: ${schema.constraints.minLength}\n`;
      }
      if (schema.constraints.maxLength) {
        prompt += `  - Maximum length: ${schema.constraints.maxLength}\n`;
      }
      if (schema.constraints.min !== undefined) {
        prompt += `  - Minimum value: ${schema.constraints.min}\n`;
      }
      if (schema.constraints.max !== undefined) {
        prompt += `  - Maximum value: ${schema.constraints.max}\n`;
      }
      if (schema.constraints.allowedValues) {
        prompt += `  - Allowed values: ${schema.constraints.allowedValues.join(', ')}\n`;
      }
      prompt += `\n`;
    }

    if (options.overrides && Object.keys(options.overrides).length > 0) {
      prompt += `Override constraints:\n`;
      for (const [key, value] of Object.entries(options.overrides)) {
        prompt += `  - ${key}: ${JSON.stringify(value)}\n`;
      }
      prompt += `\n`;
    }

    prompt += `Locale: ${options.locale}\n\n`;
    prompt += `Return the data as a JSON array. Each item must be a valid ${schema.name} according to the schema.\n\n`;
    prompt += `Respond ONLY with valid JSON. Do not include any explanations or markdown formatting.`;

    return prompt;
  }

  /**
   * Build the edge case prompt
   */
  private buildEdgeCasePrompt(
    schema: DataSchema,
    edgeCaseType: EdgeCaseType,
    edgeCaseDescription: string,
    _options: Required<GenerationOptions>
  ): string {
    let prompt = `Generate a ${schema.name} that represents ${edgeCaseDescription}.\n\n`;
    prompt += `This is for testing edge cases. The value may be invalid according to normal validation rules.\n\n`;

    if (schema.fields) {
      prompt += `The data should have the following fields:\n`;
      for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
        prompt += `  - ${fieldName}: ${fieldDef.description} (${fieldDef.type})`;
        if (fieldDef.required) {
          prompt += ` [required]`;
        }
        prompt += `\n`;
      }
      prompt += `\n`;
    }

    prompt += `Edge case type: ${edgeCaseType}\n`;
    prompt += `Description: ${edgeCaseDescription}\n\n`;
    prompt += `Return the data as a JSON object.\n\n`;
    prompt += `Respond ONLY with valid JSON. Do not include any explanations or markdown formatting.`;

    return prompt;
  }

  /**
   * Get the system prompt for the LLM
   */
  private getSystemPrompt(): string {
    return `You are a test data generation assistant. Your task is to generate realistic test data based on the provided schema.

Rules:
1. Generate diverse, realistic data
2. Respect all constraints provided
3. Return ONLY valid JSON - no markdown, no explanations
4. For arrays, return the complete JSON array
5. For single objects, return the complete JSON object
6. Use proper data types (strings, numbers, booleans, etc.)
7. Dates should be in ISO 8601 format
8. UUIDs should be valid v4 UUIDs`;
  }

  /**
   * Parse the generated data from LLM response
   */
  private parseGeneratedData(schema: DataSchema, content: string): unknown {
    // Clean up the response - remove markdown, extra whitespace
    let cleaned = content.trim();

    // Remove markdown code blocks if present
    cleaned = cleaned.replace(/^```json\s*/i, '');
    cleaned = cleaned.replace(/^```\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/g, '');

    // Try to extract JSON if there's text around it
    const jsonMatch = cleaned.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }

    try {
      return JSON.parse(cleaned);
    } catch (error) {
      this.logger.warn('Failed to parse generated data as JSON', {
        schema: schema.name,
        content,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Failed to parse generated data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate test data for multiple schemas in batch
   */
  async generateBatch(requests: BatchGenerationRequest[]): Promise<BatchGenerationResult> {
    const startTime = Date.now();
    const results = new Map<string, GenerationResult>();
    let totalRecords = 0;
    let totalEdgeCases = 0;

    for (const request of requests) {
      try {
        const result = await this.generate(request.schemaName, request.options);
        results.set(request.schemaName, result);
        totalRecords += result.data.length;
        totalEdgeCases += result.edgeCases?.size ?? 0;
      } catch (error) {
        this.logger.error('Failed to generate data for schema', {
          schemaName: request.schemaName,
          error: error instanceof Error ? error.message : String(error),
        });
        // Add an error result
        results.set(request.schemaName, {
          data: [],
          errors: [
            {
              index: 0,
              error: error instanceof Error ? error.message : String(error),
              value: null,
            },
          ],
          metadata: {
            schema: request.schemaName,
            count: 0,
            duration: 0,
          },
        });
      }
    }

    return {
      results,
      metadata: {
        totalSchemas: requests.length,
        totalRecords,
        totalEdgeCases,
        duration: Date.now() - startTime,
      },
    };
  }

  /**
   * Generate a single item quickly (for inline generation)
   */
  async generateOne<T = unknown>(
    schemaName: string,
    options?: Omit<GenerationOptions, 'count'>
  ): Promise<T> {
    const result = await this.generate(schemaName, { ...options, count: 1 });
    if (result.data.length === 0) {
      throw new Error(`Failed to generate data for schema: ${schemaName}`);
    }
    return result.data[0] as T;
  }

  /**
   * Generate only edge cases for a schema
   */
  async generateEdgeCases(
    schemaName: string,
    edgeCaseTypes?: EdgeCaseType[]
  ): Promise<Map<EdgeCaseType, unknown>> {
    const result = await this.generate(schemaName, {
      count: 0,
      includeEdgeCases: true,
      edgeCaseTypes,
    });
    return result.edgeCases ?? new Map();
  }

  /**
   * Get all available schema names
   */
  getAvailableSchemas(): string[] {
    return Object.keys(schemaRegistry);
  }

  /**
   * Check if a schema exists
   */
  hasSchema(name: string): boolean {
    return name in schemaRegistry;
  }

  /**
   * Get a schema by name
   */
  getSchema(name: string): DataSchema | undefined {
    return getSchema(name);
  }

  /**
   * Register a custom schema
   */
  registerSchema(schema: DataSchema): void {
    (schemaRegistry as Record<string, DataSchema>)[schema.name] = schema;
    this.logger.info('Registered custom schema', { name: schema.name });
  }
}
