/**
 * Visual Regression Detector Service exports
 */

export {
  VisualRegressionDetector,
  getGlobalVisualRegressionDetector,
  resetGlobalVisualRegressionDetector,
  createVisualRegressionDetector,
} from './visual-regression-detector.js';

export type {
  VisualRegressionOptions,
  VisualRegressionResult,
  VisualRegressionDetectorConfig,
  PixelComparisonResult,
  LLMAnalysisResult,
  VisualDifference,
  IgnoreRegion,
} from './types.js';

export {
  DifferenceSeverity,
  VisualRegressionError,
  VisualRegressionErrorType,
} from './types.js';
