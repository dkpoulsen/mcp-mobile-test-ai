/**
 * Test Code Generator Service
 *
 * Uses AI/LLM to generate executable test code from parsed test specifications.
 * Supports WebDriverIO, Appium, and Playwright frameworks with Page Object Model.
 */

import type {
  CodeGenerationOptions,
  CodeGenerationResult,
  GeneratedTestFile,
  PageObject,
} from './types.js';
import type {
  ChatMessage,
  CompletionOptions,
} from '../../llm/types.js';
import type { BaseLLMProvider } from '../../llm/providers/base.js';
import type { ParsedTestCase } from '../nl-test-parser/types.js';
import {
  TestCodeGeneratorError,
  CodeGenerationErrorType,
} from './types.js';
import { createModuleLogger } from '../../utils/logger.js';
import type { Logger } from '../../utils/logger.js';
import {
  CODE_GENERATION_SYSTEM_PROMPT,
  CODE_GENERATION_JSON_SCHEMA,
  DEFAULT_CODE_GENERATION_EXAMPLES,
  frameworkCapabilities,
} from './templates.js';

/**
 * Default options for code generation
 */
const DEFAULT_OPTIONS: Partial<CodeGenerationOptions> = {
  language: 'typescript',
  pattern: 'page-object',
  includeComments: true,
  useAsyncAwait: true,
  importStyle: 'named',
  namingConvention: 'kebab-case',
  generatePageObjects: true,
  includeTestData: true,
  timeout: {
    implicit: 10000,
    script: 30000,
    pageLoad: 60000,
    element: 10000,
  },
};

/**
 * Test Code Generator class
 */
export class TestCodeGenerator {
  private readonly logger: Logger;
  private readonly llmProvider: BaseLLMProvider;

  constructor(llmProvider: BaseLLMProvider) {
    this.llmProvider = llmProvider;
    this.logger = createModuleLogger('services:test-code-generator');
  }

