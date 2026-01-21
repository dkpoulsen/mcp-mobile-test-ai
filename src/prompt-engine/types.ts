/**
 * Prompt Template Engine Types
 * Defines types for template management, variable interpolation,
 * few-shot examples, and chain-of-thought prompting patterns.
 */

/**
 * Error types for prompt template operations
 */
export enum PromptTemplateErrorType {
  /**
   * Template syntax error
   */
  SYNTAX_ERROR = 'SYNTAX_ERROR',

  /**
   * Required variable is missing
   */
  MISSING_VARIABLE = 'MISSING_VARIABLE',

  /**
   * Variable validation failed
   */
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  /**
   * Template not found
   */
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',

  /**
   * Version not found
   */
  VERSION_NOT_FOUND = 'VERSION_NOT_FOUND',

  /**
   * Circular reference detected
   */
  CIRCULAR_REFERENCE = 'CIRCULAR_REFERENCE',

  /**
   * Unknown error
   */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Custom error class for prompt template operations
 */
export class PromptTemplateError extends Error {
  constructor(
    public type: PromptTemplateErrorType,
    message: string,
    public templateId?: string,
    public originalError?: unknown
  ) {
    super(`${type}: ${message}${templateId ? ` (template: ${templateId})` : ''}`);
    this.name = 'PromptTemplateError';
  }
}

/**
 * Variable definition for a template
 */
export interface TemplateVariable {
  /**
   * Variable name
   */
  name: string;

  /**
   * Variable description for documentation
   */
  description?: string;

  /**
   * Expected type of the variable
   */
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array';

  /**
   * Whether the variable is required
   */
  required?: boolean;

  /**
   * Default value if not provided
   */
  defaultValue?: unknown;

  /**
   * Validation function or schema
   */
  validation?: (value: unknown) => boolean | string;
}

/**
 * Variable context for template rendering
 */
export type TemplateContext = Record<string, unknown>;

/**
 * Variable interpolation options
 */
export interface InterpolationOptions {
  /**
   * Whether to throw on missing variables
   */
  strict?: boolean;

  /**
   * Custom formatters
   */
  formatters?: Record<string, (value: unknown) => string>;

  /**
   * Left delimiter for variables
   */
  leftDelimiter?: string;

  /**
   * Right delimiter for variables
   */
  rightDelimiter?: string;

  /**
   * Recursively resolve nested variables
   */
  recursive?: boolean;
}

/**
 * Few-shot example for a prompt template
 */
export interface FewShotExample {
  /**
   * Example input
   */
  input: string;

  /**
   * Example output
   */
  output: string;

  /**
   * Optional description of what this example demonstrates
   */
  description?: string;

  /**
   * Optional metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Chain-of-thought step
 */
export interface ThoughtStep {
  /**
   * Step description
   */
  thought: string;

  /**
   * Optional action to take
   */
  action?: string;

  /**
   * Optional result of the action
   */
  result?: string;

  /**
   * Optional metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Chain-of-thought configuration
 */
export interface ChainOfThoughtConfig {
  /**
   * Whether to enable chain-of-thought prompting
   */
  enabled: boolean;

  /**
   * Optional prefix for thought sections
   */
  prefix?: string;

  /**
   * Optional suffix for thought sections
   */
  suffix?: string;

  /**
   * Whether to include final reasoning summary
   */
  includeSummary?: boolean;

  /**
   * Optional thought steps (pre-defined)
   */
  steps?: ThoughtStep[];
}

/**
 * Prompt template metadata
 */
export interface TemplateMetadata {
  /**
   * Template name
   */
  name: string;

  /**
   * Template description
   */
  description?: string;

  /**
   * Tags for categorization
   */
  tags?: string[];

  /**
   * Author of the template
   */
  author?: string;

  /**
   * Created at timestamp
   */
  createdAt: Date;

  /**
   * Updated at timestamp
   */
  updatedAt: Date;
}

/**
 * Template version information
 */
export interface TemplateVersion {
  /**
   * Version number (semver)
   */
  version: string;

  /**
   * Version description
   */
  description?: string;

  /**
   * Template content for this version
   */
  template: string;

  /**
   * Variables for this version
   */
  variables: TemplateVariable[];

