/**
 * Type definitions for visual regression detection
 */

import type { VisualBaseline } from '../visual-baseline/types.js';

/**
 * Severity level for visual differences
 */
export enum DifferenceSeverity {
  /** No significant differences */
  NONE = 'none',
  /** Minor cosmetic differences that don't affect functionality */
  LOW = 'low',
  /** Noticeable differences that may affect user experience */
  MEDIUM = 'medium',
  /** Major differences that significantly affect appearance or functionality */
  HIGH = 'high',
  /** Critical differences that break the user interface */
  CRITICAL = 'critical',
}

/**
 * Region to ignore during comparison
 */
export interface IgnoreRegion {
  /** X coordinate in pixels */
  x: number;
  /** Y coordinate in pixels */
  y: number;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Optional description of why this region is ignored */
  description?: string;
}

/**
 * Detected visual difference
 */
export interface VisualDifference {
  /** Severity of the difference */
  severity: DifferenceSeverity;
  /** Brief description of the difference */
  description: string;
  /** Bounding box of the difference area */
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Confidence score (0-1) from LLM analysis */
  confidence?: number;
  /** Type of difference */
  type?: 'layout' | 'color' | 'content' | 'missing' | 'extra' | 'text' | 'other';
}

/**
 * Pixel-based comparison result
 */
export interface PixelComparisonResult {
  /** Whether images match within threshold */
  matches: boolean;
  /** Number of different pixels */
  diffPixels: number;
  /** Total pixels compared */
  totalPixels: number;
  /** Ratio of different pixels (0-1) */
  diffRatio: number;
  /** Path to diff image */
  diffImagePath?: string;
  /** Maximum pixel difference found (0-255) */
  maxDiff: number;
  /** Mean pixel difference */
  meanDiff: number;
}

/**
 * LLM-based analysis result
 */
export interface LLMAnalysisResult {
  /** Whether LLM analysis was performed */
  analyzed: boolean;
  /** Overall severity assessment */
  severity: DifferenceSeverity;
  /** Human-readable summary */
  summary: string;
  /** Detailed list of differences found */
  differences: VisualDifference[];
  /** Whether the difference is expected/acceptable */
  isAcceptable: boolean;
  /** Reasoning for the assessment */
  reasoning?: string;
  /** Model used for analysis */
  model?: string;
}

/**
 * Visual regression detection result
 */
export interface VisualRegressionResult {
  /** Unique result ID */
  id: string;
  /** Whether regression was detected */
  hasRegression: boolean;
  /** Overall severity */
  severity: DifferenceSeverity;
  /** Pixel-based comparison results */
  pixelComparison: PixelComparisonResult;
  /** LLM-based analysis results */
  llmAnalysis: LLMAnalysisResult;
  /** Baseline used for comparison */
  baseline: VisualBaseline;
  /** Current image path */
  currentImagePath: string;
  /** Timestamp of comparison */
  timestamp: Date;
  /** Processing time in milliseconds */
  processingTimeMs: number;
}

/**
 * Options for visual regression detection
 */
export interface VisualRegressionOptions {
  /** Maximum allowable different pixel ratio (0-1) */
  maxDiffRatio?: number;
  /** Maximum allowable different pixels */
  maxDiffPixels?: number;
  /** Pixel difference threshold (0-255) */
  pixelThreshold?: number;
  /** Whether to ignore anti-aliasing differences */
  ignoreAntiAliasing?: boolean;
  /** Whether to ignore colors */
  ignoreColors?: boolean;
  /** Regions to ignore during comparison */
  ignoreRegions?: IgnoreRegion[];
  /** CSS selectors to ignore (elements will be masked) */
  ignoreSelectors?: string[];
  /** Whether to use LLM for intelligent analysis */
  useLLMAnalysis?: boolean;
  /** Whether to generate diff image */
  generateDiffImage?: boolean;
  /** Output directory for diff images */
  diffOutputDir?: string;
  /** Custom description for LLM context */
  description?: string;
  /** API key for LLM provider (if different from default) */
  llmApiKey?: string;
  /** LLM model to use for analysis */
  llmModel?: string;
  /** Timeout for LLM analysis in milliseconds */
  llmTimeout?: number;
}

/**
 * Configuration for the visual regression detector
 */
export interface VisualRegressionDetectorConfig {
  /** Default maximum diff ratio */
  defaultMaxDiffRatio: number;
  /** Default pixel threshold */
  defaultPixelThreshold: number;
  /** Whether to enable LLM analysis by default */
  enableLLMAnalysis: boolean;
  /** Default LLM provider */
  llmProvider: 'anthropic' | 'openai';
  /** Default LLM model */
  llmModel: string;
  /** Default timeout for LLM requests */
  defaultLLMTimeout: number;
  /** Diff image output directory */
  diffOutputDir: string;
  /** Whether to enable caching */
  enableCache: boolean;
  /** Maximum cache size */
  maxCacheSize: number;
}

/**
 * Error types for visual regression detection
 */
export enum VisualRegressionErrorType {
  /** Image file not found */
  IMAGE_NOT_FOUND = 'IMAGE_NOT_FOUND',
  /** Invalid image format */
  INVALID_IMAGE = 'INVALID_IMAGE',
  /** Image dimensions don't match */
  DIMENSION_MISMATCH = 'DIMENSION_MISMATCH',
  /** LLM analysis failed */
  LLM_ERROR = 'LLM_ERROR',
  /** File system error */
  FILESYSTEM_ERROR = 'FILESYSTEM_ERROR',
  /** Invalid configuration */
  INVALID_CONFIG = 'INVALID_CONFIG',
  /** Unknown error */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Custom error for visual regression detection
 */
export class VisualRegressionError extends Error {
  constructor(
    public type: VisualRegressionErrorType,
    message: string,
    public originalError?: unknown
  ) {
    super(`VisualRegressionError [${type}]: ${message}`);
    this.name = 'VisualRegressionError';
  }
}
