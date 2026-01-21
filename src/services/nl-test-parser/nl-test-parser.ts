/**
 * Natural Language Test Parser Service
 *
 * Uses AI/LLM to convert natural language test descriptions
 * into structured test cases with steps, assertions, and test data requirements.
 */

import type {
  ChatMessage,
  CompletionOptions,
} from '../../llm/types.js';
import type { BaseLLMProvider } from '../../llm/providers/base.js';
import type { PromptEngine } from '../../prompt-engine/index.js';
import { createModuleLogger } from '../../utils/logger.js';
import type { Logger } from '../../utils/logger.js';
import type {
  ParserOptions,
  ParserResult,
  ParsedTestCase,
  BatchParseInput,
  BatchParseResult,
} from './types.js';
import {
  NLTestParserError,
  ParserErrorType,
} from './types.js';

/**
 * Default system prompt for the NL test parser
 */
const DEFAULT_SYSTEM_PROMPT = `You are an expert test case analyst. Your task is to convert natural language test descriptions into structured test cases.

Extract the following from each test description:
1. A clear, concise title
2. A brief description of what is being tested
3. Ordered test steps with actions and expected outcomes
4. Assertions to validate the test results
5. Test data requirements (names, types, examples)
6. Relevant tags for categorization
7. Prerequisites or setup requirements
8. The overall expected outcome

Always respond with valid JSON that matches the expected schema.`;

/**
 * Default few-shot examples for the parser
 */
const DEFAULT_EXAMPLES = [
  {
    input: 'Test login with valid credentials - user should be able to log in with correct email and password',
    output: {
      title: 'Login with valid credentials',
      description: 'Verify that a user can successfully log in using valid email and password',
      steps: [
        {
          order: 1,
          action: 'Navigate to the login page',
          expectedOutcome: 'Login page is displayed',
        },
        {
          order: 2,
          action: 'Enter a valid email address',
          expectedOutcome: 'Email field contains the entered value',
          testData: 'user@example.com',
        },
        {
          order: 3,
          action: 'Enter a valid password',
          expectedOutcome: 'Password field contains the entered value',
          testData: 'SecurePass123!',
        },
        {
          order: 4,
          action: 'Click the login button',
          expectedOutcome: 'Login request is submitted',
        },
      ],
      assertions: [
        {
          condition: 'User is authenticated',
          expected: 'true',
          type: 'equality',
        },
        {
          condition: 'Dashboard is displayed',
          expected: 'visible',
          type: 'visibility',
        },
      ],
      testDataRequirements: [
        {
          name: 'email',
          type: 'email',
          description: 'Valid user email address',
          example: 'user@example.com',
        },
        {
          name: 'password',
          type: 'string',
          description: 'Valid user password',
          example: 'SecurePass123!',
        },
      ],
      tags: ['authentication', 'login', 'smoke'],
      prerequisites: ['User account exists', 'User is not logged in'],
      expectedOutcome: 'User is successfully logged in and redirected to the dashboard',
    },
  },
  {
    input: 'Add item to shopping cart - verify user can add a product to their cart',
    output: {
      title: 'Add item to shopping cart',
      description: 'Verify that a user can add a product to their shopping cart',
      steps: [
        {
          order: 1,
          action: 'Navigate to the products page',
          expectedOutcome: 'Products are displayed',
        },
        {
          order: 2,
          action: 'Select a product',
          expectedOutcome: 'Product detail page is shown',
        },
        {
          order: 3,
          action: 'Click "Add to Cart" button',
          expectedOutcome: 'Button shows loading state briefly',
        },
      ],
      assertions: [
        {
          condition: 'Cart item count increases',
          expected: 'previous count + 1',
          type: 'equality',
        },
        {
          condition: 'Success message is displayed',
          expected: 'visible',
          type: 'visibility',
        },
      ],
      testDataRequirements: [
        {
          name: 'productId',
          type: 'string',
          description: 'ID of the product to add',
        },
      ],
      tags: ['cart', 'e-commerce'],
      prerequisites: ['User is logged in', 'Product exists in catalog'],
      expectedOutcome: 'Product is successfully added to the shopping cart',
    },
  },
];

