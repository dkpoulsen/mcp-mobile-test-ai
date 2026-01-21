/**
 * Artifact capture service for Playwright tests
 * Handles capture of screenshots, videos, device logs, and performance metrics
 */

import { mkdirSync, existsSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Page, CDPSession } from '@playwright/test';
import { createModuleLogger } from '../../utils/logger.js';
import type {
  ArtifactCaptureContext,
  ArtifactCaptureConfig,
  CapturedArtifact,
  DeviceLogCaptureOptions,
  DeviceLogs,
  PerformanceMetrics,
  PerformanceMetricsCaptureOptions,
  ScreenshotCaptureOptions,
  TraceCaptureOptions,
  VideoCaptureOptions,
} from './types.js';
import { ArtifactCaptureType } from './types.js';

const logger = createModuleLogger('artifact-capture');

/**
 * Default artifact capture configuration
 */
const DEFAULT_CONFIG: ArtifactCaptureConfig = {
  baseDir: 'artifacts',
  captureScreenshotOnFailure: true,
  captureVideo: false,
  captureTrace: false,
  captureHar: false,
  captureDeviceLogs: true,
  capturePerformanceMetrics: true,
  maxArtifactSize: 50 * 1024 * 1024, // 50MB
  compressOldArtifacts: false,
  compressionThresholdDays: 7,
};

/**
 * Artifact capture service class
 */
export class ArtifactCaptureService {
  private config: ArtifactCaptureConfig;
  private pageContexts: Map<string, Page> = new Map();
  private activeLoggers: Map<string, NodeJS.Timeout> = new Map();
  private consoleLogs: Map<string, unknown[]> = new Map();
  private networkRequests: Map<string, unknown[]> = new Map();

  constructor(config?: Partial<ArtifactCaptureConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ensureBaseDirectory();
  }

  /**
   * Ensure the base artifact directory exists
   */
  private ensureBaseDirectory(): void {
    if (!existsSync(this.config.baseDir)) {
      mkdirSync(this.config.baseDir, { recursive: true });
    }
  }

  /**
   * Get or create artifact directory for a context
   */
  private getArtifactDirectory(context: ArtifactCaptureContext): string {
    const { testRunId, testCaseId, baseDir } = context;
    const dir = join(
      baseDir ?? this.config.baseDir,
      testRunId,
      testCaseId ?? 'global'
    );

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    return dir;
  }

  /**
   * Generate artifact file path with timestamp
   */
  private generateArtifactPath(
    context: ArtifactCaptureContext,
    artifactType: ArtifactCaptureType,
    extension: string
  ): string {
    const dir = this.getArtifactDirectory(context);
    const timestamp = Date.now();
    const uuid = randomUUID().split('-')[0];
    return join(dir, `${artifactType}-${timestamp}-${uuid}.${extension}`);
  }

  /**
   * Register a page for artifact capture
   */
  registerPage(contextId: string, page: Page): void {
    this.pageContexts.set(contextId, page);
    this.initializeLogCollection(contextId, page);
  }

  /**
   * Unregister a page from artifact capture
   */
  unregisterPage(contextId: string): void {
    this.pageContexts.delete(contextId);
    this.cleanupLogCollection(contextId);
  }

