/**
 * Type definitions for visual baseline screenshot capture
 */

import type { Page } from '@playwright/test';

/**
 * Device metadata for visual baseline
 */
export interface DeviceMetadata {
  /** Device type */
  deviceType: 'desktop' | 'mobile' | 'tablet';
  /** Operating system */
  os: string;
  /** OS version */
  osVersion?: string;
  /** Browser name */
  browser: string;
  /** Browser version */
  browserVersion?: string;
  /** Screen viewport size */
  viewport: {
    width: number;
    height: number;
  };
  /** Device pixel ratio */
    pixelRatio?: number;
  /** User agent string */
  userAgent?: string;
}

/**
 * App version metadata
 */
export interface AppVersionMetadata {
  /** Application name */
  appName: string;
  /** Application version */
  appVersion: string;
  /** Build number */
  buildNumber?: string;
  /** Environment */
  environment: 'development' | 'staging' | 'production';
  /** Git commit SHA */
  gitCommit?: string;
  /** Git branch */
  gitBranch?: string;
  /** Build timestamp */
  buildTimestamp?: string;
}

/**
 * Visual baseline metadata
 */
export interface VisualBaselineMetadata {
  /** Device information */
  device: DeviceMetadata;
  /** App version information */
  appVersion: AppVersionMetadata;
  /** Screen/identifier name */
  screenName: string;
  /** Timestamp when baseline was captured */
  timestamp: string;
  /** Test run ID that created this baseline */
  testRunId: string;
  /** Optional description */
  description?: string;
  /** Tags for categorization */
  tags?: string[];
  /** Additional custom metadata */
  custom?: Record<string, unknown>;
}

/**
 * Screenshot capture options for visual baseline
 */
export interface VisualBaselineCaptureOptions {
  /** Capture full page or just viewport */
  fullPage?: boolean;
  /** Screenshot path (optional, auto-generated if not provided) */
  path?: string;
  /** Screenshot type */
  type?: 'png' | 'jpeg';
  /** JPEG quality (0-100) */
  quality?: number;
  /** Mask specific selectors (e.g., dynamic content) */
  maskSelectors?: string[];
  /** Clip to specific region */
  clip?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Wait for specific state before capturing */
  waitForSelector?: string;
  /** Wait time in ms before capturing */
  waitTime?: number;
  /** Screen name (identifier for the baseline) */
  screenName: string;
  /** Optional description */
  description?: string;
  /** Tags for categorization */
  tags?: string[];
  /** Additional custom metadata */
  customMetadata?: Record<string, unknown>;
}

/**
 * Visual baseline result
 */
export interface VisualBaseline {
  /** Unique baseline ID */
  id: string;
  /** Screen/identifier name */
  screenName: string;
  /** Path to the baseline image */
  imagePath: string;
  /** Path to the metadata file */
  metadataPath: string;
  /** Baseline metadata */
  metadata: VisualBaselineMetadata;
  /** File size in bytes */
  fileSize: number;
  /** Image dimensions */
  dimensions: {
    width: number;
    height: number;
  };
  /** Timestamp when created */
  createdAt: Date;
}

/**
 * Visual baseline comparison options (for future regression detection)
 */
export interface VisualBaselineComparisonOptions {
  /** Maximum allowable pixel difference percentage */
  maxDiffPixels?: number;
  /** Maximum allowable different pixels ratio (0-1) */
  maxDiffRatio?: number;
  /** Whether to ignore anti-aliasing differences */
  ignoreAntiAliasing?: boolean;
  /** Regions to ignore during comparison */
  ignoreRegions?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  /** Selectors to ignore during comparison */
  ignoreSelectors?: string[];
}

/**
 * Visual baseline comparison result (for future regression detection)
 */
export interface VisualBaselineComparisonResult {
  /** Whether the images match within tolerance */
  matches: boolean;
  /** Number of different pixels */
  diffPixels: number;
  /** Ratio of different pixels (0-1) */
  diffRatio: number;
  /** Path to diff image (if generated) */
  diffImagePath?: string;
  /** Baseline used for comparison */
  baseline: VisualBaseline;
}

/**
 * Visual baseline capture configuration
 */
export interface VisualBaselineConfig {
  /** Base directory for storing baselines */
  baseDir: string;
  /** Default app metadata */
  defaultAppMetadata: {
    appName: string;
    appVersion: string;
    buildNumber?: string;
    environment?: 'development' | 'staging' | 'production';
  };
  /** Whether to include device metadata */
  includeDeviceMetadata: boolean;
  /** Whether to include git metadata */
  includeGitMetadata: boolean;
  /** Screenshot type to use */
  defaultScreenshotType: 'png' | 'jpeg';
  /** Default JPEG quality */
  defaultQuality: number;
  /** Whether to capture full page by default */
  defaultFullPage: boolean;
}
