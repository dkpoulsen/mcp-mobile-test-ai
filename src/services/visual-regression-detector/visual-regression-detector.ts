/**
 * Visual Regression Detector Service
 *
 * Uses computer vision (pixelmatch) and LLMs to compare screenshots against baselines.
 * Detects visual differences, classifies severity, and ignores dynamic content areas.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import * as sharp from 'sharp';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { createModuleLogger } from '../../utils/logger.js';
import type {
  VisualBaseline,
  VisualBaselineMetadata,
} from '../visual-baseline/types.js';
import type {
  VisualRegressionOptions,
  VisualRegressionResult,
  VisualRegressionDetectorConfig,
  PixelComparisonResult,
  LLMAnalysisResult,
  VisualDifference,
  IgnoreRegion,
} from './types.js';
import {
  VisualRegressionError,
  VisualRegressionErrorType,
  DifferenceSeverity,
} from './types.js';
import type { BaseLLMProvider } from '../../llm/providers/base.js';
import type { CompletionOptions } from '../../llm/types.js';

const logger = createModuleLogger('visual-regression-detector');

/**
 * Default configuration
 */
const DEFAULT_CONFIG: VisualRegressionDetectorConfig = {
  defaultMaxDiffRatio: 0.01, // 1% of pixels can differ
  defaultPixelThreshold: 10, // Pixel difference threshold
  enableLLMAnalysis: true,
  llmProvider: 'anthropic',
  llmModel: 'claude-3-5-sonnet-20241022',
  defaultLLMTimeout: 30000,
  diffOutputDir: 'visual-diffs',
  enableCache: true,
  maxCacheSize: 100,
};

/**
 * LLM Analysis Response Schema
 */
interface LLMDiffAnalysisResponse {
  severity: string;
  summary: string;
  differences: Array<{
    description: string;
    severity: string;
    type: string;
    boundingBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
  isAcceptable: boolean;
  reasoning?: string;
}

/**
 * Visual Regression Detector class
 */
export class VisualRegressionDetector {
  private config: VisualRegressionDetectorConfig;
  private llmProvider: BaseLLMProvider | null = null;
  private cache: Map<string, VisualRegressionResult> = new Map();

  constructor(
    llmProvider: BaseLLMProvider | null,
    config?: Partial<VisualRegressionDetectorConfig>
  ) {
    this.llmProvider = llmProvider;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ensureDiffOutputDirectory();
  }

  /**
   * Ensure diff output directory exists
   */
  private ensureDiffOutputDirectory(): void {
    if (!existsSync(this.config.diffOutputDir)) {
      mkdirSync(this.config.diffOutputDir, { recursive: true });
    }
  }