/**
 * JSON schema instruction for the parser
 */
const JSON_SCHEMA_INSTRUCTION = `
Respond with a JSON object in the following format:
{
  "title": "string",
  "description": "string (optional)",
  "steps": [
    {
      "order": "number",
      "action": "string",
      "expectedOutcome": "string (optional)",
      "selector": "string (optional)",
      "testData": "string (optional)"
    }
  ],
  "assertions": [
    {
      "condition": "string",
      "expected": "string",
      "type": "equality|existence|visibility|containment|custom (optional)"
    }
  ],
  "testDataRequirements": [
    {
      "name": "string",
      "type": "string",
      "description": "string (optional)",
      "example": "string (optional)",
      "isDynamic": "boolean (optional)"
    }
  ],
  "tags": ["string"],
  "prerequisites": ["string"],
  "expectedOutcome": "string"
}

Do not include any text outside the JSON object.`;

/**
 * Natural Language Test Parser class
 */
export class NLTestParser {
  private readonly logger: Logger;
  private readonly llmProvider: BaseLLMProvider;
  private readonly promptEngine: PromptEngine;

  constructor(
    llmProvider: BaseLLMProvider,
    promptEngine: PromptEngine
  ) {
    this.llmProvider = llmProvider;
    this.promptEngine = promptEngine;
    this.logger = createModuleLogger('services:nl-test-parser');

    this.initializeDefaultTemplate();
  }

  /**
   * Initialize the default prompt template
   */
  private initializeDefaultTemplate(): void {
    try {
      this.promptEngine.createTemplate({
        name: 'NL Test Parser Default',
        description: 'Default template for parsing natural language test descriptions',
        tags: ['nl-test-parser', 'test-generation'],
        template: `{{systemPrompt}}

{{#each examples}}
Example {{@index}}:
Input: {{this.input}}
Output: \`\`\`json
{{this.output}}
\`\`\`

{{/each}}

Now parse the following test description:
{{description}}

{{jsonSchemaInstruction}}`,
        variables: [
          { name: 'systemPrompt', required: true, type: 'string' },
          { name: 'description', required: true, type: 'string' },
          { name: 'examples', required: false, type: 'array' },
          { name: 'jsonSchemaInstruction', required: true, type: 'string' },
        ],
        examples: DEFAULT_EXAMPLES as any,
        version: '1.0.0',
      });
    } catch (error) {
      this.logger.warn('Failed to initialize default template', { error });
    }
  }

