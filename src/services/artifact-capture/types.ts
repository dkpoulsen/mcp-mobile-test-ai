/**
 * Type definitions for artifact capture service
 */

import type { Page, Video } from '@playwright/test';

/**
 * Artifact types that can be captured during test execution
 */
export enum ArtifactCaptureType {
  SCREENSHOT = 'screenshot',
  VIDEO = 'video',
  TRACE = 'trace',
  HAR = 'har',
  DEVICE_LOGS = 'device_logs',
  PERFORMANCE_METRICS = 'performance_metrics',
  NETWORK_LOGS = 'network_logs',
  CONSOLE_LOGS = 'console_logs',
}

/**
 * Screenshot capture options
 */
export interface ScreenshotCaptureOptions {
  /** Capture full page or just viewport */
  fullPage?: boolean;
  /** Screenshot path */
  path?: string;
  /** Screenshot type */
  type?: 'png' | 'jpeg';
  /** JPEG quality (0-100) */
  quality?: number;
  /** Additional metadata to attach */
  metadata?: Record<string, unknown>;
}

/**
 * Video capture options
 */
export interface VideoCaptureOptions {
  /** Video save path */
  path?: string;
  /** Video size */
  size?: { width: number; height: number };
  /** Additional metadata to attach */
  metadata?: Record<string, unknown>;
}

/**
 * Trace capture options
 */
export interface TraceCaptureOptions {
  /** Trace file path */
  path?: string;
  /** Include screenshots in trace */
  screenshots?: boolean;
  /** Include snapshots in trace */
  snapshots?: boolean;
  /** Additional metadata to attach */
  metadata?: Record<string, unknown>;
}

/**
 * Device log capture options
 */
export interface DeviceLogCaptureOptions {
  /** Log file path */
  path?: string;
  /** Log types to capture */
  logTypes?: ('browser' | 'console' | 'network')[];
  /** Additional metadata to attach */
  metadata?: Record<string, unknown>;
}

/**
 * Performance metrics capture options
 */
export interface PerformanceMetricsCaptureOptions {
  /** Metrics file path */
  path?: string;
  /** Capture timing metrics */
  captureTimings?: boolean;
  /** Capture resource metrics */
  captureResources?: boolean;
  /** Capture memory metrics */
  captureMemory?: boolean;
  /** Additional metadata to attach */
  metadata?: Record<string, unknown>;
}

/**
 * Captured artifact result
 */
export interface CapturedArtifact {
  /** Artifact type */
  type: ArtifactCaptureType;
  /** File path where artifact was saved */
  path: string;
  /** MIME type */
  mimeType?: string;
  /** File size in bytes */
  size?: number;
  /** Timestamp when captured */
  timestamp: Date;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Performance metrics data
 */
export interface PerformanceMetrics {
  /** Page load timing metrics */
  timings?: {
    /** DOM content loaded time */
    domContentLoaded?: number;
    /** Full page load time */
    loadComplete?: number;
    /** First paint time */
    firstPaint?: number;
    /** First contentful paint time */
    firstContentfulPaint?: number;
    /** Time to interactive */
    timeToInteractive?: number;
  };
  /** Resource metrics */
  resources?: {
    /** Total number of resources */
    count: number;
    /** Total transfer size in bytes */
    totalTransferSize: number;
    /** Total encoded body size in bytes */
    totalEncodedBodySize: number;
    /** Resources by type */
    byType: Record<string, number>;
  };
  /** Memory metrics */
  memory?: {
    /** Used JS heap size in bytes */
    usedJSHeapSize?: number;
    /** Total JS heap size in bytes */
    totalJSHeapSize?: number;
    /** JS heap size limit in bytes */
    jsHeapSizeLimit?: number;
  };
  /** Network metrics */
  network?: {
    /** Total number of network requests */
    requestCount: number;
    /** Failed requests */
    failedRequests: number;
    /** Average response time in ms */
    avgResponseTime: number;
    /** Requests by status code */
    byStatusCode: Record<string, number>;
  };
  /** Custom metrics */
  custom?: Record<string, number | string>;
}

/**
 * Device log data
 */
export interface DeviceLogs {
  /** Console logs */
  console?: Array<{
    type: string;
    text: string;
    timestamp: number;
    location?: { url: string; lineNumber: number; columnNumber: number };
  }>;
  /** Browser logs */
  browser?: Array<{
    level: string;
    message: string;
    timestamp: number;
  }>;
  /** Network logs */
  network?: Array<{
    method: string;
    url: string;
    status: number;
    timing: {
      startTime: number;
      endTime: number;
      duration: number;
    };
  }>;
}

/**
 * Artifact capture context
 */
export interface ArtifactCaptureContext {
  /** Test run ID */
  testRunId: string;
  /** Test case ID */
  testCaseId?: string;
  /** Test case name */
  testName?: string;
  /** Device ID */
  deviceId?: string;
  /** Platform */
  platform?: 'ios' | 'android' | 'web';
  /** Base directory for artifacts */
  baseDir?: string;
  /** Additional context data */
  metadata?: Record<string, unknown>;
}

/**
 * Artifact capture configuration
 */
export interface ArtifactCaptureConfig {
  /** Base directory for storing artifacts */
  baseDir: string;
  /** Whether to capture screenshots on test failure */
  captureScreenshotOnFailure: boolean;
  /** Whether to capture video during test execution */
  captureVideo: boolean;
  /** Whether to capture traces */
  captureTrace: boolean;
  /** Whether to capture HAR files */
  captureHar: boolean;
  /** Whether to capture device logs */
  captureDeviceLogs: boolean;
  /** Whether to capture performance metrics */
  capturePerformanceMetrics: boolean;
  /** Maximum size of artifacts to keep (in bytes) */
  maxArtifactSize?: number;
  /** Whether to compress old artifacts */
  compressOldArtifacts?: boolean;
  /** Age threshold for compression (in days) */
  compressionThresholdDays?: number;
}