  /**
   * Compare a screenshot against a baseline
   */
  async compareAgainstBaseline(
    currentImagePath: string,
    baseline: VisualBaseline,
    options: VisualRegressionOptions = {}
  ): Promise<VisualRegressionResult> {
    const startTime = Date.now();
    const resultId = randomUUID();

    logger.debug(
      {
        resultId,
        currentImagePath,
        baselinePath: baseline.imagePath,
        screenName: baseline.screenName,
      },
      'Starting visual regression comparison'
    );

    try {
      // Check cache if enabled
      const cacheKey = this.getCacheKey(currentImagePath, baseline, options);
      if (this.config.enableCache && this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey)!;
        logger.debug('Using cached comparison result', { resultId });
        return { ...cached, id: resultId };
      }

      // Validate images exist
      this.validateImageExists(currentImagePath);
      this.validateImageExists(baseline.imagePath);

      // Load images
      const currentImage = await this.loadImage(currentImagePath);
      const baselineImage = await this.loadImage(baseline.imagePath);

      // Check dimensions match
      if (
        currentImage.width !== baselineImage.width ||
        currentImage.height !== baselineImage.height
      ) {
        logger.warn(
          {
            current: { width: currentImage.width, height: currentImage.height },
            baseline: { width: baselineImage.width, height: baselineImage.height },
          },
          'Image dimensions do not match'
        );
        throw new VisualRegressionError(
          VisualRegressionErrorType.DIMENSION_MISMATCH,
          `Image dimensions do not match: current (${currentImage.width}x${currentImage.height}) vs baseline (${baselineImage.width}x${baselineImage.height})`
        );
      }

      // Generate ignore mask if regions specified
      const ignoreMask = options.ignoreRegions
        ? this.createIgnoreMask(
            currentImage.width,
            currentImage.height,
            options.ignoreRegions
          )
        : undefined;

      // Perform pixel comparison
      const pixelComparison = await this.performPixelComparison(
        currentImage,
        baselineImage,
        options,
        ignoreMask
      );

      // Generate diff image if requested
      let diffImagePath: string | undefined;
      if (options.generateDiffImage !== false && pixelComparison.diffPixels > 0) {
        diffImagePath = await this.generateDiffImage(
          currentImage,
          baselineImage,
          pixelComparison,
          resultId,
          baseline.screenName
        );
      }

      // Perform LLM analysis if enabled
      const llmAnalysis = await this.performLLMAnalysis(
        currentImagePath,
        baseline,
        options,
        pixelComparison
      );

      // Determine overall result
      const hasRegression = this.determineRegression(
        pixelComparison,
        llmAnalysis,
        options
      );
      const severity = this.determineSeverity(
        pixelComparison,
        llmAnalysis,
        options
      );

      const result: VisualRegressionResult = {
        id: resultId,
        hasRegression,
        severity,
        pixelComparison: {
          ...pixelComparison,
          diffImagePath,
        },
        llmAnalysis,
        baseline,
        currentImagePath,
        timestamp: new Date(),
        processingTimeMs: Date.now() - startTime,
      };

      // Cache result
      if (this.config.enableCache) {
        this.addToCache(cacheKey, result);
      }

      logger.info(
        {
          resultId,
          hasRegression,
          severity,
          diffRatio: pixelComparison.diffRatio,
          diffPixels: pixelComparison.diffPixels,
        },
        'Visual regression comparison completed'
      );

      return result;
    } catch (error) {
      logger.error(
        {
          resultId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Visual regression comparison failed'
      );
      throw error;
    }
  }

  /**
   * Capture and compare in one operation
   */
  async captureAndCompare(
    page: Page,
    baseline: VisualBaseline,
    options: VisualRegressionOptions & {
      captureOptions?: {
        fullPage?: boolean;
        maskSelectors?: string[];
        waitTime?: number;
      };
    } = {}
  ): Promise<VisualRegressionResult> {
    const { captureOptions = {}, ...comparisonOptions } = options;

    // Apply mask selectors before capturing
    const originalStyles = new Map<string, string>();
    const ignoreSelectors = [
      ...(comparisonOptions.ignoreSelectors || []),
      ...(captureOptions.maskSelectors || []),
    ];

    if (ignoreSelectors.length > 0) {
      for (const selector of ignoreSelectors) {
        try {
          await page.evaluate((sel) => {
            const elements = Array.from(document.querySelectorAll(sel));
            for (const el of elements) {
              const element = el as HTMLElement;
              const originalVisibility = element.style.visibility;
              element.dataset.originalVisibility = originalVisibility;
              element.style.visibility = 'hidden';
            }
          }, selector);
        } catch {
          logger.warn({ selector }, 'Failed to apply mask selector');
        }
      }
    }

    // Wait if specified
    if (captureOptions.waitTime) {
      await page.waitForTimeout(captureOptions.waitTime);
    }

    // Capture screenshot to temp file
    const tempPath = join(
      this.config.diffOutputDir,
      `temp_${randomUUID()}.png`
    );
    await page.screenshot({
      path: tempPath,
      fullPage: captureOptions.fullPage,
    });

    // Restore masked elements
    if (ignoreSelectors.length > 0) {
      for (const selector of ignoreSelectors) {
        try {
          await page.evaluate((sel) => {
            const elements = Array.from(document.querySelectorAll(sel));
            for (const el of elements) {
              const element = el as HTMLElement;
              const original = element.dataset.originalVisibility;
              if (original !== undefined) {
                element.style.visibility = original;
                delete element.dataset.originalVisibility;
              }
            }
          }, selector);
        } catch {
          // Ignore restoration errors
        }
      }
    }

    // Perform comparison
    const result = await this.compareAgainstBaseline(
      tempPath,
      baseline,
      comparisonOptions
    );

    // Clean up temp file
    try {
      const fs = await import('node:fs/promises');
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }

    return result;
  }

