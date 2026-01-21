/**
 * Test Code Generator Service
 * Main service for generating executable test code from parsed test specifications
 */

// Export types
export type {
  TestFramework,
  Language,
  PatternStyle,
  MobilePlatform,
  LocatorStrategy,
  ElementLocator,
  PageObject,
  PageMethod,
  Parameter,
  GeneratedTestFile,
  CodeGenerationOptions,
  CodeGenerationResult,
  BatchCodeGenerationInput,
  BatchCodeGenerationResult,
  FrameworkCapabilities,
  CodeTemplate,
} from './types.js';

// Export error class and enum
export {
  TestCodeGeneratorError,
  CodeGenerationErrorType,
} from './types.js';

// Export main class and utilities
export {
  TestCodeGenerator,
  getTestCodeGenerator,
  resetTestCodeGenerator,
} from './test-code-generator.js';

// Export templates
export {
  getTemplate,
  getTemplatesForFramework,
  getTemplateKeys,
  CODE_GENERATION_SYSTEM_PROMPT,
  CODE_GENERATION_JSON_SCHEMA,
  DEFAULT_CODE_GENERATION_EXAMPLES,
  frameworkCapabilities,
} from './templates.js';