  /**
   * Generate test code from a parsed test case
   */
  async generate(
    testCase: ParsedTestCase,
    options: CodeGenerationOptions
  ): Promise<CodeGenerationResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    try {
      // Validate input
      this.validateInput(testCase, options);

      // Merge with defaults
      const opts = this.mergeOptions(options);

      // Build the prompt
      const prompt = this.buildPrompt(testCase, opts);

      // Create LLM completion
      const completion = await this.createCompletion(prompt, opts);

      // Parse the generated code
      const files = this.parseGeneratedCode(completion.content, warnings, testCase, opts);

      const processingTimeMs = Date.now() - startTime;

      this.logger.info('Successfully generated test code', {
        title: testCase.title,
        framework: opts.framework,
        filesCount: files.length,
        processingTimeMs,
      });

      return {
        files,
        success: true,
        warnings,
        processingTimeMs,
        tokensUsed: completion.usage
          ? {
              prompt: completion.usage.promptTokens,
              completion: completion.usage.completionTokens,
              total: completion.usage.totalTokens,
            }
          : undefined,
      };
    } catch (error) {
      if (error instanceof TestCodeGeneratorError) {
        throw error;
      }

      this.logger.error('Failed to generate test code', {
        error: error instanceof Error ? error.message : String(error),
      });

      throw new TestCodeGeneratorError(
        CodeGenerationErrorType.UNKNOWN,
        'Failed to generate test code',
        error
      );
    }
  }

  /**
   * Generate page objects from natural language description
   */
  async generatePageObjects(
    description: string,
    options: CodeGenerationOptions
  ): Promise<{ pageObject: PageObject; fileContent: string }> {
    const prompt = this.buildPageObjectPrompt(description, options);

    const completion = await this.llmProvider.createCompletion(
      [
        { role: 'system', content: CODE_GENERATION_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      {
        maxTokens: 3000,
        temperature: 0.3,
        timeout: 30000,
      }
    );

    const pageObject = this.parsePageObjectResponse(completion.content);
    const mergedOptions = this.mergeOptions(options);
    const fileContent = this.generatePageObjectFile(pageObject, mergedOptions);

    return { pageObject, fileContent };
  }

  /**
   * Validate input test case and options
   */
  private validateInput(
    testCase: ParsedTestCase,
    options: CodeGenerationOptions
  ): void {
    if (!testCase.title) {
      throw new TestCodeGeneratorError(
        CodeGenerationErrorType.INVALID_INPUT,
        'Test case must have a title'
      );
    }

    if (!options.framework) {
      throw new TestCodeGeneratorError(
        CodeGenerationErrorType.INVALID_INPUT,
        'Framework must be specified'
      );
    }

    // Check framework capabilities
    const capabilities = frameworkCapabilities[options.framework];
    if (!capabilities) {
      throw new TestCodeGeneratorError(
        CodeGenerationErrorType.UNSUPPORTED,
        `Unsupported framework: ${options.framework}`
      );
    }

    const language = options.language || 'typescript';
    if (!capabilities.languages.includes(language)) {
      throw new TestCodeGeneratorError(
        CodeGenerationErrorType.UNSUPPORTED,
        `Framework ${options.framework} does not support language: ${language}`
      );
    }

    const pattern = options.pattern || 'page-object';
    if (!capabilities.patterns.includes(pattern)) {
      throw new TestCodeGeneratorError(
        CodeGenerationErrorType.UNSUPPORTED,
        `Framework ${options.framework} does not support pattern: ${pattern}`
      );
    }

    if (options.generatePageObjects && !capabilities.supportsPageObjects) {
      throw new TestCodeGeneratorError(
        CodeGenerationErrorType.UNSUPPORTED,
        `Framework ${options.framework} does not support Page Object Model`
      );
    }
  }

  /**
   * Merge user options with defaults
   */
  private mergeOptions(
    options: CodeGenerationOptions
  ): Required<CodeGenerationOptions> {
    return {
      framework: options.framework,
      language: options.language || 'typescript',
      pattern: options.pattern || 'page-object',
      platform: options.platform || 'cross-platform',
      useTypeScript: options.useTypeScript ?? (options.language === 'typescript'),
      baseUrl: options.baseUrl || 'http://localhost:3000',
      timeout: {
        ...DEFAULT_OPTIONS.timeout,
        ...options.timeout,
      },
      includeComments: options.includeComments ?? true,
      useAsyncAwait: options.useAsyncAwait ?? true,
      importStyle: options.importStyle || 'named',
      namingConvention: options.namingConvention || 'kebab-case',
      generatePageObjects: options.generatePageObjects ?? true,
      pageObjectDir: options.pageObjectDir || 'pageObjects',
      includeTestData: options.includeTestData ?? true,
      customImports: options.customImports || [],
      hooks: options.hooks || {},
    };
  }

  /**
   * Build the prompt for LLM code generation
   */
  private buildPrompt(
    testCase: ParsedTestCase,
    options: Required<CodeGenerationOptions>
  ): string {
    const isTypeScript = options.language === 'typescript';

    let prompt = `Generate ${options.framework} test code in ${options.language} for the following test case.

Framework: ${options.framework}
Language: ${options.language}
Pattern: ${options.pattern}
${options.generatePageObjects ? 'Include Page Object Model classes.' : ''}

Test Case:
`;

    // Add test case details
    prompt += `
Title: ${testCase.title}
Description: ${testCase.description || 'N/A'}

Steps:
${testCase.steps.map((s) => `${s.order}. ${s.action}${s.testData ? ` (data: ${s.testData})` : ''}${s.expectedOutcome ? ` -> ${s.expectedOutcome}` : ''}`).join('\n')}

${testCase.assertions.length > 0 ? `Assertions:
${testCase.assertions.map((a) => `- ${a.condition} should be ${a.expected}${a.type ? ` (${a.type})` : ''}`).join('\n')}
` : ''}

${testCase.expectedOutcome ? `Expected Outcome: ${testCase.expectedOutcome}` : ''}

`;

    // Add configuration details
    prompt += `
Configuration:
- Base URL: ${options.baseUrl}
- Use TypeScript: ${isTypeScript}
- Include comments: ${options.includeComments}
- Async/await: ${options.useAsyncAwait}
- Naming convention: ${options.namingConvention}

`;

    // Add hooks if specified
    if (options.hooks.beforeAll || options.hooks.beforeEach) {
      prompt += `Hooks:\n`;
      if (options.hooks.beforeAll) {
        prompt += `- beforeAll: ${options.hooks.beforeAll}\n`;
      }
      if (options.hooks.beforeEach) {
        prompt += `- beforeEach: ${options.hooks.beforeEach}\n`;
      }
      if (options.hooks.afterEach) {
        prompt += `- afterEach: ${options.hooks.afterEach}\n`;
      }
      if (options.hooks.afterAll) {
        prompt += `- afterAll: ${options.hooks.afterAll}\n`;
      }
      prompt += '\n';
    }

    // Add example
    const example = DEFAULT_CODE_GENERATION_EXAMPLES[0];
    if (example) {
      prompt += `Example output format:
${JSON.stringify(example.output, null, 2)}
`;
    }

    prompt += CODE_GENERATION_JSON_SCHEMA;

    return prompt;
  }

  /**
   * Build prompt for page object generation
   */
  private buildPageObjectPrompt(
    description: string,
    options: CodeGenerationOptions
  ): string {
    return `Generate a Page Object class for the following page description.

Framework: ${options.framework}
Language: ${options.language || 'typescript'}

Page Description:
${description}

The Page Object should include:
1. Element locators using appropriate strategies
2. Methods for user interactions
3. Proper TypeScript typing

${CODE_GENERATION_JSON_SCHEMA}

Respond with a JSON object containing:
{
  "name": "PageName",
  "url": "/path-if-applicable",
  "elements": [
    {"name": "elementName", "strategy": "css", "value": "#selector", "description": "Element description"}
  ],
  "methods": [
    {"name": "methodName", "parameters": [], "returnType": "Promise<void>", "action": "description of action", "description": "Method description"}
  ]
}`;
  }

  /**
   * Create LLM completion for code generation
   */
  private async createCompletion(
    prompt: string,
    _options: Required<CodeGenerationOptions>
  ): Promise<import('../../llm/types.js').CompletionResponse> {
    const messages: ChatMessage[] = [
      { role: 'system', content: CODE_GENERATION_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];

    const completionOptions: CompletionOptions = {
      maxTokens: 4000,
      temperature: 0.2,
      timeout: 60000,
    };

    try {
      return await this.llmProvider.createCompletion(messages, completionOptions);
    } catch (error) {
      this.logger.error('LLM completion failed', { error });
      throw new TestCodeGeneratorError(
        CodeGenerationErrorType.LLM_ERROR,
        'Failed to get completion from LLM',
        error
      );
    }
  }

  /**
   * Parse the generated code from LLM response
   */
  private parseGeneratedCode(
    content: string,
    warnings: string[],
    testCase: ParsedTestCase,
    options: Required<CodeGenerationOptions>
  ): GeneratedTestFile[] {
    try {
      // Extract JSON from the response
      const jsonMatch =
        content.match(/```(?:json)?\s*([\s\S]*?)\s*```/) ||
        content.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new TestCodeGeneratorError(
          CodeGenerationErrorType.PARSE_ERROR,
          'No JSON found in LLM response'
        );
      }

      const jsonString = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonString) as { files?: GeneratedTestFile[]; warnings?: string[] };

      if (!parsed.files || !Array.isArray(parsed.files)) {
        // Fallback: generate basic test file directly
        warnings.push('LLM did not return expected format, using fallback generation');
        return this.generateFallbackTestFile(testCase, options);
      }

      return parsed.files;
    } catch (error) {
      if (error instanceof TestCodeGeneratorError) {
        throw error;
      }

      this.logger.warn('Failed to parse LLM response as JSON, using fallback', {
        error: error instanceof Error ? error.message : String(error),
      });

      warnings.push('Failed to parse LLM response, using fallback generation');
      return this.generateFallbackTestFile(testCase, options);
    }
  }

  /**
   * Parse page object response
   */
  private parsePageObjectResponse(content: string): PageObject {
    // Extract JSON from the response
    const jsonMatch =
      content.match(/```(?:json)?\s*([\s\S]*?)\s*```/) ||
      content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new TestCodeGeneratorError(
        CodeGenerationErrorType.PARSE_ERROR,
        'No JSON found in LLM response for page object'
      );
    }

    const jsonString = jsonMatch[1] || jsonMatch[0];
    return JSON.parse(jsonString) as PageObject;
  }

  /**
   * Generate a page object file content
   */
  private generatePageObjectFile(
    pageObject: PageObject,
    options: Required<CodeGenerationOptions>
  ): string {
    const isTypeScript = options.language === 'typescript';

    let content = '';

    // Add imports
    if (options.framework === 'webdriverio' || options.framework === 'appium') {
      content += `import { $, $$, browser } from '@wdio/globals';\n`;
    } else if (options.framework === 'playwright') {
      content += `import { Locator, Page } from '@playwright/test';\n`;
    }

    content += '\n';

    // Add class documentation
    if (options.includeComments && pageObject.description) {
      content += `/**\n * ${pageObject.description}\n */\n`;
    }

    // Class declaration
    content += `export class ${this.toPascalCase(pageObject.name)}`;

    // Constructor for Playwright
    if (options.framework === 'playwright') {
      content += ` {\n  private page: Page;\n\n`;
      content += `  constructor(page: Page) {\n    this.page = page;\n`;
      content += `    this.initElements();\n  }\n\n`;
      content += `  private initElements(): void {\n`;
      content += `    // Initialize locators\n`;
      for (const element of pageObject.elements) {
        content += `    this.${this.toCamelCase(element.name)} = this.page.locator('${element.value}');\n`;
      }
      content += `  }\n\n`;
    } else {
      content += ` {\n`;
    }

    // Add elements
    for (const element of pageObject.elements) {
      if (options.includeComments && element.description) {
        content += `  /**\n   * ${element.description}\n   */\n`;
      }

      if (options.framework === 'playwright') {
        // Elements are initialized in constructor
        content += `  public ${this.toCamelCase(element.name)}!: Locator;\n\n`;
      } else {
        const value = this.formatLocator(element, options);
        content += `  get ${this.toCamelCase(element.name)}() { return ${value}; }\n\n`;
      }
    }

    // Add methods
    if (pageObject.methods) {
      for (const method of pageObject.methods) {
        if (options.includeComments && method.description) {
          content += `  /**\n   * ${method.description}\n   */\n`;
        }

        const params = method.parameters
          ?.map((p) => `${p.name}${isTypeScript ? `: ${p.type}` : ''}`)
          .join(', ') || '';

        const returnType = isTypeScript && method.returnType ? `: ${method.returnType}` : '';

        content += `  async ${method.name}(${params})${returnType} {\n`;
        content += `    // ${method.action}\n`;
        content += `    throw new Error('Method not implemented');\n`;
        content += `  }\n\n`;
      }
    }

    content += `}\n`;

    return content;
  }

  /**
   * Format an element locator based on strategy
   */
  private formatLocator(
    element: { name: string; strategy: string; value: string },
    options: Required<CodeGenerationOptions>
  ): string {
    const { strategy, value } = element;

    switch (strategy) {
      case 'id':
        if (options.framework === 'playwright') {
          return `page.getByTestId('${value}')`;
        }
        return `$('#${value}')`;
      case 'css':
        if (options.framework === 'playwright') {
          return `page.locator('${value}')`;
        }
        return `$('${value}')`;
      case 'xpath':
        if (options.framework === 'playwright') {
          return `page.locator('xpath=${value}')`;
        }
        return `$('${value}')`;
      case 'accessibility-id':
        if (options.framework === 'playwright') {
          return `page.getByAccessibilityId('${value}')`;
        }
        return `$('${value}')`;
      case 'class-name':
        if (options.framework === 'playwright') {
          return `page.getByClass('${value}')`;
        }
        return `$$('.${value}')[0]`;
      case 'tag-name':
        if (options.framework === 'playwright') {
          return `page.locator('${value}')`;
        }
        return `$('${value}')`;
      case 'link-text':
        if (options.framework === 'playwright') {
          return `page.getByRole('link', { name: '${value}' })`;
        }
        return `=$=${value}`;
      case 'name':
        return `[name="${value}"]`;
      default:
        return `$('${value}')`;
    }
  }

  /**
   * Generate a fallback test file when LLM response cannot be parsed
   */
  private generateFallbackTestFile(
    testCase: ParsedTestCase,
    options: Required<CodeGenerationOptions>
  ): GeneratedTestFile[] {
    const isTypeScript = options.language === 'typescript';
    const files: GeneratedTestFile[] = [];

    const extension = isTypeScript ? '.ts' : '.js';
    const fileName = this.toKebabCase(testCase.title) + '.test' + extension;

    let content = '';

    // Add imports
    if (options.framework === 'playwright') {
      content += `import { test, expect } from '@playwright/test';\n`;
    } else {
      content += `import { expect } from '@wdio/globals';\n`;
    }

    if (options.generatePageObjects) {
      content += `// TODO: Import page objects when generated\n`;
    }

    content += '\n';

    // Test suite
    content += `describe('${testCase.title}', () => {\n`;
    content += `  it('should ${testCase.description || testCase.title.toLowerCase()}', async () => {\n`;

    // Generate steps
    for (const step of testCase.steps) {
      content += `    // ${step.action}\n`;
      content += `    // TODO: ${step.action}\n`;

      if (step.testData && options.includeTestData) {
        content += `    const testData = '${step.testData}';\n`;
      }
      content += '\n';
    }

    // Generate assertions
    for (const assertion of testCase.assertions) {
      content += `    // Assert: ${assertion.condition} is ${assertion.expected}\n`;
      content += `    // expect(await ).toBe(${assertion.expected});\n\n`;
    }

    content += `  });\n`;
    content += `});\n`;

    files.push({
      fileName,
      filePath: `tests/${fileName}`,
      content,
      fileType: 'test',
    });

    return files;
  }

  /**
   * Convert to PascalCase
   */
  private toPascalCase(str: string): string {
    return str
      .replace(/[-_\s](.)/g, (_, c) => c.toUpperCase())
      .replace(/^(.)/, (_, c) => c.toUpperCase());
  }

  /**
   * Convert to camelCase
   */
  private toCamelCase(str: string): string {
    const pascal = this.toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  }

  /**
   * Convert to kebab-case
   */
  private toKebabCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase();
  }

  /**
   * Generate code for multiple test cases in batch
   */
  async generateBatch(
    testCases: ParsedTestCase[],
    options: CodeGenerationOptions
  ): Promise<{
    results: CodeGenerationResult[];
    successRate: number;
    totalProcessingTimeMs: number;
  }> {
    const startTime = Date.now();

    this.logger.info('Starting batch code generation', {
      count: testCases.length,
      framework: options.framework,
    });

    const results: CodeGenerationResult[] = await Promise.all(
      testCases.map((testCase) =>
        this.generate(testCase, options).catch((error) => ({
          files: [],
          success: false,
          warnings: [error instanceof Error ? error.message : String(error)],
          processingTimeMs: 0,
          tokensUsed: undefined,
        }))
      )
    );

    const successCount = results.filter((r) => r.success).length;
    const totalProcessingTimeMs = Date.now() - startTime;

    this.logger.info('Batch code generation completed', {
      total: results.length,
      successful: successCount,
      failed: results.length - successCount,
      totalProcessingTimeMs,
    });

    return {
      results,
      successRate: successCount / results.length,
      totalProcessingTimeMs,
    };
  }

  /**
   * Health check for the generator service
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
let generatorInstance: TestCodeGenerator | undefined;

/**
 * Get or create the generator instance
 */
export function getTestCodeGenerator(llmProvider: BaseLLMProvider): TestCodeGenerator {
  if (!generatorInstance) {
    generatorInstance = new TestCodeGenerator(llmProvider);
  }
  return generatorInstance;
}

/**
 * Reset the generator instance (useful for testing)
 */
export function resetTestCodeGenerator(): void {
  generatorInstance = undefined;
}
