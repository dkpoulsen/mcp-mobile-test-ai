/**
 * Self-Healing Locator Service
 * AI-powered element location that adapts to UI changes
 */

import type {
  SelfHealingLocatorConfig,
  AIAnalysisResult,
  SelfHealingResult,
  SelfHealingCacheEntry,
  LearningHistoryEntry,
  SelfHealingStats,
  AIAnalysisContext,
  SuggestedLocator,
} from './types.js';
import {
  SelfHealingLocatorError,
  SelfHealingErrorType,
} from './types.js';
import { createWebLocatorAnalysisPrompt, createMobileLocatorAnalysisPrompt, generateHeuristicLocators } from './prompts.js';
import type { LocatorStrategy, LocationDriver } from '../element-location/types.js';
import { createModuleLogger } from '../../utils/logger.js';
import { createProvider, type BaseLLMProvider } from '../../llm/index.js';
import type { ChatMessage } from '../../llm/types.js';
import * as crypto from 'crypto';

const logger = createModuleLogger('self-healing-locator');

/**
 * Default configuration for self-healing locator
 */
const DEFAULT_CONFIG: Required<SelfHealingLocatorConfig> = {
  enabled: true,
  maxAIFallbacks: 3,
  aiAnalysisTimeout: 15000,
  confidenceThreshold: 0.5,
  enableCaching: true,
  cacheTTL: 3600000, // 1 hour
  includePageSource: true,
  maxPageSourceLength: 20000,
  enableLearning: true,
  maxLearningHistory: 1000,
};

/**
 * Self-Healing Locator class
 * Uses AI to analyze failed locators and suggest alternatives
 */
export class SelfHealingLocator {
  private config: Required<SelfHealingLocatorConfig>;
  private driver: LocationDriver;
  private llmProvider?: BaseLLMProvider;
  private cache: Map<string, SelfHealingCacheEntry>;
  private learningHistory: LearningHistoryEntry[];
  private stats: SelfHealingStats;

  constructor(driver: LocationDriver, llmProvider?: BaseLLMProvider, config?: Partial<SelfHealingLocatorConfig>) {
    this.driver = driver;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.llmProvider = llmProvider;
    this.cache = new Map();
    this.learningHistory = [];
    this.stats = {
      totalAttempts: 0,
      successfulHeals: 0,
      failedHeals: 0,
      successRate: 0,
      cacheHits: 0,
      aiGeneratedHeals: 0,
      heuristicHeals: 0,
      averageHealTime: 0,
      totalHealTime: 0,
    };

    logger.info('Self-Healing Locator initialized', {
      enabled: this.config.enabled,
      aiAvailable: !!this.llmProvider,
      caching: this.config.enableCaching,
      learning: this.config.enableLearning,
    });
  }