  /**
   * Load image and return PNG data
   */
  private async loadImage(imagePath: string): Promise<{
    data: Uint8Array;
    width: number;
    height: number;
  }> {
    try {
      const buffer = readFileSync(imagePath);

      // Try to read as PNG directly
      try {
        const png = PNG.sync.read(buffer);
        return {
          data: png.data,
          width: png.width,
          height: png.height,
        };
      } catch {
        // If PNG reading fails, try using sharp to convert
        const pngBuffer = await sharp(buffer)
          .ensureAlpha()
          .toFormat('png')
          .toBuffer();

        const png = PNG.sync.read(pngBuffer);
        return {
          data: png.data,
          width: png.width,
          height: png.height,
        };
      }
    } catch (error) {
      throw new VisualRegressionError(
        VisualRegressionErrorType.INVALID_IMAGE,
        `Failed to load image: ${imagePath}`,
        error
      );
    }
  }

  /**
   * Validate that an image file exists
   */
  private validateImageExists(imagePath: string): void {
    if (!existsSync(imagePath)) {
      throw new VisualRegressionError(
        VisualRegressionErrorType.IMAGE_NOT_FOUND,
        `Image not found: ${imagePath}`
      );
    }
  }

  /**
   * Perform pixel-based comparison
   */
  private async performPixelComparison(
    currentImage: { data: Uint8Array; width: number; height: number },
    baselineImage: { data: Uint8Array; width: number; height: number },
    options: VisualRegressionOptions,
    ignoreMask?: Uint8Array
  ): Promise<Omit<PixelComparisonResult, 'diffImagePath'>> {
    const width = currentImage.width;
    const height = currentImage.height;

    // Create diff image
    const diffImage = new PNG({ width, height });

    // Determine thresholds
    const threshold = options.pixelThreshold ?? this.config.defaultPixelThreshold;
    const maxDiffPixels =
      options.maxDiffPixels ??
      width * height * (options.maxDiffRatio ?? this.config.defaultMaxDiffRatio);

    // Options for pixelmatch
    const pixelMatchOptions = {
      threshold: threshold / 255,
      includeAA: options.ignoreAntiAliasing ?? false,
      diffColor: [255, 0, 0] as [number, number, number], // Red for differences
      diffColorAlt: [0, 0, 255] as [number, number, number], // Blue for anti-aliasing
    };

    // If ignoring colors, convert both to grayscale first
    let currentData = currentImage.data;
    let baselineData = baselineImage.data;

    if (options.ignoreColors) {
      currentData = this.toGrayscale(currentData);
      baselineData = this.toGrayscale(baselineData);
    }

    // Run pixelmatch
    const numDiffPixels = pixelmatch(
      currentData,
      baselineData,
      diffImage.data,
      width,
      height,
      pixelMatchOptions
    );

    // Apply ignore mask if provided
    let actualDiffPixels = numDiffPixels;
    if (ignoreMask) {
      for (let i = 0; i < ignoreMask.length; i++) {
        if (ignoreMask[i] === 1) {
          // Clear diff in ignored region
          diffImage.data[i * 4] = 0;
          diffImage.data[i * 4 + 1] = 0;
          diffImage.data[i * 4 + 2] = 0;
          diffImage.data[i * 4 + 3] = 0;
          actualDiffPixels--;
        }
      }
    }

    // Calculate statistics
    const totalPixels = width * height;
    const diffRatio = actualDiffPixels / totalPixels;

    // Calculate max and mean difference
    const { maxDiff, meanDiff } = this.calculateDiffStats(
      currentData,
      baselineData,
      ignoreMask
    );

    const matches = actualDiffPixels <= maxDiffPixels;

    return {
      matches,
      diffPixels: actualDiffPixels,
      totalPixels,
      diffRatio,
      maxDiff,
      meanDiff,
    };
  }

