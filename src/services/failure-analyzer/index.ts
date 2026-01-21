/**
 * Failure Analyzer Service
 * Main entry point for the failure analyzer module
 */

// Export types
export type {
  FailureContext,
  FailureAnalysis,
  AnalysisOptions,
  BatchAnalysisInput,
  BatchAnalysisResult,
  FixAction,
  RootCauseHypothesis,
  FlakinessAnalysis,
} from './types.js';

// Export enums
export {
  FailureCategory,
  FlakinessConfidence,
  FailureSeverity,
  FailureAnalyzerErrorType,
} from './types.js';

// Export error class
export { FailureAnalyzerError } from './types.js';

// Export main class and utilities
export {
  FailureAnalyzer,
  getFailureAnalyzer,
  resetFailureAnalyzer,
} from './failure-analyzer.js';

// Export templates
export {
  buildFailureAnalysisPrompt,
  FAILURE_ANALYSIS_SYSTEM_PROMPT,
  FAILURE_ANALYSIS_JSON_SCHEMA,
  FAILURE_ANALYSIS_EXAMPLES,
} from './templates.js';
