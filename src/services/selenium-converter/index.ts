/**
 * Selenium Converter Service
 * Main service for converting Selenium tests from Java/Python to TypeScript
 */

// Export types
export type {
  SourceLanguage,
  TargetFramework,
  SeleniumActionType,
  LocatorType,
  ParsedLocator,
  ParsedAction,
  ParsedStep,
  ParsedAssertion,
  ParsedSeleniumTestCase,
  ParsedSeleniumTestSuite,
  ConversionOptions,
  ConversionResult,
  ConversionSummary,
  GeneratedTestFile,
  ApiMapping,
  ApiMappingParameter,
  ConverterErrorType,
} from './types.js';

// Export error class
export {
  SeleniumConverterError,
} from './types.js';

// Export main class and utilities
export {
  SeleniumConverter,
  getSeleniumConverter,
  resetSeleniumConverter,
} from './selenium-converter.js';

// Export parsers
export {
  JavaSeleniumParser,
  createJavaParser,
} from './java-parser.js';

export {
  PythonSeleniumParser,
  createPythonParser,
} from './python-parser.js';

// Export code generator
export {
  ConverterCodeGenerator,
  createCodeGenerator,
} from './code-generator.js';

// Export API mappings
export {
  convertLocator,
  getFrameworkImports,
  getTestWrapperKeywords,
  API_MAPPINGS,
  getAssertionMatcher,
} from './api-mappings.js';