  /**
   * Convert RGBA data to grayscale
   */
  private toGrayscale(data: Uint8Array): Uint8Array {
    const grayscale = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      grayscale[i] = gray;
      grayscale[i + 1] = gray;
      grayscale[i + 2] = gray;
      grayscale[i + 3] = data[i + 3]; // Keep alpha
    }
    return grayscale;
  }

  /**
   * Calculate difference statistics
   */
  private calculateDiffStats(
    data1: Uint8Array,
    data2: Uint8Array,
    ignoreMask?: Uint8Array
  ): { maxDiff: number; meanDiff: number } {
    let maxDiff = 0;
    let totalDiff = 0;
    let count = 0;

    for (let i = 0; i < data1.length; i += 4) {
      // Skip if in ignored region
      if (ignoreMask && ignoreMask[i / 4] === 1) {
        continue;
      }

      // Calculate per-channel difference
      const rDiff = Math.abs(data1[i] - data2[i]);
      const gDiff = Math.abs(data1[i + 1] - data2[i + 1]);
      const bDiff = Math.abs(data1[i + 2] - data2[i + 2]);
      const pixelDiff = Math.max(rDiff, gDiff, bDiff);

      maxDiff = Math.max(maxDiff, pixelDiff);
      totalDiff += pixelDiff;
      count++;
    }

    return {
      maxDiff,
      meanDiff: count > 0 ? totalDiff / count : 0,
    };
  }

