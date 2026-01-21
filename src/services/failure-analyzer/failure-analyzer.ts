/**
 * Failure Analyzer Service
 * Uses LLMs to analyze test failures and provide root cause hypotheses
 */

import type {
  FailureContext,
  FailureAnalysis,
  AnalysisOptions,
  BatchAnalysisInput,
  BatchAnalysisResult,
} from './types.js';
import type {
  ChatMessage,
  CompletionOptions,
  CompletionResponse,
} from '../../llm/types.js';
import type { BaseLLMProvider } from '../../llm/providers/base.js';
import {
  FailureAnalyzerError,
  FailureAnalyzerErrorType,
  FailureCategory,
  FailureSeverity,
  FlakinessConfidence,
} from './types.js';
import {
  buildFailureAnalysisPrompt,
  FAILURE_ANALYSIS_SYSTEM_PROMPT,
  FAILURE_ANALYSIS_JSON_SCHEMA,
  FAILURE_ANALYSIS_EXAMPLES,
} from './templates.js';
import { createModuleLogger } from '../../utils/logger.js';
import type { Logger } from '../../utils/logger.js';
import { randomUUID } from 'node:crypto';

/**
 * Default analysis options
 */
const DEFAULT_OPTIONS: Required<AnalysisOptions> = {
  analyzeScreenshots: true,
  deepLogAnalysis: true,
  checkHistory: true,
  maxFixSuggestions: 5,
  customInstructions: '',
  model: '',
  maxTokens: 3000,
  timeout: 60000,
};

/**
 * Response schema from LLM
 */
interface LLMAnalysisResponse {
  category: string;
  severity: string;
  summary: string;
  rootCause: {
    primaryCause: string;
    confidence: number;
    alternativeCauses: string[];
    evidence: string[];
    relatedLocations: Array<{
      path: string;
      line?: number;
      description: string;
    }>;
  };
  flakiness: {
    isFlaky: boolean;
    confidence: string;
    indicators: string[];
    stabilizers: string[];
  };
  suggestedFixes: Array<{
    type: string;
    description: string;
    snippet?: string;
    filePath?: string;
    priority: number;
    effort: number;
  }>;
  notes: string[];
}

/**
 * Failure Analyzer class
 */
export class FailureAnalyzer {
  private readonly logger: Logger;
  private readonly llmProvider: BaseLLMProvider;
  private readonly cache: Map<string, FailureAnalysis> = new Map();
  private readonly cacheMaxSize = 1000;
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor(llmProvider: BaseLLMProvider) {
    this.llmProvider = llmProvider;
    this.logger = createModuleLogger('services:failure-analyzer');
  }