  /**
   * Few-shot examples for this version
   */
  examples?: FewShotExample[];

  /**
   * Chain-of-thought configuration
   */
  chainOfThought?: ChainOfThoughtConfig;

  /**
   * Created at timestamp
   */
  createdAt: Date;

  /**
   * Created by
   */
  createdBy?: string;
}

/**
 * Compiled template result
 */
export interface CompiledTemplate {
  /**
   * Render the template with given context
   */
  render(context: TemplateContext, options?: InterpolationOptions): string;

  /**
   * Validate context against required variables
   */
  validate(context: TemplateContext): ValidationResult;

  /**
   * Get all required variable names
   */
  getRequiredVariables(): string[];

  /**
   * Get all variable names
   */
  getAllVariables(): string[];

  /**
   * Get the source template
   */
  getSource(): string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /**
   * Whether validation passed
   */
  valid: boolean;

  /**
   * Validation errors
   */
  errors: string[];

  /**
   * Missing required variables
   */
  missing: string[];

  /**
   * Variables that failed validation
   */
  invalid: Record<string, string>;
}

/**
 * Template definition
 */
export interface PromptTemplate {
  /**
   * Unique template identifier
   */
  id: string;

  /**
   * Template metadata
   */
  metadata: TemplateMetadata;

  /**
   * Current version
   */
  version: string;

  /**
   * All available versions
   */
  versions: Record<string, TemplateVersion>;

  /**
   * Current template content
   */
  template: string;

  /**
   * Variables for current version
   */
  variables: TemplateVariable[];

  /**
   * Few-shot examples for current version
   */
  examples?: FewShotExample[];

  /**
   * Chain-of-thought configuration for current version
   */
  chainOfThought?: ChainOfThoughtConfig;
}

/**
 * Template compilation options
 */
export interface CompilationOptions {
  /**
   * Whether to enable validation
   */
  validate?: boolean;

  /**
   * Whether to cache compiled templates
   */
  cache?: boolean;

  /**
   * Custom delimiters
   */
  delimiters?: {
    left?: string;
    right?: string;
    comment?: string;
  };
}

/**
 * Template render result
 */
export interface RenderResult {
  /**
   * Rendered content
   */
  content: string;

  /**
   * Any warnings generated during rendering
   */
  warnings: string[];

  /**
   * Variables used
   */
  variablesUsed: string[];

  /**
   * Metadata about the render
   */
  metadata?: Record<string, unknown>;
}

/**
 * Template filter type
 */
export type TemplateFilter = (value: unknown, ...args: unknown[]) => string;

/**
 * Built-in formatters
 */
export interface BuiltInFormatters {
  // String formatters
  uppercase: (value: unknown) => string;
  lowercase: (value: unknown) => string;
  capitalize: (value: unknown) => string;
  title: (value: unknown) => string;
  truncate: (value: unknown, length?: number) => string;
  trim: (value: unknown) => string;
  replace: (value: unknown, search: string, replacement: string) => string;

  // Number formatters
  number: (value: unknown) => string;
  integer: (value: unknown) => string;
  decimal: (value: unknown, places?: number) => string;
  currency: (value: unknown, symbol?: string) => string;
  percent: (value: unknown) => string;

  // JSON formatters
  json: (value: unknown) => string;
  prettyJson: (value: unknown, spaces?: number) => string;

  // Conditional formatters
  default: (value: unknown, defaultValue: unknown) => string;
  if: (condition: unknown, thenValue: unknown, elseValue?: unknown) => string;

  // Array formatters
  join: (value: unknown, separator?: string) => string;
  first: (value: unknown) => string;
  last: (value: unknown) => string;
  length: (value: unknown) => string;

  // Date formatters
  date: (value: unknown, format?: string) => string;
  isoDate: (value: unknown) => string;
  relativeTime: (value: unknown) => string;

  // Index signature for dynamic access
  [key: string]: (value: unknown, ...args: unknown[]) => string;
}

/**
 * Template registry options
 */
export interface TemplateRegistryOptions {
  /**
   * Maximum number of templates to cache
   */
  maxCacheSize?: number;

  /**
   * Whether to enable validation by default
   */
  validateByDefault?: boolean;

  /**
   * Default interpolation options
   */
  defaultInterpolationOptions?: InterpolationOptions;
}