  /**
   * Parse a single natural language test description
   */
  async parse(
    description: string,
    options?: ParserOptions
  ): Promise<ParserResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    try {
      // Validate input
      this.validateInput(description);

      // Build the prompt
      const prompt = this.buildPrompt(description, options);

      // Create LLM completion
      const completion = await this.createCompletion(prompt, options);

      // Parse the JSON response
      const testCase = this.parseResponse(completion.content, warnings);

      // Apply options to filter/enhance results
      const filteredTestCase = this.applyOptions(testCase, options, warnings);

      const processingTimeMs = Date.now() - startTime;

      this.logger.info('Successfully parsed test description', {
        title: filteredTestCase.title,
        stepsCount: filteredTestCase.steps.length,
        processingTimeMs,
      });

      return {
        testCase: filteredTestCase,
        success: true,
        warnings,
        processingTimeMs,
        rawResponse: completion.content,
        tokensUsed: completion.usage
          ? {
              prompt: completion.usage.promptTokens,
              completion: completion.usage.completionTokens,
              total: completion.usage.totalTokens,
            }
          : undefined,
      };
    } catch (error) {
      if (error instanceof NLTestParserError) {
        throw error;
      }

      this.logger.error('Failed to parse test description', {
        error: error instanceof Error ? error.message : String(error),
      });

      throw new NLTestParserError(
        ParserErrorType.UNKNOWN,
        'Failed to parse test description',
        error
      );
    }
  }

  /**
   * Parse multiple test descriptions in batch
   */
  async parseBatch(input: BatchParseInput): Promise<BatchParseResult> {
    const startTime = Date.now();

    this.logger.info('Starting batch parse', {
      count: input.descriptions.length,
    });

    const results: ParserResult[] = await Promise.all(
      input.descriptions.map((description) =>
        this.parse(description, input.options).catch((error) => ({
          testCase: this.createErrorTestCase(description),
          success: false,
          warnings: [error instanceof Error ? error.message : String(error)],
          processingTimeMs: 0,
          tokensUsed: undefined,
        }))
      )
    );

    const successCount = results.filter((r) => r.success).length;
    const totalProcessingTimeMs = Date.now() - startTime;

    const totalTokensUsed = results.reduce(
      (acc, result) => {
        if (result.tokensUsed) {
          acc.prompt += result.tokensUsed.prompt;
          acc.completion += result.tokensUsed.completion;
          acc.total += result.tokensUsed.total;
        }
        return acc;
      },
      { prompt: 0, completion: 0, total: 0 }
    );

    this.logger.info('Batch parse completed', {
      total: results.length,
      successful: successCount,
      failed: results.length - successCount,
      totalProcessingTimeMs,
    });

    return {
      results,
      successRate: successCount / results.length,
      totalProcessingTimeMs,
      totalTokensUsed:
        totalTokensUsed.total > 0 ? totalTokensUsed : undefined,
    };
  }

  /**
   * Validate input description
   */
  private validateInput(description: string): void {
    if (!description || typeof description !== 'string') {
      throw new NLTestParserError(
        ParserErrorType.INVALID_INPUT,
        'Description must be a non-empty string'
      );
    }

    const trimmed = description.trim();
    if (trimmed.length < 10) {
      throw new NLTestParserError(
        ParserErrorType.INVALID_INPUT,
        'Description is too short (minimum 10 characters)'
      );
    }

    if (trimmed.length > 5000) {
      throw new NLTestParserError(
        ParserErrorType.INVALID_INPUT,
        'Description is too long (maximum 5000 characters)'
      );
    }
  }

  /**
   * Build the prompt for LLM completion
   */
  private buildPrompt(
    description: string,
    options?: ParserOptions
  ): string {
    const detailInstruction =
      options?.detailLevel === 'detailed'
        ? 'Be very thorough and extract as much detail as possible.'
        : options?.detailLevel === 'concise'
        ? 'Be concise and focus on the essential steps and assertions.'
        : 'Provide a standard level of detail.';

    const examples =
      options?.detailLevel === 'detailed'
        ? DEFAULT_EXAMPLES
        : DEFAULT_EXAMPLES.length > 0 ? [DEFAULT_EXAMPLES[0]] : [];

    const exampleText = examples.length > 0
      ? `
Input: ${examples[0]!.input}
Output: ${JSON.stringify(examples[0]!.output, null, 2)}
`
      : '';

    return `${DEFAULT_SYSTEM_PROMPT}

${detailInstruction}

${JSON_SCHEMA_INSTRUCTION}

${examples.length > 0 ? 'Example:' : ''}${exampleText}

Now parse the following test description:
${description}`;
  }

  /**
   * Create LLM completion
   */
  private async createCompletion(
    prompt: string,
    options?: ParserOptions
  ): Promise<import('../../llm/types.js').CompletionResponse> {
    const messages: ChatMessage[] = [
      { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];

    const completionOptions: CompletionOptions = {
      maxTokens: options?.maxSteps
        ? 500 + options.maxSteps * 50
        : 2000,
      temperature: 0.3,
      timeout: 30000,
    };

    try {
      return await this.llmProvider.createCompletion(messages, completionOptions);
    } catch (error) {
      this.logger.error('LLM completion failed', { error });
      throw new NLTestParserError(
        ParserErrorType.LLM_ERROR,
        'Failed to get completion from LLM',
        error
      );
    }
  }

  /**
   * Parse the JSON response from LLM
   */
  private parseResponse(
    content: string,
    warnings: string[]
  ): ParsedTestCase {
    try {
      // Extract JSON from the response (handle markdown code blocks)
      const jsonMatch =
        content.match(/```(?:json)?\s*([\s\S]*?)\s*```/) ||
        content.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new NLTestParserError(
          ParserErrorType.PARSE_ERROR,
          'No JSON found in LLM response'
        );
      }

      const jsonString = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonString) as ParsedTestCase;

      // Validate required fields
      this.validateParsedResult(parsed, warnings);

      return parsed;
    } catch (error) {
      if (error instanceof NLTestParserError) {
        throw error;
      }

      this.logger.error('Failed to parse JSON response', { error, content });
      throw new NLTestParserError(
        ParserErrorType.PARSE_ERROR,
        'Failed to parse JSON from LLM response',
        error
      );
    }
  }

  /**
   * Validate the parsed result
   */
  private validateParsedResult(
    result: ParsedTestCase,
    warnings: string[]
  ): void {
    if (!result.title) {
      throw new NLTestParserError(
        ParserErrorType.MISSING_FIELDS,
        'Missing required field: title'
      );
    }

    if (!result.steps || result.steps.length === 0) {
      warnings.push('No test steps were extracted');
    }

    if (!result.assertions || result.assertions.length === 0) {
      warnings.push('No assertions were extracted');
    }

    if (!result.expectedOutcome) {
      warnings.push('No expected outcome was specified');
    }

    // Validate step structure
    result.steps?.forEach((step, index) => {
      if (!step.action) {
        warnings.push(`Step ${index + 1} is missing an action`);
      }
      if (step.order === undefined) {
        step.order = index + 1;
      }
    });
  }

  /**
   * Apply parser options to filter/enhance results
   */
  private applyOptions(
    testCase: ParsedTestCase,
    options?: ParserOptions,
    warnings: string[] = []
  ): ParsedTestCase {
    const result = { ...testCase };

    // Apply max steps limit
    if (options?.maxSteps && result.steps.length > options.maxSteps) {
      warnings.push(
        `Truncated steps from ${result.steps.length} to ${options.maxSteps}`
      );
      result.steps = result.steps.slice(0, options.maxSteps);
    }

    // Filter out test data if not requested
    if (options?.extractTestData === false) {
      result.testDataRequirements = [];
    }

    // Filter out assertions if not requested
    if (options?.extractAssertions === false) {
      result.assertions = [];
    }

    // Filter out prerequisites if not requested
    if (options?.extractPrerequisites === false) {
      result.prerequisites = [];
    }

    // Ensure arrays exist
    result.steps = result.steps ?? [];
    result.assertions = result.assertions ?? [];
    result.testDataRequirements = result.testDataRequirements ?? [];
    result.tags = result.tags ?? [];
    result.prerequisites = result.prerequisites ?? [];

    return result;
  }

  /**
   * Create an error test case for failed parses
   */
  private createErrorTestCase(description: string): ParsedTestCase {
    return {
      title: 'Parse Failed',
      description: `Failed to parse: ${description.substring(0, 100)}...`,
      steps: [],
      assertions: [],
      testDataRequirements: [],
      tags: ['parse-error'],
      prerequisites: [],
      expectedOutcome: 'Parse failed - could not extract structured information',
    };
  }

  /**
   * Health check for the parser service
   */
  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      await this.llmProvider.healthCheck();
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Singleton instance management
 */
let parserInstance: NLTestParser | undefined;

/**
 * Get or create the parser instance
 */
export function getNLTestParser(
  llmProvider?: BaseLLMProvider,
  promptEngine?: PromptEngine
): NLTestParser {
  if (!parserInstance) {
    if (!llmProvider || !promptEngine) {
      throw new Error(
        'LLM provider and prompt engine must be provided on first call'
      );
    }
    parserInstance = new NLTestParser(llmProvider, promptEngine);
  }
  return parserInstance;
}

/**
 * Reset the parser instance (useful for testing)
 */
export function resetNLTestParser(): void {
  parserInstance = undefined;
}