  /**
   * Analyze a single test failure
   */
  async analyze(
    context: FailureContext,
    options: AnalysisOptions = {}
  ): Promise<FailureAnalysis> {
    const startTime = Date.now();
    const analysisId = randomUUID();

    try {
      // Validate input first
      this.validateContext(context);

      // Check cache after validation
      const cacheKey = this.getCacheKey(context);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.cacheHits++;
        this.logger.debug('Cache hit for failure analysis', { testName: context.testName });
        return { ...cached, id: analysisId };
      }
      this.cacheMisses++;

      // Merge options with defaults
      const opts = this.mergeOptions(options);

      // Build the prompt
      const prompt = this.buildPromptWithContext(context, opts);

      // Create LLM completion
      const completion = await this.createCompletion(prompt, opts);

      // Parse the analysis response
      const analysis = this.parseAnalysisResponse(
        completion.content,
        context,
        analysisId,
        Date.now() - startTime
      );

      // Cache the result
      this.addToCache(cacheKey, analysis);

      this.logger.info('Successfully analyzed test failure', {
        testName: context.testName,
        category: analysis.category,
        severity: analysis.severity,
        isFlaky: analysis.flakiness.isFlaky,
        processingTimeMs: analysis.processingTimeMs,
      });

      return analysis;
    } catch (error) {
      if (error instanceof FailureAnalyzerError) {
        throw error;
      }

      this.logger.error('Failed to analyze test failure', {
        error: error instanceof Error ? error.message : String(error),
        testName: context.testName,
      });

      throw new FailureAnalyzerError(
        FailureAnalyzerErrorType.ANALYSIS_FAILED,
        `Failed to analyze failure for test: ${context.testName}`,
        error
      );
    }
  }

  /**
   * Analyze multiple failures in batch
   */
  async analyzeBatch(input: BatchAnalysisInput): Promise<BatchAnalysisResult> {
    const startTime = Date.now();

    this.logger.info('Starting batch failure analysis', {
      count: input.failures.length,
    });

    const results = await Promise.all(
      input.failures.map((failure) =>
        this.analyze(failure, input.options).catch((error) => {
          this.logger.warn('Failed to analyze individual failure', {
            testName: failure.testName,
            error: error instanceof Error ? error.message : String(error),
          });

          // Return a minimal analysis result on error
          return this.createFallbackAnalysis(failure, randomUUID(), 0);
        })
      )
    );

    const totalProcessingTimeMs = Date.now() - startTime;

    // Calculate summary statistics
    const summary = this.calculateSummary(results, totalProcessingTimeMs);

    this.logger.info('Batch failure analysis completed', summary);

    return { results, summary };
  }

  /**
   * Quick analysis for common failure patterns without LLM
   */
  quickAnalyze(context: FailureContext): {
    category: FailureCategory;
    severity: FailureSeverity;
    isFlaky: boolean;
    summary: string;
  } {
    const error = context.errorMessage.toLowerCase();
    const stack = context.stackTrace?.toLowerCase() || '';

    // Pattern matching for common failures
    if (error.includes('timeout') || error.includes('timed out')) {
      return {
        category: FailureCategory.TIMEOUT,
        severity: FailureSeverity.MEDIUM,
        isFlaky: true,
        summary: 'Timeout error - likely flaky due to timing dependencies',
      };
    }

    if (error.includes('not found') || stack.includes('locator') || error.includes('unable to locate')) {
      return {
        category: FailureCategory.ELEMENT_NOT_FOUND,
        severity: FailureSeverity.HIGH,
        isFlaky: false,
        summary: 'Element not found - check selector or page state',
      };
    }

    if (error.includes('assertion') || error.includes('expected')) {
      return {
        category: FailureCategory.ASSERTION,
        severity: FailureSeverity.MEDIUM,
        isFlaky: context.history ? context.history.failCount > 0 && context.history.passCount > 0 : false,
        summary: 'Assertion failed - verify expected behavior',
      };
    }

    if (error.includes('network') || error.includes('fetch') || error.includes('econnrefused')) {
      return {
        category: FailureCategory.NETWORK,
        severity: FailureSeverity.HIGH,
        isFlaky: true,
        summary: 'Network error - may be flaky depending on network stability',
      };
    }

    if (error.includes('crash') || error.includes('segmentation fault') || error.includes('exception')) {
      return {
        category: FailureCategory.CRASH,
        severity: FailureSeverity.CRITICAL,
        isFlaky: false,
        summary: 'Application crash - critical issue requiring immediate attention',
      };
    }

    if (error.includes('undefined') || error.includes('cannot read') || error.includes('null')) {
      return {
        category: FailureCategory.DATA,
        severity: FailureSeverity.HIGH,
        isFlaky: false,
        summary: 'Data access error - null/undefined value encountered',
      };
    }

    if (error.includes('setup') || error.includes('before each') || error.includes('before all')) {
      return {
        category: FailureCategory.SETUP,
        severity: FailureSeverity.HIGH,
        isFlaky: false,
        summary: 'Test setup failure - check test initialization',
      };
    }

    // Check history for flakiness indicator
    const hasMixedResults =
      context.history && context.history.passCount > 0 && context.history.failCount > 0;
    const passRate = context.history
      ? context.history.passCount / context.history.runCount
      : 1;

    return {
      category: FailureCategory.UNKNOWN,
      severity: passRate < 0.5 ? FailureSeverity.HIGH : FailureSeverity.MEDIUM,
      isFlaky: hasMixedResults ?? false,
      summary: 'Unknown failure pattern - requires deeper analysis',
    };
  }

  /**
   * Validate failure context
   */
  private validateContext(context: FailureContext): void {
    if (!context.testName) {
      throw new FailureAnalyzerError(
        FailureAnalyzerErrorType.INVALID_INPUT,
        'Test name is required'
      );
    }

    if (!context.errorMessage) {
      throw new FailureAnalyzerError(
        FailureAnalyzerErrorType.INVALID_INPUT,
        'Error message is required'
      );
    }
  }

  /**
   * Merge user options with defaults
   */
  private mergeOptions(options: AnalysisOptions): Required<AnalysisOptions> {
    return {
      analyzeScreenshots: options.analyzeScreenshots ?? DEFAULT_OPTIONS.analyzeScreenshots,
      deepLogAnalysis: options.deepLogAnalysis ?? DEFAULT_OPTIONS.deepLogAnalysis,
      checkHistory: options.checkHistory ?? DEFAULT_OPTIONS.checkHistory,
      maxFixSuggestions: options.maxFixSuggestions ?? DEFAULT_OPTIONS.maxFixSuggestions,
      customInstructions: options.customInstructions || DEFAULT_OPTIONS.customInstructions,
      model: options.model || DEFAULT_OPTIONS.model,
      maxTokens: options.maxTokens ?? DEFAULT_OPTIONS.maxTokens,
      timeout: options.timeout ?? DEFAULT_OPTIONS.timeout,
    };
  }

  /**
   * Build the full prompt with context
   */
  private buildPromptWithContext(
    context: FailureContext,
    options: Required<AnalysisOptions>
  ): string {
    let prompt = buildFailureAnalysisPrompt(context, options);

    // Add few-shot examples
    prompt += `\n## Example Analyses\n\n`;
    for (const example of FAILURE_ANALYSIS_EXAMPLES.slice(0, 2)) {
      prompt += `### Example\n`;
      prompt += `**Input:**\n\`\`\`json\n${JSON.stringify(example.input, null, 2)}\n\`\`\`\n\n`;
      prompt += `**Analysis:**\n\`\`\`json\n${JSON.stringify(example.output, null, 2)}\n\`\`\`\n\n`;
    }

    prompt += FAILURE_ANALYSIS_JSON_SCHEMA;

    return prompt;
  }

  /**
   * Create LLM completion
   */
  private async createCompletion(
    prompt: string,
    options: Required<AnalysisOptions>
  ): Promise<CompletionResponse> {
    const messages: ChatMessage[] = [
      { role: 'system', content: FAILURE_ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];

    const completionOptions: CompletionOptions = {
      maxTokens: options.maxTokens,
      temperature: 0.3, // Lower temperature for more consistent analysis
      timeout: options.timeout,
    };

    if (options.model) {
      // If custom model is specified, we'd need to handle provider selection
      // For now, just log it
      this.logger.debug('Using custom model', { model: options.model });
    }

    try {
      return await this.llmProvider.createCompletion(messages, completionOptions);
    } catch (error) {
      this.logger.error('LLM completion failed', { error });
      throw new FailureAnalyzerError(
        FailureAnalyzerErrorType.LLM_ERROR,
        'Failed to get completion from LLM',
        error
      );
    }
  }

  /**
   * Parse the LLM response into a FailureAnalysis
   */
  private parseAnalysisResponse(
    content: string,
    context: FailureContext,
    analysisId: string,
    processingTimeMs: number
  ): FailureAnalysis {
    try {
      // Extract JSON from the response
      const jsonMatch =
        content.match(/```(?:json)?\s*([\s\S]*?)\s*```/) ||
        content.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        this.logger.warn('No JSON found in LLM response, using fallback analysis');
        return this.createFallbackAnalysis(context, analysisId, processingTimeMs);
      }

      const jsonString = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonString) as LLMAnalysisResponse;

      // Map and validate the response
      return {
        id: analysisId,
        context,
        category: this.parseCategory(parsed.category),
        severity: this.parseSeverity(parsed.severity),
        rootCause: {
          primaryCause: parsed.rootCause.primaryCause,
          confidence: Math.min(1, Math.max(0, parsed.rootCause.confidence)),
          alternativeCauses: parsed.rootCause.alternativeCauses || [],
          evidence: parsed.rootCause.evidence || [],
          relatedLocations: parsed.rootCause.relatedLocations || [],
        },
        flakiness: {
          isFlaky: parsed.flakiness.isFlaky,
          confidence: this.parseFlakinessConfidence(parsed.flakiness.confidence),
          indicators: parsed.flakiness.indicators || [],
          stabilizers: parsed.flakiness.stabilizers || [],
        },
        suggestedFixes: (parsed.suggestedFixes || []).map((fix) => ({
          type: fix.type as any,
          description: fix.description,
          snippet: fix.snippet,
          filePath: fix.filePath,
          priority: Math.min(10, Math.max(1, fix.priority)),
          effort: Math.min(5, Math.max(1, fix.effort)) as 1 | 2 | 3 | 4 | 5,
        })),
        summary: parsed.summary,
        notes: parsed.notes || [],
        analyzedAt: new Date(),
        processingTimeMs,
        tokensUsed: undefined, // Would be populated from completion response
      };
    } catch (error) {
      this.logger.warn('Failed to parse LLM response, using fallback analysis', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.createFallbackAnalysis(context, analysisId, processingTimeMs);
    }
  }

  /**
   * Parse category string to enum
   */
  private parseCategory(value: string): FailureCategory {
    const upper = value.toUpperCase().replace(/[\s-]/g, '_');
    if (Object.values(FailureCategory).includes(upper as FailureCategory)) {
      return upper as FailureCategory;
    }
    return FailureCategory.UNKNOWN;
  }

  /**
   * Parse severity string to enum
   */
  private parseSeverity(value: string): FailureSeverity {
    const upper = value.toUpperCase();
    if (Object.values(FailureSeverity).includes(upper as FailureSeverity)) {
      return upper as FailureSeverity;
    }
    return FailureSeverity.MEDIUM;
  }

  /**
   * Parse flakiness confidence string to enum
   */
  private parseFlakinessConfidence(value: string): FlakinessConfidence {
    const upper = value.toUpperCase().replace(/[\s-]/g, '_');
    if (Object.values(FlakinessConfidence).includes(upper as FlakinessConfidence)) {
      return upper as FlakinessConfidence;
    }
    return FlakinessConfidence.LOW;
  }

  /**
   * Create a fallback analysis when LLM fails
   */
  private createFallbackAnalysis(
    context: FailureContext,
    analysisId: string,
    processingTimeMs: number
  ): FailureAnalysis {
    const quick = this.quickAnalyze(context);

    return {
      id: analysisId,
      context,
      category: quick.category,
      severity: quick.severity,
      rootCause: {
        primaryCause: 'Based on error message pattern matching',
        confidence: 0.6,
        alternativeCauses: [],
        evidence: [context.errorMessage],
        relatedLocations: context.testFile
          ? [{ path: context.testFile, description: 'Test file' }]
          : [],
      },
      flakiness: {
        isFlaky: quick.isFlaky,
        confidence: quick.isFlaky ? FlakinessConfidence.MEDIUM : FlakinessConfidence.NOT_FLAKY,
        indicators: quick.isFlaky
          ? ['Intermittent failure detected', 'Error pattern suggests timing dependency']
          : ['Consistent failure pattern'],
        stabilizers: quick.isFlaky
          ? ['Add explicit waits', 'Increase timeout', 'Check for race conditions']
          : [],
      },
      suggestedFixes: [
        {
          type: 'investigation',
          description: 'Review error message and stack trace for specific details',
          priority: 10,
          effort: 2,
        },
      ],
      summary: quick.summary,
      notes: [
        'Fallback analysis - LLM analysis unavailable',
        'Review error details for more specific insights',
      ],
      analyzedAt: new Date(),
      processingTimeMs,
    };
  }

  /**
   * Calculate summary statistics for batch analysis
   */
  private calculateSummary(
    results: FailureAnalysis[],
    totalProcessingTimeMs: number
  ): BatchAnalysisResult['summary'] {
    const byCategory = Object.fromEntries(
      Object.values(FailureCategory).map((c) => [c, 0])
    ) as Record<FailureCategory, number>;

    const bySeverity = Object.fromEntries(
      Object.values(FailureSeverity).map((s) => [s, 0])
    ) as Record<FailureSeverity, number>;

    let flakyCount = 0;

    for (const result of results) {
      byCategory[result.category]++;
      bySeverity[result.severity]++;
      if (result.flakiness.isFlaky) {
        flakyCount++;
      }
    }

    return {
      total: results.length,
      byCategory,
      bySeverity,
      flakyCount,
      totalProcessingTimeMs,
    };
  }

  /**
   * Generate cache key from context
   */
  private getCacheKey(context: FailureContext): string {
    // Create a hash from the error message and test name
    const key = `${context.testName}:${context.errorMessage.substring(0, 200)}`;
    return key;
  }

  /**
   * Add analysis to cache
   */
  private addToCache(key: string, analysis: FailureAnalysis): void {
    // Implement LRU eviction if cache is too large
    if (this.cache.size >= this.cacheMaxSize) {
      const firstKey = this.cache.keys().next().value as string | undefined;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, analysis);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { hits: number; misses: number; size: number; hitRate: number } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      size: this.cache.size,
      hitRate: total > 0 ? this.cacheHits / total : 0,
    };
  }

  /**
   * Clear the analysis cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.logger.debug('Analysis cache cleared');
  }

  /**
   * Health check for the analyzer
   */
  async healthCheck(): Promise<{ healthy: boolean; error?: string; cacheStats?: { hits: number; misses: number; size: number; hitRate: number } }> {
    try {
      await this.llmProvider.healthCheck();
      return {
        healthy: true,
        cacheStats: this.getCacheStats(),
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
        cacheStats: this.getCacheStats(),
      };
    }
  }
}

/**
 * Singleton instance management
 */
let analyzerInstance: FailureAnalyzer | undefined;

/**
 * Get or create the analyzer instance
 */
export function getFailureAnalyzer(llmProvider: BaseLLMProvider): FailureAnalyzer {
  if (!analyzerInstance) {
    analyzerInstance = new FailureAnalyzer(llmProvider);
  }
  return analyzerInstance;
}

/**
 * Reset the analyzer instance (useful for testing)
 */
export function resetFailureAnalyzer(): void {
  analyzerInstance = undefined;
}