  /**
   * Create ignore mask from regions
   */
  private createIgnoreMask(
    width: number,
    height: number,
    regions: IgnoreRegion[]
  ): Uint8Array {
    const mask = new Uint8Array(width * height);

    for (const region of regions) {
      const startX = Math.max(0, Math.floor(region.x));
      const startY = Math.max(0, Math.floor(region.y));
      const endX = Math.min(width, Math.ceil(region.x + region.width));
      const endY = Math.min(height, Math.ceil(region.y + region.height));

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          mask[y * width + x] = 1;
        }
      }
    }

    return mask;
  }

  /**
   * Generate diff image
   */
  private async generateDiffImage(
    currentImage: { data: Uint8Array; width: number; height: number },
    baselineImage: { data: Uint8Array; width: number; height: number },
    pixelComparison: Omit<PixelComparisonResult, 'diffImagePath'>,
    resultId: string,
    screenName: string
  ): Promise<string> {
    const width = currentImage.width;
    const height = currentImage.height;

    // Create side-by-side comparison image
    const compositeWidth = width * 3;
    const compositeHeight = height;

    // Create a blank canvas for the composite
    const compositePng = new PNG({ width: compositeWidth, height: compositeHeight });

    // Load images as PNG
    const currentPng = Object.assign(new PNG({ width, height }), {
      data: currentImage.data,
    });
    const baselinePng = Object.assign(new PNG({ width, height }), {
      data: baselineImage.data,
    });

    // Create diff PNG
    const diffPng = new PNG({ width, height });
    const threshold = this.config.defaultPixelThreshold / 255;

    pixelmatch(
      currentImage.data,
      baselineImage.data,
      diffPng.data,
      width,
      height,
      { threshold, diffColor: [255, 0, 0], diffColorAlt: [0, 0, 255] }
    );

    // Copy images into the composite
    // Blit baseline to left
    this.blitPng(baselinePng, compositePng, 0, 0);
    // Blit current to center
    this.blitPng(currentPng, compositePng, width, 0);
    // Blit diff to right
    this.blitPng(diffPng, compositePng, width * 2, 0);

    const diffImagePath = join(
      this.config.diffOutputDir,
      `${this.sanitizeFilename(screenName)}_${resultId.slice(0, 8)}.png`
    );

    writeFileSync(diffImagePath, PNG.sync.write(compositePng));

    return diffImagePath;
  }

  /**
   * Blit one PNG onto another at the specified position
   */
  private blitPng(source: PNG, target: PNG, offsetX: number, offsetY: number): void {
    for (let y = 0; y < source.height; y++) {
      for (let x = 0; x < source.width; x++) {
        const sourceIdx = (y * source.width + x) * 4;
        const targetX = offsetX + x;
        const targetY = offsetY + y;

        if (targetX < target.width && targetY < target.height) {
          const targetIdx = (targetY * target.width + targetX) * 4;
          target.data[targetIdx] = source.data[sourceIdx];
          target.data[targetIdx + 1] = source.data[sourceIdx + 1];
          target.data[targetIdx + 2] = source.data[sourceIdx + 2];
          target.data[targetIdx + 3] = source.data[sourceIdx + 3];
        }
      }
    }
  }

  /**
   * Perform LLM-based visual analysis
   */
  private async performLLMAnalysis(
    currentImagePath: string,
    baseline: VisualBaseline,
    options: VisualRegressionOptions,
    pixelComparison: Omit<PixelComparisonResult, 'diffImagePath'>
  ): Promise<LLMAnalysisResult> {
    // Skip if LLM analysis not enabled or no provider available
    const shouldUseLLM = options.useLLMAnalysis ?? this.config.enableLLMAnalysis;
    if (!shouldUseLLM || !this.llmProvider) {
      return {
        analyzed: false,
        severity: this.inferSeverityFromPixels(pixelComparison),
        summary: 'LLM analysis not enabled',
        differences: [],
        isAcceptable: pixelComparison.matches,
      };
    }

    // Skip LLM analysis if pixels match (optimization)
    if (pixelComparison.matches && pixelComparison.diffRatio === 0) {
      return {
        analyzed: true,
        severity: DifferenceSeverity.NONE,
        summary: 'No visual differences detected',
        differences: [],
        isAcceptable: true,
      };
    }

    try {
      const analysis = await this.analyzeWithLLM(
        currentImagePath,
        baseline,
        options
      );
      return analysis;
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        'LLM analysis failed, falling back to pixel-based severity'
      );
      return {
        analyzed: false,
        severity: this.inferSeverityFromPixels(pixelComparison),
        summary: 'LLM analysis failed',
        differences: [],
        isAcceptable: pixelComparison.matches,
      };
    }
  }

  /**
   * Analyze images using LLM with vision capabilities
   */
  private async analyzeWithLLM(
    currentImagePath: string,
    baseline: VisualBaseline,
    options: VisualRegressionOptions
  ): Promise<LLMAnalysisResult> {
    const timeout = options.llmTimeout ?? this.config.defaultLLMTimeout;

    // Build the analysis prompt
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(baseline, options);

    try {
      // For now, we'll use a text-based analysis approach
      // In a full implementation, you'd use the vision API with the actual images
      const completionOptions: CompletionOptions = {
        maxTokens: 2000,
        temperature: 0.3,
        timeout,
      };

      // Create a text-based request describing the differences
      const response = await this.llmProvider!.createCompletion(
        [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: userPrompt.replace(
              '{PIXEL_STATS}',
              JSON.stringify({
                diffPixels: options.maxDiffPixels,
                diffRatio: options.maxDiffRatio,
                threshold: options.pixelThreshold,
              })
            ),
          },
        ],
        completionOptions
      );

      // Parse the response
      const parsed = this.parseLLMResponse(response.content);

      return {
        analyzed: true,
        ...parsed,
        model: response.model,
      };
    } catch (error) {
      logger.error({ error }, 'LLM request failed');
      throw error;
    }
  }

  /**
   * Build system prompt for LLM
   */
  private buildSystemPrompt(): string {
    return `You are an expert visual QA analyst specializing in comparing web and mobile application screenshots for visual regression testing.

Your task is to analyze the differences between a baseline screenshot and a current screenshot, focusing on:
1. Layout shifts and structural changes
2. Color and styling differences
3. Missing or extra elements
4. Text content changes
5. Spacing and alignment issues

Classify differences by severity:
- CRITICAL: Broken UI, missing core elements, text overflow
- HIGH: Significant layout shifts, color changes affecting readability
- MEDIUM: Noticeable spacing changes, minor layout shifts
- LOW: Minor anti-aliasing differences, negligible color variations
- NONE: No meaningful differences

Respond in JSON format:
{
  "severity": "none|low|medium|high|critical",
  "summary": "Brief summary of differences",
  "differences": [
    {
      "description": "What changed",
      "severity": "low|medium|high|critical",
      "type": "layout|color|content|missing|extra|text|other"
    }
  ],
  "isAcceptable": false,
  "reasoning": "Explanation for the severity classification"
}`;
  }

  /**
   * Build user prompt for LLM
   */
  private buildUserPrompt(
    baseline: VisualBaseline,
    options: VisualRegressionOptions
  ): string {
    let prompt = `Compare the current screenshot against the baseline for screen: "${baseline.screenName}"

`;

    if (options.description) {
      prompt += `Context: ${options.description}\n\n`;
    }

    prompt += `Baseline metadata:
- Screen: ${baseline.screenName}
- Device: ${baseline.metadata.device.deviceType} (${baseline.metadata.device.viewport.width}x${baseline.metadata.device.viewport.height})
- Captured: ${baseline.metadata.timestamp}

Pixel comparison statistics:
${JSON.stringify({ pixelStats: '{PIXEL_STATS}' }, null, 2)}

Ignore regions: ${options.ignoreRegions?.length || 0} defined
Ignore selectors: ${options.ignoreSelectors?.join(', ') || 'none'}

Based on the pixel difference statistics and any provided context, classify the visual differences and determine if this represents an actual regression or an acceptable change.

Respond with the JSON analysis.`;

    return prompt;
  }

  /**
   * Parse LLM response
   */
  private parseLLMResponse(content: string): Omit<LLMAnalysisResult, 'analyzed' | 'model'> {
    try {
      // Extract JSON from response
      const jsonMatch =
        content.match(/```(?:json)?\s*([\s\S]*?)\s*```/) ||
        content.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const jsonString = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonString) as LLMDiffAnalysisResponse;

      // Map severity
      const severity = this.parseSeverity(parsed.severity);

      return {
        severity,
        summary: parsed.summary || 'Visual differences detected',
        differences: (parsed.differences || []).map((d) => ({
          description: d.description,
          severity: this.parseSeverity(d.severity),
          type: d.type as any,
          boundingBox: d.boundingBox,
        })),
        isAcceptable: parsed.isAcceptable ?? false,
        reasoning: parsed.reasoning,
      };
    } catch (error) {
      logger.warn({ error }, 'Failed to parse LLM response');
      return {
        severity: DifferenceSeverity.MEDIUM,
        summary: 'Unable to parse LLM analysis',
        differences: [],
        isAcceptable: false,
      };
    }
  }

  /**
   * Parse severity string to enum
   */
  private parseSeverity(value: string): DifferenceSeverity {
    const upper = value.toUpperCase();
    if (Object.values(DifferenceSeverity).includes(upper as DifferenceSeverity)) {
      return upper as DifferenceSeverity;
    }
    return DifferenceSeverity.MEDIUM;
  }

  /**
   * Infer severity from pixel comparison alone
   */
  private inferSeverityFromPixels(
    pixelComparison: Omit<PixelComparisonResult, 'diffImagePath'>
  ): DifferenceSeverity {
    if (pixelComparison.diffRatio === 0) {
      return DifferenceSeverity.NONE;
    }
    if (pixelComparison.diffRatio <= 0.001) {
      return DifferenceSeverity.LOW;
    }
    if (pixelComparison.diffRatio <= 0.02) {
      return DifferenceSeverity.MEDIUM;
    }
    if (pixelComparison.diffRatio <= 0.05) {
      return DifferenceSeverity.HIGH;
    }
    return DifferenceSeverity.CRITICAL;
  }

  /**
   * Determine if regression exists
   */
  private determineRegression(
    pixelComparison: Omit<PixelComparisonResult, 'diffImagePath'>,
    llmAnalysis: LLMAnalysisResult,
    options: VisualRegressionOptions
  ): boolean {
    // If LLM says it's acceptable, trust it
    if (llmAnalysis.analyzed && llmAnalysis.isAcceptable) {
      return false;
    }

    // Check pixel threshold
    const maxDiffRatio = options.maxDiffRatio ?? this.config.defaultMaxDiffRatio;
    if (pixelComparison.diffRatio > maxDiffRatio) {
      return true;
    }

    // Check LLM severity
    if (
      llmAnalysis.analyzed &&
      (llmAnalysis.severity === DifferenceSeverity.HIGH ||
        llmAnalysis.severity === DifferenceSeverity.CRITICAL)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Determine overall severity
   */
  private determineSeverity(
    pixelComparison: Omit<PixelComparisonResult, 'diffImagePath'>,
    llmAnalysis: LLMAnalysisResult,
    options: VisualRegressionOptions
  ): DifferenceSeverity {
    // Use LLM severity if available
    if (llmAnalysis.analyzed) {
      return llmAnalysis.severity;
    }

    // Fall back to pixel-based
    return this.inferSeverityFromPixels(pixelComparison);
  }

  /**
   * Generate cache key
   */
  private getCacheKey(
    currentImagePath: string,
    baseline: VisualBaseline,
    options: VisualRegressionOptions
  ): string {
    return `${currentImagePath}:${baseline.imagePath}:${JSON.stringify(options)}`;
  }

  /**
   * Add result to cache
   */
  private addToCache(key: string, result: VisualRegressionResult): void {
    if (this.cache.size >= this.config.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, result);
  }

  /**
   * Sanitize filename
   */
  private sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<VisualRegressionDetectorConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get current configuration
   */
  getConfig(): VisualRegressionDetectorConfig {
    return { ...this.config };
  }
}

/**
 * Global detector instance
 */
let globalDetector: VisualRegressionDetector | null = null;

/**
 * Get or create the global detector instance
 */
export function getGlobalVisualRegressionDetector(
  llmProvider: BaseLLMProvider | null,
  config?: Partial<VisualRegressionDetectorConfig>
): VisualRegressionDetector {
  if (!globalDetector) {
    globalDetector = new VisualRegressionDetector(llmProvider, config);
  }
  return globalDetector;
}

/**
 * Reset the global detector instance
 */
export function resetGlobalVisualRegressionDetector(): void {
  if (globalDetector) {
    globalDetector.clearCache();
    globalDetector = null;
  }
}

/**
 * Create a new detector instance
 */
export function createVisualRegressionDetector(
  llmProvider: BaseLLMProvider | null,
  config?: Partial<VisualRegressionDetectorConfig>
): VisualRegressionDetector {
  return new VisualRegressionDetector(llmProvider, config);
}
