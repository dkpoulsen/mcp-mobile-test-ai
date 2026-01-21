/**
 * Visual Baseline Service exports
 */

export {
  VisualBaselineService,
  getGlobalVisualBaselineService,
  resetGlobalVisualBaselineService,
  createVisualBaselineService,
} from './visual-baseline-service.js';

export type {
  DeviceMetadata,
  AppVersionMetadata,
  VisualBaselineMetadata,
  VisualBaselineCaptureOptions,
  VisualBaseline,
  VisualBaselineComparisonOptions,
  VisualBaselineComparisonResult,
  VisualBaselineConfig,
} from './types.js';