  /**
   * Attempt to heal a failed locator using AI analysis
   */
  async healLocator(
    failedLocator: LocatorStrategy,
    errorMessage: string,
    options?: {
      pageSource?: string;
      pageUrl?: string;
      action?: string;
      expectedElementType?: string;
      timeout?: number;
    }
  ): Promise<SelfHealingResult> {
    const startTime = Date.now();
    this.stats.totalAttempts++;

    logger.debug('Starting self-healing attempt', {
      locatorType: failedLocator.type,
      locatorValue: failedLocator.value,
      error: errorMessage,
    });

    // Check cache first
    if (this.config.enableCaching) {
      const cachedResult = this.checkCache(failedLocator, options?.pageSource);
      if (cachedResult) {
        this.stats.cacheHits++;
        this.stats.successfulHeals++;
        this.updateSuccessRate();

        return {
          healed: true,
          finalLocator: cachedResult.healedLocator,
          attempts: 1,
          duration: Date.now() - startTime,
          locationAttempts: [],
          fromCache: true,
        };
      }
    }

    // Get page source if not provided
    let pageSource = options?.pageSource;
    if (this.config.includePageSource && !pageSource) {
      try {
        // The driver doesn't have getPageSource, so we'll use a placeholder
        // In real implementation, this would be passed in
        pageSource = '';
        logger.warn('Page source not provided for AI analysis');
      } catch (error) {
        logger.warn('Failed to get page source', { error });
      }
    }

    // Truncate page source if needed
    if (pageSource && pageSource.length > this.config.maxPageSourceLength) {
      pageSource = pageSource.substring(0, this.config.maxPageSourceLength);
    }

    // Get platform
    const platform = await this.getPlatform();

    // Perform AI analysis if available
    let aiAnalysis: AIAnalysisResult | undefined;
    let alternatives: SuggestedLocator[] = [];

    if (this.llmProvider && this.config.enabled) {
      try {
        aiAnalysis = await this.performAIAnalysis({
          originalLocator: failedLocator,
          errorMessage,
          pageSource: pageSource || '',
          pageUrl: options?.pageUrl,
          platform,
          action: options?.action,
          expectedElementType: options?.expectedElementType,
        });
        alternatives = aiAnalysis.alternatives;
      } catch (error) {
        logger.warn('AI analysis failed, falling back to heuristics', {
          error: error instanceof Error ? error.message : String(error),
        });
        aiAnalysis = {
          success: false,
          alternatives: [],
          confidence: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    // Add heuristic alternatives if AI failed or as supplement
    if (alternatives.length === 0 || this.config.maxAIFallbacks > alternatives.length) {
      const heuristicAlternatives = generateHeuristicLocators(
        { type: failedLocator.type, value: failedLocator.value },
        pageSource || ''
      );
      alternatives = [
        ...alternatives,
        ...heuristicAlternatives.map(h => ({
          strategy: { type: h.type, value: h.value, priority: 10 },
          confidence: h.confidence,
          reason: h.reason,
          isHeuristic: true,
        })),
      ];
    }

    // Filter by confidence threshold and limit
    alternatives = alternatives
      .filter(a => a.confidence >= this.config.confidenceThreshold)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.config.maxAIFallbacks);

    if (alternatives.length === 0) {
      this.stats.failedHeals++;
      this.updateSuccessRate();
      this.updateHealTime(startTime);

      return {
        healed: false,
        attempts: 0,
        duration: Date.now() - startTime,
        aiAnalysis,
        locationAttempts: [],
        error: 'No viable alternative locators found',
      };
    }

    // Try each alternative
    const locationAttempts: Array<{
      strategy: LocatorStrategy;
      success: boolean;
      error?: string;
      duration: number;
    }> = [];
    let healedLocator: LocatorStrategy | undefined;

    for (const alternative of alternatives) {
      const attemptStart = Date.now();
      try {
        // Try to find element with this locator
        const element = await this.findElementWithStrategy(alternative.strategy);

        locationAttempts.push({
          strategy: alternative.strategy,
          success: !!element,
          duration: Date.now() - attemptStart,
        });

        if (element) {
          healedLocator = alternative.strategy;
          this.stats.successfulHeals++;

          if (alternative.isHeuristic) {
            this.stats.heuristicHeals++;
          } else {
            this.stats.aiGeneratedHeals++;
          }

          // Cache the successful heal
          if (this.config.enableCaching && pageSource) {
            this.cacheHeal(failedLocator, healedLocator, pageSource);
          }

          // Learn from the successful heal
          if (this.config.enableLearning) {
            this.learnFromHeal(failedLocator, errorMessage, healedLocator, pageSource || '');
          }

          break;
        }
      } catch (error) {
        locationAttempts.push({
          strategy: alternative.strategy,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - attemptStart,
        });
      }
    }

    // Check if healing was successful
    const duration = Date.now() - startTime;
    this.updateHealTime(startTime);
    this.updateSuccessRate();

    if (!healedLocator) {
      this.stats.failedHeals++;
      return {
        healed: false,
        attempts: alternatives.length,
        duration,
        aiAnalysis,
        locationAttempts,
        error: 'All alternative locators failed',
      };
    }

    return {
      healed: true,
      finalLocator: healedLocator,
      attempts: locationAttempts.length,
      duration,
      aiAnalysis,
      locationAttempts,
    };
  }

  /**
   * Perform AI analysis of the failed locator
   */
  private async performAIAnalysis(context: AIAnalysisContext): Promise<AIAnalysisResult> {
    if (!this.llmProvider) {
      throw new SelfHealingLocatorError(
        SelfHealingErrorType.NO_AI_PROVIDER,
        'No LLM provider available for AI analysis'
      );
    }

    const platform = context.platform;
    const isWeb = platform === 'web';

    const userPrompt = isWeb
      ? createWebLocatorAnalysisPrompt({
          originalLocator: { type: context.originalLocator.type, value: context.originalLocator.value },
          errorMessage: context.errorMessage,
          pageSource: context.pageSource,
          pageUrl: context.pageUrl,
          action: context.action,
          expectedElementType: context.expectedElementType,
        })
      : createMobileLocatorAnalysisPrompt({
          originalLocator: { type: context.originalLocator.type, value: context.originalLocator.value },
          errorMessage: context.errorMessage,
          pageSource: context.pageSource,
          platform,
          action: context.action,
          expectedElementType: context.expectedElementType,
        });

    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are an expert test automation engineer specializing in UI element location strategies.' },
      { role: 'user', content: userPrompt },
    ];

    try {
      const response = await Promise.race([
        this.llmProvider.createCompletion(messages, {
          maxTokens: 1000,
          temperature: 0.3,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('AI analysis timeout')), this.config.aiAnalysisTimeout)
        ),
      ]);

      // Parse the JSON response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        success: true,
        alternatives: (parsed.alternatives || []).map((alt: any) => ({
          strategy: {
            type: alt.type,
            value: alt.value,
            priority: 10,
          },
          confidence: alt.confidence || 0.5,
          reason: alt.reason || '',
        })),
        analysis: parsed.analysis,
        confidence: parsed.confidence || 0.7,
      };
    } catch (error) {
      logger.error('AI analysis failed', { error });
      throw new SelfHealingLocatorError(
        SelfHealingErrorType.AI_ANALYSIS_FAILED,
        'Failed to get AI analysis',
        context.originalLocator,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Try to find an element using a specific strategy
   */
  private async findElementWithStrategy(strategy: LocatorStrategy): Promise<boolean> {
    try {
      switch (strategy.type.toLowerCase()) {
        case 'id':
          return (await this.driver.findById(strategy.value)) !== null;
        case 'xpath':
          return (await this.driver.findByXPath(strategy.value)) !== null;
        case 'css_selector':
          return (await this.driver.findByCssSelector(strategy.value)) !== null;
        case 'text':
          return (await this.driver.findByText(strategy.value)) !== null;
        case 'accessibility_id':
          return (await this.driver.findByAccessibilityId(strategy.value)) !== null;
        case 'class_name':
          return (await this.driver.findByClassName(strategy.value)) !== null;
        case 'name':
          return (await this.driver.findByName(strategy.value)) !== null;
        case 'tag_name':
          return (await this.driver.findByTagName(strategy.value)) !== null;
        default:
          logger.warn('Unsupported locator type in self-healing', { type: strategy.type });
          return false;
      }
    } catch (error) {
      logger.debug('Element lookup failed during healing', {
        strategy,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get the current platform
   */
  private async getPlatform(): Promise<'ios' | 'android' | 'web'> {
    try {
      return await this.driver.getPlatform();
    } catch {
      return 'web'; // Default to web
    }
  }

  /**
   * Check cache for a previous successful heal
   */
  private checkCache(failedLocator: LocatorStrategy, pageSource?: string): SelfHealingCacheEntry | undefined {
    const cacheKey = this.getCacheKey(failedLocator, pageSource);

    const cacheEntries = Array.from(this.cache.entries());
    for (const [key, entry] of cacheEntries) {
      if (key === cacheKey) {
        // Check if entry is still valid
        const age = Date.now() - entry.timestamp;
        if (age <= this.config.cacheTTL) {
          logger.debug('Cache hit for self-healing', { cacheKey, age });
          return entry;
        } else {
          // Remove expired entry
          this.cache.delete(key);
        }
      }
    }

    return undefined;
  }

  /**
   * Generate a cache key for a locator
   */
  private getCacheKey(locator: LocatorStrategy, pageSource?: string): string {
    const contextHash = pageSource
      ? crypto.createHash('md5').update(pageSource.substring(0, 1000)).digest('hex')
      : 'no-context';

    return `${locator.type}:${locator.value}:${contextHash}`;
  }

  /**
   * Cache a successful heal
   */
  private cacheHeal(
    originalLocator: LocatorStrategy,
    healedLocator: LocatorStrategy,
    pageSource: string
  ): void {
    const cacheKey = this.getCacheKey(originalLocator, pageSource);
    const contextHash = crypto.createHash('md5').update(pageSource.substring(0, 1000)).digest('hex');

    const entry: SelfHealingCacheEntry = {
      originalLocator: `${originalLocator.type}:${originalLocator.value}`,
      healedLocator,
      contextHash,
      timestamp: Date.now(),
      useCount: 0,
      confidence: 0.5,
    };

    this.cache.set(cacheKey, entry);
    logger.debug('Cached successful heal', { cacheKey });
  }

  /**
   * Learn from a successful heal
   */
  private learnFromHeal(
    failedLocator: LocatorStrategy,
    errorMessage: string,
    successfulLocator: LocatorStrategy,
    pageSource: string
  ): void {
    const snippet = pageSource.substring(0, 500);

    // Check if we've seen this pattern before
    const existingEntry = this.learningHistory.find(
      entry =>
        entry.failedSelector === `${failedLocator.type}:${failedLocator.value}` &&
        entry.successfulSelector.type === successfulLocator.type &&
        entry.successfulSelector.value === successfulLocator.value
    );

    if (existingEntry) {
      existingEntry.occurrenceCount++;
      existingEntry.timestamp = Date.now();
    } else {
      // Add new learning entry
      const newEntry: LearningHistoryEntry = {
        failedSelector: `${failedLocator.type}:${failedLocator.value}`,
        pageSourceSnippet: snippet,
        successfulSelector: successfulLocator,
        timestamp: Date.now(),
        occurrenceCount: 1,
      };

      this.learningHistory.push(newEntry);

      // Trim history if too large
      if (this.learningHistory.length > this.config.maxLearningHistory) {
        this.learningHistory.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
        this.learningHistory = this.learningHistory.slice(0, this.config.maxLearningHistory);
      }
    }

    logger.debug('Learned from successful heal', {
      from: `${failedLocator.type}:${failedLocator.value}`,
      to: `${successfulLocator.type}:${successfulLocator.value}`,
    });
  }

  /**
   * Update success rate statistics
   */
  private updateSuccessRate(): void {
    if (this.stats.totalAttempts > 0) {
      this.stats.successRate = this.stats.successfulHeals / this.stats.totalAttempts;
    }
  }

  /**
   * Update heal time statistics
   */
  private updateHealTime(startTime: number): void {
    const duration = Date.now() - startTime;
    this.stats.totalHealTime += duration;
    this.stats.averageHealTime = this.stats.totalHealTime / this.stats.totalAttempts;
  }

  /**
   * Get current statistics
   */
  getStats(): Readonly<SelfHealingStats> {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalAttempts: 0,
      successfulHeals: 0,
      failedHeals: 0,
      successRate: 0,
      cacheHits: 0,
      aiGeneratedHeals: 0,
      heuristicHeals: 0,
      averageHealTime: 0,
      totalHealTime: 0,
    };
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('Self-healing cache cleared');
  }

  /**
   * Get learning history
   */
  getLearningHistory(): Readonly<LearningHistoryEntry[]> {
    return [...this.learningHistory];
  }

  /**
   * Clear learning history
   */
  clearLearningHistory(): void {
    this.learningHistory = [];
    logger.debug('Learning history cleared');
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SelfHealingLocatorConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Self-healing config updated', { config });
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<Required<SelfHealingLocatorConfig>> {
    return { ...this.config };
  }
}

/**
 * Create a self-healing locator instance
 */
export function createSelfHealingLocator(
  driver: LocationDriver,
  llmProvider?: BaseLLMProvider,
  config?: Partial<SelfHealingLocatorConfig>
): SelfHealingLocator {
  return new SelfHealingLocator(driver, llmProvider, config);
}

/**
 * Create a self-healing locator with automatic LLM provider creation
 */
export async function createSelfHealingLocatorWithLLM(
  driver: LocationDriver,
  config?: Partial<SelfHealingLocatorConfig> & { llmProviderName?: string }
): Promise<SelfHealingLocator> {
  let llmProvider: BaseLLMProvider | undefined;

  try {
    llmProvider = createProvider(config?.llmProviderName);
    logger.info('LLM provider created for self-healing');
  } catch (error) {
    logger.warn('Failed to create LLM provider, self-healing will use heuristics only', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const { llmProviderName, ...locatorConfig } = config || {};
  return new SelfHealingLocator(driver, llmProvider, locatorConfig);
}
