/**
 * Test Data Generator Types
 * Schema definitions and types for generating test data using LLMs
 */

import type { z } from 'zod';

/**
 * Base data type schema definition
 */
export interface DataSchema<T = unknown> {
  /**
   * Schema name/identifier
   */
  name: string;

  /**
   * Human-readable description
   */
  description: string;

  /**
   * Zod schema for validation
   */
  schema: z.ZodType<T>;

  /**
   * Example values for prompt guidance
   */
  examples?: T[];

  /**
   * Field definitions for structured data
   */
  fields?: Record<string, FieldDefinition>;

  /**
   * Constraints for the generated data
   */
  constraints?: DataConstraints;
}

/**
 * Field definition for structured data types
 */
export interface FieldDefinition {
  /**
   * Field description
   */
  description: string;

  /**
   * Field type
   */
  type: FieldType;

  /**
   * Whether the field is required
   */
  required: boolean;

  /**
   * Example values
   */
  examples?: unknown[];

  /**
   * Field-specific constraints
   */
  constraints?: FieldConstraints;
}

/**
 * Supported field types
 */
export type FieldType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'email'
  | 'url'
  | 'date'
  | 'datetime'
  | 'phone'
  | 'uuid'
  | 'enum'
  | 'array'
  | 'object';

/**
 * Constraints for generated data
 */
export interface DataConstraints {
  /**
   * Minimum length for strings/arrays
   */
  minLength?: number;

  /**
   * Maximum length for strings/arrays
   */
  maxLength?: number;

  /**
   * Minimum value for numbers
   */
  min?: number;

  /**
   * Maximum value for numbers
   */
  max?: number;

  /**
   * Allowed values for enums
   */
  allowedValues?: string[];

  /**
   * Pattern to match (regex)
   */
  pattern?: string;
}

/**
 * Field-specific constraints
 */
export interface FieldConstraints extends DataConstraints {
  /**
   * Whether to generate edge cases for this field
   */
  generateEdgeCases?: boolean;

  /**
   * Specific edge cases to generate
   */
  edgeCases?: EdgeCaseType[];
}

/**
 * Edge case types for testing
 */
export type EdgeCaseType =
  | 'empty'
  | 'null'
  | 'min_length'
  | 'max_length'
  | 'min_value'
  | 'max_value'
  | 'negative_zero'
  | 'very_long'
  | 'special_chars'
  | 'unicode'
  | 'sql_injection'
  | 'xss'
  | 'invalid_format'
  | 'boundary_below'
  | 'boundary_above';

/**
 * Generation options for test data
 */
export interface GenerationOptions {
  /**
   * Number of records to generate
   */
  count?: number;

  /**
   * Whether to include edge cases
   */
  includeEdgeCases?: boolean;

  /**
   * Specific edge cases to generate
   */
  edgeCaseTypes?: EdgeCaseType[];

  /**
   * Seed for reproducible generation
   */
  seed?: number;

  /**
   * Locale for region-specific data
   */
  locale?: string;

  /**
   * Whether to validate generated data
   */
  validate?: boolean;

  /**
   * Custom constraints to override schema defaults
   */
  overrides?: Partial<DataConstraints>;
}

/**
 * Result of data generation
 */
export interface GenerationResult<T = unknown> {
  /**
   * Generated data items
   */
  data: T[];

  /**
   * Edge case data (if requested)
   */
  edgeCases?: Map<EdgeCaseType, T>;

  /**
   * Validation errors (if any)
   */
  errors: Array<{
    index: number;
    error: string;
    value: unknown;
  }>;

  /**
   * Metadata about the generation
   */
  metadata: {
    schema: string;
    count: number;
    edgeCaseTypes?: EdgeCaseType[];
    duration: number;
    tokensUsed?: number;
  };
}

/**
 * Batch generation request for multiple schemas
 */
export interface BatchGenerationRequest {
  /**
   * Schema name to generate
   */
  schemaName: string;

  /**
   * Generation options for this schema
   */
  options?: GenerationOptions;
}

/**
 * Batch generation result
 */
export interface BatchGenerationResult {
  /**
   * Results keyed by schema name
   */
  results: Map<string, GenerationResult>;

  /**
   * Overall metadata
   */
  metadata: {
    totalSchemas: number;
    totalRecords: number;
    totalEdgeCases: number;
    duration: number;
  };
}
