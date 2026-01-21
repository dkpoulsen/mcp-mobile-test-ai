/**
 * Selenium Converter Types
 * Types for converting Selenium tests from Java/Python to TypeScript
 */

/**
 * Source language of the Selenium test
 */
export type SourceLanguage = 'java' | 'python';

/**
 * Target framework for conversion
 */
export type TargetFramework = 'webdriverio' | 'playwright' | 'appium';

/**
 * Selenium action types
 */
export type SeleniumActionType =
  | 'navigate'
  | 'click'
  | 'sendKeys'
  | 'clear'
  | 'submit'
  | 'findElement'
  | 'findElements'
  | 'getText'
  | 'getAttribute'
  | 'isDisplayed'
  | 'isEnabled'
  | 'isSelected'
  | 'waitFor'
  | 'waitForElement'
  | 'sleep'
  | 'select'
  | 'deselect'
  | 'assert'
  | 'verify'
  | 'assertEquals'
  | 'assertTrue'
  | 'assertFalse'
  | 'assertContains'
  | 'switchTo'
  | 'frame'
  | 'window'
  | 'alert'
  | 'accept'
  | 'dismiss'
  | 'sendKeys'
  | 'hover'
  | 'dragAndDrop'
  | 'scroll'
  | 'executeScript'
  | 'screenshot'
  | 'unknown';

/**
 * Locator strategy types
 */
export type LocatorType =
  | 'id'
  | 'name'
  | 'className'
  | 'tagName'
  | 'xpath'
  | 'cssSelector'
  | 'linkText'
  | 'partialLinkText'
  | 'accessibilityId';

/**
 * Parsed locator information
 */
export interface ParsedLocator {
  type: LocatorType;
  value: string;
  original: string;
}

/**
 * Parsed Selenium action
 */
export interface ParsedAction {
  type: SeleniumActionType;
  target?: ParsedLocator;
  value?: string;
  arguments?: string[];
  original: string;
  lineNumber?: number;
  comment?: string;
}

/**
 * Parsed test step
 */
export interface ParsedStep {
  order: number;
  action: string;
  code?: string;
  expectedOutcome?: string;
  assertions?: ParsedAssertion[];
  pageObject?: string;
}

/**
 * Parsed assertion
 */
export interface ParsedAssertion {
  type: 'equality' | 'truthiness' | 'contains' | 'visibility' | 'exists' | 'attribute';
  condition: string;
  expected: string;
  actual?: string;
  original: string;
}

/**
 * Parsed test case from Selenium
 */
export interface ParsedSeleniumTestCase {
  name: string;
  description?: string;
  steps: ParsedStep[];
  assertions: ParsedAssertion[];
  setUp?: string[];
  tearDown?: string[];
  annotations: string[];
  imports: string[];
  pageObjects: string[];
  sourceLanguage: SourceLanguage;
  originalCode: string;
}

/**
 * Parsed test suite
 */
export interface ParsedSeleniumTestSuite {
  name: string;
  testCases: ParsedSeleniumTestCase[];
  imports: Set<string>;
  annotations: string[];
  sourceLanguage: SourceLanguage;
  basePath?: string;
}

/**
 * Conversion options
 */
export interface ConversionOptions {
  /**
   * Target framework
   */
  targetFramework: TargetFramework;

  /**
   * Output directory
   */
  outputDir: string;

  /**
   * Whether to generate page objects
   */
  generatePageObjects?: boolean;

  /**
   * Whether to use TypeScript
   */
  useTypeScript?: boolean;

  /**
   * Base URL for tests
   */
  baseUrl?: string;

  /**
   * Whether to include comments
   */
  includeComments?: boolean;

  /**
   * Whether to preserve original test structure
   */
  preserveStructure?: boolean;

  /**
   * Timeout configuration
   */
  timeout?: {
    implicit: number;
    pageLoad: number;
    script: number;
  };
}

/**
 * Conversion result
 */
export interface ConversionResult {
  success: boolean;
  files: GeneratedTestFile[];
  warnings: string[];
  errors: string[];
  summary: ConversionSummary;
}

/**
 * Conversion summary
 */
export interface ConversionSummary {
  sourceFiles: number;
  testCasesConverted: number;
  pageObjectsGenerated: number;
  actionsConverted: number;
  unsupportedActions: number;
  processingTimeMs: number;
}

/**
 * Generated test file
 */
export interface GeneratedTestFile {
  fileName: string;
  filePath: string;
 content: string;
  fileType: 'test' | 'page-object' | 'helper' | 'config';
}

/**
 * API mapping from Selenium to target framework
 */
export interface ApiMapping {
  seleniumMethod: string;
  targetMethod: string;
  targetImport?: string;
  template: string;
  parameters: ApiMappingParameter[];
}

/**
 * API mapping parameter
 */
export interface ApiMappingParameter {
  name: string;
  source: 'locator' | 'value' | 'timeout' | 'attribute';
  transform?: (value: string) => string;
}

/**
 * Converter error types
 */
export enum ConverterErrorType {
  PARSE_ERROR = 'PARSE_ERROR',
  UNSUPPORTED_ACTION = 'UNSUPPORTED_ACTION',
  UNSUPPORTED = 'UNSUPPORTED',
  INVALID_SYNTAX = 'INVALID_SYNTAX',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  GENERATION_ERROR = 'GENERATION_ERROR',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Custom error class for converter operations
 */
export class SeleniumConverterError extends Error {
  constructor(
    public type: ConverterErrorType,
    message: string,
    public originalError?: unknown
  ) {
    super(`[SeleniumConverter] ${type}: ${message}`);
    this.name = 'SeleniumConverterError';
  }
}
