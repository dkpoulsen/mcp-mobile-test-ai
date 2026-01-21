/**
 * Self-Healing Locator Types
 * Defines types for AI-powered element location that adapts to UI changes
 */

import type { LocatorStrategy, LocationResult, LocationAttempt } from '../element-location/types.js';

/**
 * Configuration for the self-healing locator
 */
export interface SelfHealingLocatorConfig {
  /**
   * Whether AI-powered self-healing is enabled
   */
  enabled: boolean;

  /**
   * Maximum number of AI-generated fallback locators to try
   */
  maxAIFallbacks: number;

  /**
   * Timeout for AI analysis requests (milliseconds)
   */
  aiAnalysisTimeout: number;

  /**
   * Confidence threshold for accepting AI-generated locators (0-1)
   */
  confidenceThreshold: number;

  /**
   * Whether to cache successful self-healing results
   */
  enableCaching: boolean;

  /**
   * TTL for cache entries (milliseconds)
   */
  cacheTTL: number;

  /**
   * Whether to include page source in AI analysis
   */
  includePageSource: boolean;

  /**
   * Maximum page source size to send to AI (characters)
   */
  maxPageSourceLength: number;

  /**
   * Whether to learn from successful heal attempts
   */
  enableLearning: boolean;

  /**
   * Maximum learning history size
   */
  maxLearningHistory: number;
}

/**
 * Result from AI analysis of a failed locator
 */
export interface AIAnalysisResult {
  /**
   * Whether the analysis was successful
   */
  success: boolean;

  /**
   * Alternative locators suggested by AI, sorted by confidence
   */
  alternatives: SuggestedLocator[];

  /**
   * Analysis message from the AI
   */
  analysis?: string;

  /**
   * Confidence in the suggestions (0-1)
   */
  confidence: number;

  /**
   * Error if analysis failed
   */
  error?: string;
}

/**
 * A locator suggested by the AI
 */
export interface SuggestedLocator {
  /**
   * The locator strategy
   */
  strategy: LocatorStrategy;

  /**
   * Confidence score for this suggestion (0-1)
   */
  confidence: number;

  /**
   * Reason for this suggestion
   */
  reason: string;

  /**
   * Whether this is a heuristic fallback (not AI-generated)
   */
  isHeuristic?: boolean;
}

/**
 * Self-healing attempt result
 */
export interface SelfHealingResult {
  /**
   * Whether self-healing was successful
   */
  healed: boolean;

  /**
   * The final locator that worked
   */
  finalLocator?: LocatorStrategy;

  /**
   * Number of attempts made
   */
  attempts: number;

  /**
   * Time spent on self-healing (milliseconds)
   */
  duration: number;

  /**
   * AI analysis results
   */
  aiAnalysis?: AIAnalysisResult;

  /**
   * All location attempts during healing
   */
  locationAttempts: LocationAttempt[];

  /**
   * Whether the result was from cache
   */
  fromCache?: boolean;

  /**
   * Error if healing failed
   */
  error?: string;
}

/**
 * Cache entry for successful self-healing
 */
export interface SelfHealingCacheEntry {
  /**
   * Original locator that failed
   */
  originalLocator: string;

  /**
   * Successful locator that healed it
   */
  healedLocator: LocatorStrategy;

  /**
   * Page context hash (for cache invalidation)
   */
  contextHash: string;

  /**
   * Timestamp when this entry was created
   */
  timestamp: number;

  /**
   * Number of times this healing has been used successfully
   */
  useCount: number;

  /**
   * Confidence score (increases with successful uses)
   */
  confidence: number;
}

/**
 * Learning history entry for successful heals
 */
export interface LearningHistoryEntry {
  /**
   * The failed selector
   */
  failedSelector: string;

  /**
   * Page source snippet when it failed
   */
  pageSourceSnippet: string;

  /**
   * The successful selector that worked
   */
  successfulSelector: LocatorStrategy;

  /**
   * Timestamp of the learning event
   */
  timestamp: number;

  /**
   * Number of times this pattern has been seen
   */
  occurrenceCount: number;
}

/**
 * Context for AI analysis
 */
export interface AIAnalysisContext {
  /**
   * The original locator that failed
   */
  originalLocator: LocatorStrategy;

  /**
   * The error message
   */
  errorMessage: string;

  /**
   * Page source (or snippet)
   */
  pageSource: string;

  /**
   * Current page URL
   */
  pageUrl?: string;

  /**
   * Platform (ios, android, web)
   */
  platform: 'ios' | 'android' | 'web';

  /**
   * The action being attempted
   */
  action?: string;

  /**
   * Expected element type (button, input, etc.)
   */
  expectedElementType?: string;

  /**
   * Additional context
   */
  metadata?: Record<string, unknown>;
}

/**
 * Self-healing statistics
 */
export interface SelfHealingStats {
  /**
   * Total number of self-healing attempts
   */
  totalAttempts: number;

  /**
   * Number of successful self-healing attempts
   */
  successfulHeals: number;

  /**
   * Number of failed self-healing attempts
   */
  failedHeals: number;

  /**
   * Success rate (0-1)
   */
  successRate: number;

  /**
   * Number of heals from cache
   */
  cacheHits: number;

  /**
   * Number of AI-generated heals
   */
  aiGeneratedHeals: number;

  /**
   * Number of heuristic heals
   */
  heuristicHeals: number;

  /**
   * Average time for self-healing (milliseconds)
   */
  averageHealTime: number;

  /**
   * Total time spent on self-healing (milliseconds)
   */
  totalHealTime: number;
}

/**
 * Self-healing error types
 */
export enum SelfHealingErrorType {
  /**
   * AI analysis failed
   */
  AI_ANALYSIS_FAILED = 'AI_ANALYSIS_FAILED',

  /**
   * No AI provider available
   */
  NO_AI_PROVIDER = 'NO_AI_PROVIDER',

  /**
   * Confidence threshold not met
   */
  LOW_CONFIDENCE = 'LOW_CONFIDENCE',

  /**
   * Page source not available
   */
  NO_PAGE_SOURCE = 'NO_PAGE_SOURCE',

  /**
   * Timeout during analysis
   */
  TIMEOUT = 'TIMEOUT',

  /**
   * Unknown error
   */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Custom error class for self-healing failures
 */
export class SelfHealingLocatorError extends Error {
  constructor(
    public type: SelfHealingErrorType,
    message: string,
    public originalLocator?: LocatorStrategy,
    public cause?: Error
  ) {
    super(
      `[SelfHealingLocator] ${type}: ${message}${originalLocator ? ` (locator: ${originalLocator.type}="${originalLocator.value}")` : ''}`
    );
    this.name = 'SelfHealingLocatorError';
  }
}