  /**
   * Initialize log collection for a page
   */
  private initializeLogCollection(contextId: string, page: Page): void {
    // Initialize console logs array
    this.consoleLogs.set(contextId, []);

    // Subscribe to console events
    page.on('console', (msg) => {
      const logs = this.consoleLogs.get(contextId) ?? [];
      logs.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: Date.now(),
        location: msg.location(),
      });
      this.consoleLogs.set(contextId, logs);
    });

    // Initialize network requests array
    this.networkRequests.set(contextId, []);

    // Subscribe to network events
    page.on('request', (request) => {
      const requests = this.networkRequests.get(contextId) ?? [];
      requests.push({
        method: request.method(),
        url: request.url(),
        timestamp: Date.now(),
        type: 'request',
      });
      this.networkRequests.set(contextId, requests);
    });

    page.on('response', (response) => {
      const requests = this.networkRequests.get(contextId) ?? [];
      const request = response.request();
      // Find matching request and update with response data
      const matchingIndex = requests.findIndex((r: any) =>
        r.url === request.url() && r.type === 'request' && !r.status
      );
      if (matchingIndex >= 0) {
        requests[matchingIndex] = {
          ...requests[matchingIndex],
          status: response.status(),
          statusText: response.statusText(),
          timing: {
            startTime: (request as any).timing?.startTime ?? Date.now(),
            endTime: Date.now(),
          },
        };
      }
      this.networkRequests.set(contextId, requests);
    });

    logger.debug({ contextId }, 'Initialized log collection for page');
  }

  /**
   * Cleanup log collection for a context
   */
  private cleanupLogCollection(contextId: string): void {
    this.consoleLogs.delete(contextId);
    this.networkRequests.delete(contextId);
    const timeout = this.activeLoggers.get(contextId);
    if (timeout) {
      clearTimeout(timeout);
      this.activeLoggers.delete(contextId);
    }
  }

  /**
   * Capture a screenshot
   */
  async captureScreenshot(
    context: ArtifactCaptureContext,
    page: Page,
    options?: ScreenshotCaptureOptions
  ): Promise<CapturedArtifact> {
    const {
      fullPage = true,
      type = 'png',
      quality,
      metadata = {},
    } = options ?? {};

    const path = options?.path ?? this.generateArtifactPath(context, ArtifactCaptureType.SCREENSHOT, type);

    logger.debug(
      {
        testRunId: context.testRunId,
        testCaseId: context.testCaseId,
        path,
      },
      'Capturing screenshot'
    );

    try {
      await page.screenshot({
        path,
        fullPage,
        type,
        quality,
      });

      const size = this.getFileSize(path);

      const artifact: CapturedArtifact = {
        type: ArtifactCaptureType.SCREENSHOT,
        path,
        mimeType: type === 'png' ? 'image/png' : 'image/jpeg',
        size,
        timestamp: new Date(),
        metadata: {
          ...metadata,
          fullPage,
          testRunId: context.testRunId,
          testCaseId: context.testCaseId,
          testName: context.testName,
        },
      };

      logger.info(
        {
          path,
          size,
        },
        'Screenshot captured successfully'
      );

      return artifact;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          path,
        },
        'Failed to capture screenshot'
      );
      throw error;
    }
  }

  /**
   * Capture video (if enabled)
   * Note: Video capture is handled by Playwright's context.video() API
   */
  async captureVideo(
    context: ArtifactCaptureContext,
    videoPath: string,
    options?: VideoCaptureOptions
  ): Promise<CapturedArtifact> {
    const { metadata = {} } = options ?? {};

    logger.debug(
      {
        testRunId: context.testRunId,
        testCaseId: context.testCaseId,
        videoPath,
      },
      'Processing video artifact'
    );

    const finalPath = options?.path ?? this.generateArtifactPath(context, ArtifactCaptureType.VIDEO, 'webm');

    // If video file exists, move it to final location
    if (existsSync(videoPath) && videoPath !== finalPath) {
      const videoBuffer = readFileSync(videoPath);
      writeFileSync(finalPath, videoBuffer);
    }

    const size = this.getFileSize(finalPath);

    const artifact: CapturedArtifact = {
      type: ArtifactCaptureType.VIDEO,
      path: finalPath,
      mimeType: 'video/webm',
      size,
      timestamp: new Date(),
      metadata: {
        ...metadata,
        testRunId: context.testRunId,
        testCaseId: context.testCaseId,
        testName: context.testName,
      },
    };

    logger.info(
      {
        path: finalPath,
        size,
      },
      'Video artifact processed successfully'
    );

    return artifact;
  }

  /**
   * Capture a Playwright trace
   */
  async captureTrace(
    context: ArtifactCaptureContext,
    page: Page,
    options?: TraceCaptureOptions
  ): Promise<CapturedArtifact> {
    const { screenshots = true, snapshots = true, metadata = {} } = options ?? {};

    const path = options?.path ?? this.generateArtifactPath(context, ArtifactCaptureType.TRACE, 'zip');

    logger.debug(
      {
        testRunId: context.testRunId,
        testCaseId: context.testCaseId,
        path,
      },
      'Starting trace capture'
    );

    try {
      // Start tracing
      await page.context().tracing.start({
        screenshots,
        snapshots,
      });

      // Return a promise that resolves when tracing stops
      // The caller is responsible for stopping the trace
      const artifact: CapturedArtifact = {
        type: ArtifactCaptureType.TRACE,
        path,
        mimeType: 'application/zip',
        timestamp: new Date(),
        metadata: {
          ...metadata,
          testRunId: context.testRunId,
          testCaseId: context.testCaseId,
          testName: context.testName,
          screenshots,
          snapshots,
        },
      };

      return artifact;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          path,
        },
        'Failed to start trace capture'
      );
      throw error;
    }
  }

  /**
   * Stop trace capture and save to file
   */
  async stopTraceCapture(context: ArtifactCaptureContext, page: Page, artifactPath: string): Promise<void> {
    logger.debug(
      {
        testRunId: context.testRunId,
        testCaseId: context.testCaseId,
        path: artifactPath,
      },
      'Stopping trace capture'
    );

    try {
      await page.context().tracing.stop({
        path: artifactPath,
      });

      const size = this.getFileSize(artifactPath);

      logger.info(
        {
          path: artifactPath,
          size,
        },
        'Trace captured successfully'
      );
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          path: artifactPath,
        },
        'Failed to stop trace capture'
      );
      throw error;
    }
  }

  /**
   * Capture device logs (console, network, browser)
   */
  async captureDeviceLogs(
    context: ArtifactCaptureContext,
    contextId: string,
    options?: DeviceLogCaptureOptions
  ): Promise<CapturedArtifact> {
    const { logTypes = ['console', 'network'], metadata = {} } = options ?? {};

    const path = options?.path ?? this.generateArtifactPath(context, ArtifactCaptureType.DEVICE_LOGS, 'json');

    logger.debug(
      {
        testRunId: context.testRunId,
        testCaseId: context.testCaseId,
        logTypes,
      },
      'Capturing device logs'
    );

    try {
      const logs: DeviceLogs = {};

      if (logTypes.includes('console')) {
        logs.console = this.consoleLogs.get(contextId) as DeviceLogs['console'];
      }

      if (logTypes.includes('network')) {
        logs.network = this.networkRequests.get(contextId) as DeviceLogs['network'];
      }

      writeFileSync(path, JSON.stringify(logs, null, 2));

      const size = this.getFileSize(path);

      const artifact: CapturedArtifact = {
        type: ArtifactCaptureType.DEVICE_LOGS,
        path,
        mimeType: 'application/json',
        size,
        timestamp: new Date(),
        metadata: {
          ...metadata,
          testRunId: context.testRunId,
          testCaseId: context.testCaseId,
          testName: context.testName,
          logTypes,
          entryCounts: {
            console: logs.console?.length ?? 0,
            network: logs.network?.length ?? 0,
          },
        },
      };

      logger.info(
        {
          path,
          size,
          entryCounts: artifact.metadata.entryCounts,
        },
        'Device logs captured successfully'
      );

      return artifact;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          path,
        },
        'Failed to capture device logs'
      );
      throw error;
    }
  }

  /**
   * Capture performance metrics from a page
   */
  async capturePerformanceMetrics(
    context: ArtifactCaptureContext,
    page: Page,
    options?: PerformanceMetricsCaptureOptions
  ): Promise<CapturedArtifact> {
    const {
      captureTimings = true,
      captureResources = true,
      captureMemory = true,
      metadata = {},
    } = options ?? {};

    const path = options?.path ?? this.generateArtifactPath(context, ArtifactCaptureType.PERFORMANCE_METRICS, 'json');

    logger.debug(
      {
        testRunId: context.testRunId,
        testCaseId: context.testCaseId,
      },
      'Capturing performance metrics'
    );

    try {
      const metrics: PerformanceMetrics = {};

      // Capture navigation timing metrics
      if (captureTimings) {
        const timingMetrics = await page.evaluate(() => {
          const perfData = window.performance.timing;
          const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

          return {
            domContentLoaded: perfData.domContentLoadedEventEnd - perfData.navigationStart,
            loadComplete: perfData.loadEventEnd - perfData.navigationStart,
            firstPaint: performance.getEntriesByType('paint')
              .find((e: any) => e.name === 'first-paint')?.startTime ?? 0,
            firstContentfulPaint: performance.getEntriesByType('paint')
              .find((e: any) => e.name === 'first-contentful-paint')?.startTime ?? 0,
            timeToInteractive: navigationEntry?.domInteractive ?? 0,
            responseTime: navigationEntry?.responseStart ?? 0,
            domParseTime: navigationEntry?.domInteractive
              ? navigationEntry.domInteractive - (navigationEntry.responseEnd ?? 0)
              : 0,
          };
        });

        metrics.timings = timingMetrics;
      }

      // Capture resource metrics
      if (captureResources) {
        const resourceMetrics = await page.evaluate(() => {
          const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
          const byType: Record<string, number> = {};
          let totalTransferSize = 0;
          let totalEncodedBodySize = 0;

          for (const resource of resources) {
            const type = resource.initiatorType;
            byType[type] = (byType[type] ?? 0) + 1;
            totalTransferSize += resource.transferSize ?? 0;
            totalEncodedBodySize += resource.encodedBodySize ?? 0;
          }

          return {
            count: resources.length,
            totalTransferSize,
            totalEncodedBodySize,
            byType,
          };
        });

        metrics.resources = resourceMetrics;
      }

      // Capture memory metrics (Chrome-specific)
      if (captureMemory) {
        try {
          const cdpSession = (page as any).context()._cdpSession as CDPSession | undefined;
          if (cdpSession) {
            const memoryMetrics = await cdpSession.send('Performance.getMetrics');
            const memoryMap: Record<string, number> = {};

            for (const metric of memoryMetrics.metrics) {
              memoryMap[metric.name] = metric.value;
            }

            metrics.memory = {
              usedJSHeapSize: memoryMap.JSHeapUsedSize,
              totalJSHeapSize: memoryMap.JSHeapTotalSize,
              jsHeapSizeLimit: memoryMap.JSHeapSizeLimit,
            };
          }
        } catch {
          // CDP might not be available, skip memory metrics
          logger.debug('CDP session not available, skipping memory metrics');
        }
      }

      // Capture network metrics from collected requests
      const networkLogs = this.networkRequests.get(context.testRunId + context.testCaseId);
      if (networkLogs && networkLogs.length > 0) {
        const failedRequests = networkLogs.filter((r: any) => r.status && r.status >= 400);
        const statusCounts: Record<string, number> = {};
        let totalResponseTime = 0;

        for (const req of networkLogs as any[]) {
          if (req.status) {
            statusCounts[req.status] = (statusCounts[req.status] ?? 0) + 1;
            if (req.timing) {
              totalResponseTime += req.timing.endTime - req.timing.startTime;
            }
          }
        }

        metrics.network = {
          requestCount: networkLogs.length,
          failedRequests: failedRequests.length,
          avgResponseTime: networkLogs.length > 0 ? totalResponseTime / networkLogs.length : 0,
          byStatusCode: statusCounts,
        };
      }

      // Write metrics to file
      writeFileSync(path, JSON.stringify(metrics, null, 2));

      const size = this.getFileSize(path);

      const artifact: CapturedArtifact = {
        type: ArtifactCaptureType.PERFORMANCE_METRICS,
        path,
        mimeType: 'application/json',
        size,
        timestamp: new Date(),
        metadata: {
          ...metadata,
          testRunId: context.testRunId,
          testCaseId: context.testCaseId,
          testName: context.testName,
        },
      };

      logger.info(
        {
          path,
          size,
          summary: {
            hasTimings: !!metrics.timings,
            hasResources: !!metrics.resources,
            hasMemory: !!metrics.memory,
            hasNetwork: !!metrics.network,
          },
        },
        'Performance metrics captured successfully'
      );

      return artifact;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          path,
        },
        'Failed to capture performance metrics'
      );
      throw error;
    }
  }

  /**
   * Capture HAR (HTTP Archive) file
   */
  async captureHar(
    context: ArtifactCaptureContext,
    page: Page
  ): Promise<CapturedArtifact> {
    const path = this.generateArtifactPath(context, ArtifactCaptureType.HAR, 'har');

    logger.debug(
      {
        testRunId: context.testRunId,
        testCaseId: context.testCaseId,
      },
      'Capturing HAR file'
    );

    try {
      // Create HAR from collected network logs
      const contextId = context.testRunId + context.testCaseId;
      const networkLogs = this.networkRequests.get(contextId) ?? [];

      const har = {
        log: {
          version: '1.2',
          creator: {
            name: 'Playwright Artifact Capture Service',
            version: '1.0.0',
          },
          entries: networkLogs.map((log: any) => ({
            request: {
              method: log.method,
              url: log.url,
            },
            response: log.status ? {
              status: log.status,
              statusText: log.statusText ?? 'OK',
            } : undefined,
            timestamp: log.timestamp,
          })),
        },
      };

      writeFileSync(path, JSON.stringify(har, null, 2));

      const size = this.getFileSize(path);

      const artifact: CapturedArtifact = {
        type: ArtifactCaptureType.HAR,
        path,
        mimeType: 'application/json',
        size,
        timestamp: new Date(),
        metadata: {
          testRunId: context.testRunId,
          testCaseId: context.testCaseId,
          testName: context.testName,
          entryCount: networkLogs.length,
        },
      };

      logger.info(
        {
          path,
          size,
          entryCount: networkLogs.length,
        },
        'HAR file captured successfully'
      );

      return artifact;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          path,
        },
        'Failed to capture HAR file'
      );
      throw error;
    }
  }

  /**
   * Get file size or return 0 if file doesn't exist
   */
  private getFileSize(path: string): number {
    try {
      return statSync(path).size;
    } catch {
      return 0;
    }
  }

  /**
   * Get the current configuration
   */
  getConfig(): ArtifactCaptureConfig {
    return { ...this.config };
  }

  /**
   * Update the configuration
   */
  updateConfig(updates: Partial<ArtifactCaptureConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info({ config: this.config }, 'Artifact capture configuration updated');
  }

  /**
   * Cleanup artifacts for a test run
   */
  async cleanupArtifacts(testRunId: string): Promise<void> {
    const { unlinkSync, rmSync } = await import('node:fs');
    const testRunDir = join(this.config.baseDir, testRunId);

    if (existsSync(testRunDir)) {
      try {
        rmSync(testRunDir, { recursive: true, force: true });
        logger.info({ testRunId }, 'Cleaned up artifacts for test run');
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error.message : 'Unknown error',
            testRunId,
          },
          'Failed to cleanup artifacts'
        );
      }
    }
  }

  /**
   * Get artifact summary for a test run
   */
  async getArtifactSummary(testRunId: string): Promise<{
    totalArtifacts: number;
    totalSize: number;
    byType: Record<string, number>;
  }> {
    const { readdirSync, statSync } = await import('node:fs');
    const testRunDir = join(this.config.baseDir, testRunId);

    if (!existsSync(testRunDir)) {
      return {
        totalArtifacts: 0,
        totalSize: 0,
        byType: {},
      };
    }

    const summary = {
      totalArtifacts: 0,
      totalSize: 0,
      byType: {} as Record<string, number>,
    };

    const traverseDir = (dir: string) => {
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          traverseDir(fullPath);
        } else {
          const stats = statSync(fullPath);
          const ext = entry.name.split('.')[0];
          summary.totalArtifacts++;
          summary.totalSize += stats.size;
          summary.byType[ext] = (summary.byType[ext] ?? 0) + 1;
        }
      }
    };

    traverseDir(testRunDir);

    return summary;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    for (const contextId of this.pageContexts.keys()) {
      this.cleanupLogCollection(contextId);
    }
    this.pageContexts.clear();
    this.activeLoggers.clear();
    this.consoleLogs.clear();
    this.networkRequests.clear();
  }
}

/**
 * Global artifact capture service instance
 */
let globalArtifactService: ArtifactCaptureService | null = null;

/**
 * Get the global artifact capture service instance
 */
export function getGlobalArtifactService(config?: Partial<ArtifactCaptureConfig>): ArtifactCaptureService {
  if (!globalArtifactService) {
    globalArtifactService = new ArtifactCaptureService(config);
  }
  return globalArtifactService;
}

/**
 * Reset the global artifact capture service (useful for testing)
 */
export function resetGlobalArtifactService(): void {
  if (globalArtifactService) {
    globalArtifactService.destroy();
    globalArtifactService = null;
  }
}
