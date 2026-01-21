/**
 * Visual Baseline Screenshot Capture Service
 *
 * Captures and manages visual baseline screenshots with device and version metadata
 * for regression comparison.
 */

import { mkdirSync, existsSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { createModuleLogger } from '../../utils/logger.js';
import type {
  VisualBaseline,
  VisualBaselineCaptureOptions,
  VisualBaselineConfig,
  VisualBaselineMetadata,
  DeviceMetadata,
  AppVersionMetadata,
} from './types.js';

const logger = createModuleLogger('visual-baseline');

/**
 * Default visual baseline configuration
 */
const DEFAULT_CONFIG: VisualBaselineConfig = {
  baseDir: 'visual-baselines',
  defaultAppMetadata: {
    appName: 'App',
    appVersion: '1.0.0',
    environment: 'development',
  },
  includeDeviceMetadata: true,
  includeGitMetadata: true,
  defaultScreenshotType: 'png',
  defaultQuality: 90,
  defaultFullPage: false,
};

/**
 * Visual Baseline Service class
 */
export class VisualBaselineService {
  private config: VisualBaselineConfig;
  private baselines: Map<string, VisualBaseline> = new Map();

  constructor(config?: Partial<VisualBaselineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ensureBaseDirectory();
  }

  /**
   * Ensure the base baseline directory exists
   */
  private ensureBaseDirectory(): void {
    if (!existsSync(this.config.baseDir)) {
      mkdirSync(this.config.baseDir, { recursive: true });
      logger.info({ baseDir: this.config.baseDir }, 'Created visual baseline directory');
    }
  }

  /**
   * Get or create baseline directory for app version
   */
  private getBaselineDirectory(appName: string, appVersion: string): string {
    const dir = join(
      this.config.baseDir,
      this.sanitizeFilename(appName),
      this.sanitizeFilename(appVersion)
    );

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    return dir;
  }

  /**
   * Sanitize filename by removing invalid characters
   */
  private sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  /**
   * Capture device metadata from the page
   */
  private async captureDeviceMetadata(page: Page): Promise<DeviceMetadata> {
    const viewport = page.viewportSize() ?? { width: 1920, height: 1080 };

    // Get device pixel ratio and user agent from page
    const pageData = await page.evaluate(() => ({
      pixelRatio: window.devicePixelRatio,
      userAgent: navigator.userAgent,
      width: window.screen.width,
      height: window.screen.height,
    }));

    // Determine device type based on viewport
    const deviceType =
      viewport.width < 768 ? 'mobile' : viewport.width < 1024 ? 'tablet' : 'desktop';

    // Get browser info from context
    const context = page.context();
    const browser = context.browser();
    const browserName = browser?.browserType().name() ?? 'unknown';
    const browserVersion = browser?.version() ?? undefined;

    return {
      deviceType,
      os: this.detectOS(pageData.userAgent),
      osVersion: this.extractOSVersion(pageData.userAgent),
      browser: browserName,
      browserVersion,
      viewport: {
        width: viewport.width,
        height: viewport.height,
      },
      pixelRatio: pageData.pixelRatio,
      userAgent: pageData.userAgent,
    };
  }

  /**
   * Detect operating system from user agent
   */
  private detectOS(userAgent: string): string {
    const ua = userAgent.toLowerCase();
    if (ua.includes('windows')) return 'Windows';
    if (ua.includes('mac os x') || ua.includes('macos')) return 'macOS';
    if (ua.includes('linux')) return 'Linux';
    if (ua.includes('android')) return 'Android';
    if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) return 'iOS';
    return 'Unknown';
  }

  /**
   * Extract OS version from user agent
   */
  private extractOSVersion(userAgent: string): string | undefined {
    const ua = userAgent.toLowerCase();

    // Windows version patterns
    const windowsMatch = ua.match(/windows nt (\d+\.\d+)/);
    if (windowsMatch) return windowsMatch[1];

    // macOS version patterns
    const macMatch = ua.match(/mac os x (\d+[._]\d+)/);
    if (macMatch) return macMatch[1].replace('_', '.');

    // Android version patterns
    const androidMatch = ua.match(/android (\d+\.\d+)/);
    if (androidMatch) return androidMatch[1];

    // iOS version patterns
    const iosMatch = ua.match(/os (\d+[._]\d+) like mac/);
    if (iosMatch) return iosMatch[1].replace('_', '.');

    return undefined;
  }

  /**
   * Capture git metadata if enabled
   */
  private async captureGitMetadata(): Promise<{ gitCommit?: string; gitBranch?: string }> {
    if (!this.config.includeGitMetadata) {
      return {};
    }

    try {
      const { execSync } = await import('node:child_process');

      let gitCommit: string | undefined;
      let gitBranch: string | undefined;

      try {
        gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim().slice(0, 8);
      } catch {
        // Not in a git repo or git not available
      }

      try {
        gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
      } catch {
        // Not in a git repo or git not available
      }

      return { gitCommit, gitBranch };
    } catch {
      return {};
    }
  }

  /**
   * Generate image file path
   */
  private generateImagePath(screenName: string, extension: string): string {
    const timestamp = Date.now();
    const uuid = randomUUID().split('-')[0];
    const filename = `${this.sanitizeFilename(screenName)}_${timestamp}_${uuid}.${extension}`;
    return join(this.config.baseDir, filename);
  }

  /**
   * Generate metadata file path
   */
  private generateMetadataPath(imagePath: string): string {
    return imagePath.replace(/\.(png|jpeg|jpg)$/i, '.metadata.json');
  }

  /**
   * Apply mask selectors to the page (hide dynamic content)
   */
  private async applyMaskSelectors(page: Page, selectors: string[]): Promise<void> {
    for (const selector of selectors) {
      try {
        await page.evaluate((sel) => {
          const elements = document.querySelectorAll(sel);
          for (const el of elements) {
            (el as HTMLElement).style.visibility = 'hidden';
          }
        }, selector);
      } catch (error) {
        logger.warn({ selector, error: 'Failed to apply mask selector' });
      }
    }
  }

  /**
   * Capture a visual baseline screenshot
   */
  async captureBaseline(
    page: Page,
    testRunId: string,
    options: VisualBaselineCaptureOptions
  ): Promise<VisualBaseline> {
    const {
      screenName,
      fullPage = this.config.defaultFullPage,
      type = this.config.defaultScreenshotType,
      quality = this.config.defaultQuality,
      maskSelectors = [],
      waitForSelector,
      waitTime = 0,
      description,
      tags,
      customMetadata,
    } = options;

    logger.debug(
      {
        screenName,
        testRunId,
        fullPage,
        type,
      },
      'Capturing visual baseline'
    );

    // Wait for selector if specified
    if (waitForSelector) {
      try {
        await page.waitForSelector(waitForSelector, { timeout: 5000 });
      } catch {
        logger.warn({ waitForSelector }, 'Selector not found, proceeding with capture');
      }
    }

    // Wait additional time if specified
    if (waitTime > 0) {
      await page.waitForTimeout(waitTime);
    }

    // Get baseline directory
    const baselineDir = this.getBaselineDirectory(
      this.config.defaultAppMetadata.appName,
      this.config.defaultAppMetadata.appVersion
    );

    // Generate file paths
    const imagePath = options.path ?? join(baselineDir, `${this.sanitizeFilename(screenName)}.${type}`);
    const metadataPath = this.generateMetadataPath(imagePath);

    // Apply mask selectors if any
    const originalStyles = new Map<string, string>();
    if (maskSelectors.length > 0) {
      for (const selector of maskSelectors) {
        try {
          await page.evaluate((sel) => {
            const elements = document.querySelectorAll(sel);
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

    // Capture screenshot
    await page.screenshot({
      path: imagePath,
      fullPage,
      type,
      quality: type === 'jpeg' ? quality : undefined,
    });

    // Restore masked elements
    if (maskSelectors.length > 0) {
      for (const selector of maskSelectors) {
        try {
          await page.evaluate((sel) => {
            const elements = document.querySelectorAll(sel);
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

    // Get file stats
    const stats = statSync(imagePath);

    // Get image dimensions
    const dimensions = await this.getImageDimensions(imagePath);

    // Capture metadata
    const deviceMetadata = this.config.includeDeviceMetadata
      ? await this.captureDeviceMetadata(page)
      : {
          deviceType: 'desktop' as const,
          os: 'Unknown',
          browser: 'unknown',
          viewport: { width: dimensions.width, height: dimensions.height },
        };

    const gitMetadata = await this.captureGitMetadata();

    const appVersionMetadata: AppVersionMetadata = {
      ...this.config.defaultAppMetadata,
      environment: this.config.defaultAppMetadata.environment ?? 'development',
      buildTimestamp: new Date().toISOString(),
      ...gitMetadata,
    };

    const metadata: VisualBaselineMetadata = {
      device: deviceMetadata,
      appVersion: appVersionMetadata,
      screenName,
      timestamp: new Date().toISOString(),
      testRunId,
      description,
      tags,
      custom: customMetadata,
    };

    // Write metadata file
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    // Create baseline object
    const baselineId = randomUUID();
    const baseline: VisualBaseline = {
      id: baselineId,
      screenName,
      imagePath,
      metadataPath,
      metadata,
      fileSize: stats.size,
      dimensions,
      createdAt: new Date(),
    };

    // Store in cache
    this.baselines.set(baselineId, baseline);

    logger.info(
      {
        baselineId,
        screenName,
        imagePath,
        fileSize: stats.size,
        dimensions,
      },
      'Visual baseline captured successfully'
    );

    return baseline;
  }

  /**
   * Get image dimensions from file
   */
  private async getImageDimensions(imagePath: string): Promise<{ width: number; height: number }> {
    // For PNG/JPEG, we can read the dimensions from the file header
    const buffer = readFileSync(imagePath);

    // Check for PNG
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      // PNG: IHDR chunk starts at byte 8
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }

    // Check for JPEG
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      // JPEG: Find SOF0 marker
      let i = 2;
      while (i < buffer.length) {
        if (buffer[i] === 0xff && buffer[i + 1] >= 0xc0 && buffer[i + 1] <= 0xc3) {
          const height = buffer.readUInt16BE(i + 5);
          const width = buffer.readUInt16BE(i + 7);
          return { width, height };
        }
        i += 2 + buffer.readUInt16BE(i + 2);
      }
    }

    // Fallback: use viewport size
    return { width: 1920, height: 1080 };
  }

  /**
   * Load a baseline by ID
   */
  loadBaseline(baselineId: string): VisualBaseline | undefined {
    return this.baselines.get(baselineId);
  }

  /**
   * Load a baseline from file path
   */
  loadBaselineFromFile(imagePath: string): VisualBaseline | undefined {
    try {
      const metadataPath = this.generateMetadataPath(imagePath);

      if (!existsSync(imagePath) || !existsSync(metadataPath)) {
        logger.warn({ imagePath }, 'Baseline files not found');
        return undefined;
      }

      const stats = statSync(imagePath);
      const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8')) as VisualBaselineMetadata;
      const dimensions = this.getImageDimensionsSync(imagePath);

      const baseline: VisualBaseline = {
        id: randomUUID(),
        screenName: metadata.screenName,
        imagePath,
        metadataPath,
        metadata,
        fileSize: stats.size,
        dimensions,
        createdAt: new Date(metadata.timestamp),
      };

      return baseline;
    } catch (error) {
      logger.error(
        {
          imagePath,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to load baseline from file'
      );
      return undefined;
    }
  }

  /**
   * Get image dimensions synchronously
   */
  private getImageDimensionsSync(imagePath: string): { width: number; height: number } {
    const buffer = readFileSync(imagePath);

    // Check for PNG
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }

    // Check for JPEG
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      let i = 2;
      while (i < buffer.length) {
        if (buffer[i] === 0xff && buffer[i + 1] >= 0xc0 && buffer[i + 1] <= 0xc3) {
          const height = buffer.readUInt16BE(i + 5);
          const width = buffer.readUInt16BE(i + 7);
          return { width, height };
        }
        i += 2 + buffer.readUInt16BE(i + 2);
      }
    }

    return { width: 1920, height: 1080 };
  }

  /**
   * Find baselines by screen name
   */
  findBaselinesByScreen(screenName: string): VisualBaseline[] {
    const results: VisualBaseline[] = [];

    for (const baseline of this.baselines.values()) {
      if (baseline.screenName === screenName) {
        results.push(baseline);
      }
    }

    return results;
  }

  /**
   * List all baselines
   */
  listBaselines(): VisualBaseline[] {
    return Array.from(this.baselines.values());
  }

  /**
   * Get the current configuration
   */
  getConfig(): VisualBaselineConfig {
    return { ...this.config };
  }

  /**
   * Update the configuration
   */
  updateConfig(updates: Partial<VisualBaselineConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info({ config: this.config }, 'Visual baseline configuration updated');
  }

  /**
   * Clear cached baselines
   */
  clearCache(): void {
    this.baselines.clear();
  }
}

/**
 * Global visual baseline service instance
 */
let globalVisualBaselineService: VisualBaselineService | null = null;

/**
 * Get the global visual baseline service instance
 */
export function getGlobalVisualBaselineService(
  config?: Partial<VisualBaselineConfig>
): VisualBaselineService {
  if (!globalVisualBaselineService) {
    globalVisualBaselineService = new VisualBaselineService(config);
  }
  return globalVisualBaselineService;
}

/**
 * Reset the global visual baseline service (useful for testing)
 */
export function resetGlobalVisualBaselineService(): void {
  if (globalVisualBaselineService) {
    globalVisualBaselineService.clearCache();
    globalVisualBaselineService = null;
  }
}

/**
 * Create a new visual baseline service instance
 */
export function createVisualBaselineService(
  config?: Partial<VisualBaselineConfig>
): VisualBaselineService {
  return new VisualBaselineService(config);
}
