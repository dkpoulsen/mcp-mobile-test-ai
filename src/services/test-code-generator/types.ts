/**
 * Test Code Generator Types
 * Defines types for generating executable test code from parsed test specifications
 */

import type { ParsedTestCase } from '../nl-test-parser/types.js';

/**
 * Target test framework
 */
export type TestFramework = 'webdriverio' | 'appium' | 'playwright';

/**
 * Target programming language
 */
export type Language = 'typescript' | 'javascript';

/**
 * Test code pattern style
 */
export type PatternStyle = 'page-object' | 'inline' | 'data-driven';

/**
 * Mobile platform for Appium tests
 */
export type MobilePlatform = 'ios' | 'android' | 'cross-platform';

/**
 * Locator strategy for element identification
 */
export type LocatorStrategy =
  | 'id'
  | 'css'
  | 'xpath'
  | 'accessibility-id'
  | 'class-name'
  | 'tag-name'
  | 'link-text'
  | 'partial-link-text'
  | 'name';

/**
 * Element locator definition
 */
export interface ElementLocator {
  /**
   * Name/alias for the element
   */
  name: string;

  /**
   * The locator strategy
   */
  strategy: LocatorStrategy;

  /**
   * The locator value
   */
  value: string;

  /**
   * Optional description
   */
  description?: string;
}

/**
 * Page object definition
 */
export interface PageObject {
  /**
   * Name of the page object
   */
  name: string;

  /**
   * URL/route for the page (for web tests)
   */
  url?: string;

  /**
   * Elements on this page
   */
  elements: ElementLocator[];

  /**
   * Methods/actions available on this page
   */
  methods?: PageMethod[];

  /**
   * Description of the page
   */
  description?: string;
}

/**
 * Method definition for page objects
 */
export interface PageMethod {
  /**
   * Method name
   */
  name: string;

  /**
   * Method parameters
   */
  parameters?: Parameter[];

  /**
   * Return type
   */
  returnType?: string;

  /**
   * The action/implementation
   */
  action: string;

  /**
   * Description
   */
  description?: string;
}

/**
 * Method parameter definition
 */
export interface Parameter {
  name: string;
  type: string;
  description?: string;
  defaultValue?: string;
}

/**
 * Generated test file structure
 */
export interface GeneratedTestFile {
  /**
   * File name
   */
  fileName: string;

  /**
   * File path (relative path)
   */
  filePath: string;

  /**
   * File content
   */
  content: string;

  /**
   * Type of file
   */
  fileType: 'test' | 'page-object' | 'helper' | 'config';
}

/**
 * Code generation options
 */
export interface CodeGenerationOptions {
  /**
   * Target test framework
   */
  framework: TestFramework;

  /**
   * Programming language
   */
  language?: Language;

  /**
   * Code pattern style
   */
  pattern?: PatternStyle;

  /**
   * Mobile platform (for Appium)
   */
  platform?: MobilePlatform;

  /**
   * Whether to use TypeScript (deprecated, use language)
   */
  useTypeScript?: boolean;

  /**
   * Custom base URL for web tests
   */
  baseUrl?: string;

  /**
   * Timeout configuration
   */
  timeout?: {
    implicit?: number;
    script?: number;
    pageLoad?: number;
    element?: number;
  };

  /**
   * Whether to include comments
   */
  includeComments?: boolean;

  /**
   * Whether to use async/await
   */
  useAsyncAwait?: boolean;

  /**
   * Import style (named vs default)
   */
  importStyle?: 'named' | 'default';

  /**
   * Test file naming convention
   */
  namingConvention?: 'kebab-case' | 'camelCase' | 'PascalCase' | 'snake_case';

  /**
   * Whether to generate page objects
   */
  generatePageObjects?: boolean;

  /**
   * Page object directory path
   */
  pageObjectDir?: string;

  /**
   * Whether to include test data in generated code
   */
  includeTestData?: boolean;

  /**
   * Custom imports to include
   */
  customImports?: string[];

  /**
   * Custom before/after hooks
   */
  hooks?: {
    beforeAll?: string;
    beforeEach?: string;
    afterEach?: string;
    afterAll?: string;
  };
}

/**
 * Code generation result
 */
export interface CodeGenerationResult {
  /**
   * Generated test files
   */
  files: GeneratedTestFile[];

  /**
   * Whether generation was successful
   */
  success: boolean;

  /**
   * Warnings during generation
   */
  warnings: string[];

  /**
   * Processing time in milliseconds
   */
  processingTimeMs: number;

  /**
   * Tokens used (if LLM was used)
   */
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/**
 * Batch code generation input
 */
export interface BatchCodeGenerationInput {
  /**
   * Parsed test cases
   */
  testCases: ParsedTestCase[];

  /**
   * Shared options for all test cases
   */
  options: CodeGenerationOptions;
}

/**
 * Batch code generation result
 */
export interface BatchCodeGenerationResult {
  /**
   * Individual results for each test case
   */
  results: CodeGenerationResult[];

  /**
   * Overall success rate
   */
  successRate: number;

  /**
   * Total processing time in milliseconds
   */
  totalProcessingTimeMs: number;

  /**
   * Total tokens used across all generations
   */
  totalTokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/**
 * Error types for code generation operations
 */
export enum CodeGenerationErrorType {
  /**
   * Invalid input test case
   */
  INVALID_INPUT = 'INVALID_INPUT',

  /**
   * LLM request failed
   */
  LLM_ERROR = 'LLM_ERROR',

  /**
   * Code generation failed
   */
  GENERATION_ERROR = 'GENERATION_ERROR',

  /**
   * Missing required fields
   */
  MISSING_FIELDS = 'MISSING_FIELDS',

  /**
   * Failed to parse LLM response
   */
  PARSE_ERROR = 'PARSE_ERROR',

  /**
   * Unsupported framework or language
   */
  UNSUPPORTED = 'UNSUPPORTED',

  /**
   * Rate limit exceeded
   */
  RATE_LIMIT = 'RATE_LIMIT',

  /**
   * Unknown error
   */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Custom error class for code generation operations
 */
export class TestCodeGeneratorError extends Error {
  constructor(
    public type: CodeGenerationErrorType,
    message: string,
    public originalError?: unknown
  ) {
    super(`[TestCodeGenerator] ${type}: ${message}`);
    this.name = 'TestCodeGeneratorError';
  }
}

/**
 * Framework capabilities
 */
export interface FrameworkCapabilities {
  /**
   * Supported languages
   */
  languages: Language[];

  /**
   * Supported pattern styles
   */
  patterns: PatternStyle[];

  /**
   * Whether page object model is supported
   */
  supportsPageObjects: boolean;

  /**
   * Whether it supports mobile platforms
   */
  supportsMobile: boolean;

  /**
   * Default file extension
   */
  defaultFileExtension: string;

  /**
   * Whether TypeScript is supported
   */
  supportsTypeScript: boolean;
}

/**
 * Code template for generation
 */
export interface CodeTemplate {
  /**
   * Template name
   */
  name: string;

  /**
   * Framework this template is for
   */
  framework: TestFramework;

  /**
   * Language this template is for
   */
  language: Language;

  /**
   * Pattern style
   */
  pattern: PatternStyle;

  /**
   * Template content
   */
  template: string;

  /**
   * Description
   */
  description?: string;
}
