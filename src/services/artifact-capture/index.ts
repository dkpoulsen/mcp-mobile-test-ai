/**
 * Artifact capture service exports
 */

export {
  ArtifactCaptureService,
  getGlobalArtifactService,
  resetGlobalArtifactService,
} from './artifact-capture.js';

export {
  ArtifactCaptureType,
  type ArtifactCaptureConfig,
  type ArtifactCaptureContext,
  type CapturedArtifact,
  type DeviceLogCaptureOptions,
  type DeviceLogs,
  type PerformanceMetrics,
  type PerformanceMetricsCaptureOptions,
  type ScreenshotCaptureOptions,
  type TraceCaptureOptions,
  type VideoCaptureOptions,
} from './types.js';

export { createArtifactCollector, type ArtifactCollectorOptions } from './playwright-collector.js';
