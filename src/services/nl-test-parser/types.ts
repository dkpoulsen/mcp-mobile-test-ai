/**
 * Natural Language Test Parser Types
 * Defines types for parsing natural language test descriptions
 * into structured test cases
 */

/**
 * Import element location types for enhanced selector support
 */
import type {
  LocatorStrategy,
  ParsedSelector as ElementParsedSelector,
  LocatorType,
} from '../element-location/types.js';

/**
 * Element locator configuration for test steps
 */
export interface StepElementLocator {
  /**
   * Primary selector string (can be natural language, CSS, XPath, etc.)
   */
  selector?: string;

  /**
   * Parsed selector with multiple strategies
   * This is the enhanced format that supports fallbacks
   */
  parsedSelector?: ElementParsedSelector;

  /**
   * Individual locator strategies (alternative to parsedSelector)
   */
  strategies?: LocatorStrategy[];

  /**
   * Whether element must be visible
   */
  mustBeVisible?: boolean;

  /**
   * Whether element must be clickable
   */
  mustBeClickable?: boolean;

  /**
   * Custom timeout for this element (ms)
   */
  timeout?: number;
}

/**
 * A single test step extracted from natural language
 */
export interface TestStep {
  /**
   * Step number or order
   */
  order: number;

  /**
   * Description of the action to perform
   */
  action: string;

  /**
   * Expected outcome of this step
   */
  expectedOutcome?: string;

  /**
   * Optional selector or locator information
   * @deprecated Use elementLocator for enhanced functionality
   */
  selector?: string;

  /**
   * Enhanced element locator with multiple strategies and fallbacks
   */
  elementLocator?: StepElementLocator;

  /**
   * Optional test data required for this step
   */
  testData?: string;
}

/**
 * An assertion extracted from natural language
 */
export interface TestAssertion {
  /**
   * What is being asserted
   */
  condition: string;

  /**
   * Expected value or state
   */
  expected: string;

  /**
   * Actual value placeholder (to be filled during execution)
   */
  actual?: string;

  /**
   * Assertion type (equality, existence, visibility, etc.)
   */
  type?: 'equality' | 'existence' | 'visibility' | 'containment' | 'custom';
}

/**
 * Test data requirement extracted from natural language
 */
export interface TestDataRequirement {
  /**
   * Name of the test data
   */
  name: string;

  /**
   * Type of data (string, number, email, etc.)
   */
  type: string;

  /**
   * Description of what the data represents
   */
  description?: string;

  /**
   * Example value for the test data
   */
  example?: string;

  /**
   * Whether this data is dynamically generated
   */
  isDynamic?: boolean;
}

/**
 * Parsed test case result from natural language
 */
export interface ParsedTestCase {
  /**
   * Extracted test title/summary
   */
  title: string;

  /**
   * Brief description of what the test validates
   */
  description?: string;

  /**
   * Extracted test steps in order
   */
  steps: TestStep[];

  /**
   * Extracted assertions
   */
  assertions: TestAssertion[];

  /**
   * Test data requirements
   */
  testDataRequirements: TestDataRequirement[];

  /**
   * Any tags or categories extracted from the description
   */
  tags: string[];

  /**
   * Prerequisites or setup requirements
   */
  prerequisites: string[];

  /**
   * Expected final outcome
   */
  expectedOutcome: string;
}

/**
 * Parser options for controlling behavior
 */
export interface ParserOptions {
  /**
   * Whether to extract test data requirements
   */
  extractTestData?: boolean;

  /**
   * Whether to extract individual assertions
   */
  extractAssertions?: boolean;

  /**
   * Whether to identify prerequisites
   */
  extractPrerequisites?: boolean;

  /**
   * Maximum number of steps to extract
   */
  maxSteps?: number;

  /**
   * Level of detail in parsing
   */
  detailLevel?: 'concise' | 'standard' | 'detailed';
}

/**
 * Parser result with metadata
 */
export interface ParserResult {
  /**
   * The parsed test case
   */
  testCase: ParsedTestCase;

  /**
   * Whether parsing was successful
   */
  success: boolean;

  /**
   * Any warnings generated during parsing
   */
  warnings: string[];

  /**
   * Processing time in milliseconds
   */
  processingTimeMs: number;

  /**
   * The raw LLM response for debugging
   */
  rawResponse?: string;

  /**
   * Tokens used during parsing
   */
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/**
 * Batch parser input for multiple descriptions
 */
export interface BatchParseInput {
  /**
   * Array of natural language test descriptions
   */
  descriptions: string[];

  /**
   * Shared options for all descriptions
   */
  options?: ParserOptions;
}

/**
 * Batch parser result
 */
export interface BatchParseResult {
  /**
   * Individual results for each description
   */
  results: ParserResult[];

  /**
   * Overall success rate
   */
  successRate: number;

  /**
   * Total processing time in milliseconds
   */
  totalProcessingTimeMs: number;

  /**
   * Total tokens used across all parses
   */
  totalTokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/**
 * Error types for parser operations
 */
export enum ParserErrorType {
  /**
   * Invalid input description
   */
  INVALID_INPUT = 'INVALID_INPUT',

  /**
   * LLM request failed
   */
  LLM_ERROR = 'LLM_ERROR',

  /**
   * Failed to parse LLM response
   */
  PARSE_ERROR = 'PARSE_ERROR',

  /**
   * Missing required fields in parsed result
   */
  MISSING_FIELDS = 'MISSING_FIELDS',

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
 * Custom error class for parser operations
 */
export class NLTestParserError extends Error {
  constructor(
    public type: ParserErrorType,
    message: string,
    public originalError?: unknown
  ) {
    super(`[NLTestParser] ${type}: ${message}`);
    this.name = 'NLTestParserError';
  }
}
