/**
 * Playwright artifact collector - integrates with Playwright test framework
 * Provides fixtures and utilities for capturing artifacts during tests
 */

import { test as base } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { getGlobalArtifactService } from './artifact-capture.js';
import type {
  ArtifactCaptureContext,
  ArtifactCaptureType,
  CapturedArtifact,
  ScreenshotCaptureOptions,
} from './types.js';

/**
 * Artifact collector options
 */
export interface ArtifactCollectorOptions {
  /** Base directory for storing artifacts */
  baseDir?: string;
  /** Whether to capture screenshots on failure */
  captureScreenshotOnFailure?: boolean;
  /** Whether to capture video on failure */
  captureVideoOnFailure?: boolean;
  /** Whether to capture traces on failure */
  captureTraceOnFailure?: boolean;
  /** Whether to capture device logs on failure */
  captureLogsOnFailure?: boolean;
  /** Whether to capture performance metrics on failure */
  captureMetricsOnFailure?: boolean;
}

/**
 * Test fixture with artifact capture capabilities
 */
export interface ArtifactCollectorFixture {
  /** Capture a screenshot with metadata */
  captureScreenshot(options?: ScreenshotCaptureOptions): Promise<CapturedArtifact>;
  /** Capture device logs */
  captureDeviceLogs(): Promise<CapturedArtifact>;
  /** Capture performance metrics */
  capturePerformanceMetrics(): Promise<CapturedArtifact>;
  /** Get the current test context */
  getContext(): ArtifactCaptureContext;
  /** Get all captured artifacts for the current test */
  getCapturedArtifacts(): CapturedArtifact[];
  /** Clear captured artifacts for the current test */
  clearCapturedArtifacts(): void;
  /** Add custom metadata to the current test */
  addMetadata(key: string, value: unknown): void;
}

/**
 * Extended test fixture with artifact collector
 */
type TestWithArtifactCollector = typeof base & {
  artifactCapture: ArtifactCollectorFixture;
};

/**
 * Map to store artifacts per test
 */
const testArtifacts = new Map<string, CapturedArtifact[]>();

/**
 * Map to store test metadata
 */
const testMetadata = new Map<string, Record<string, unknown>>();

/**
 * Map to store test contexts
 */
const testContexts = new Map<string, ArtifactCaptureContext>();

/**
 * Create a test fixture with artifact capture capabilities
 */
export function createArtifactCollector(options: ArtifactCollectorOptions = {}) {
  const artifactService = getGlobalArtifactService({
    baseDir: options.baseDir ?? 'test-artifacts',
    captureScreenshotOnFailure: options.captureScreenshotOnFailure ?? true,
    captureVideo: false,
    captureTrace: false,
    captureHar: false,
    captureDeviceLogs: true,
    capturePerformanceMetrics: true,
  });

  /**
   * Get or create context for current test
   */
  const getContext = (testInfo: Parameters<typeof base['extend']>[0]): ArtifactCaptureContext => {
    let context = testContexts.get(testInfo.testId);

    if (!context) {
      context = {
        testRunId: testInfo.testId,
        testCaseId: testInfo.testId,
        testName: testInfo.title,
        baseDir: options.baseDir ?? 'test-artifacts',
        metadata: {},
      };
      testContexts.set(testInfo.testId, context);
    }

    return context;
  };

  /**
   * Artifact collector fixture
   */
  const artifactCollectorFixture = base.extend<ArtifactCollectorFixture>({
    artifactCapture: async ({ page }, use, testInfo) => {
      const contextId = testInfo.testId;
      const context = getContext(testInfo);

      // Register page with artifact service
      artifactService.registerPage(contextId, page);

      // Initialize artifacts array for this test
      if (!testArtifacts.has(contextId)) {
        testArtifacts.set(contextId, []);
      }

      const fixture: ArtifactCollectorFixture = {
        captureScreenshot: async (options?: ScreenshotCaptureOptions) => {
          const artifact = await artifactService.captureScreenshot(context, page, options);
          testArtifacts.get(contextId)?.push(artifact);
          return artifact;
        },

        captureDeviceLogs: async () => {
          const artifact = await artifactService.captureDeviceLogs(context, contextId);
          testArtifacts.get(contextId)?.push(artifact);
          return artifact;
        },

        capturePerformanceMetrics: async () => {
          const artifact = await artifactService.capturePerformanceMetrics(context, page);
          testArtifacts.get(contextId)?.push(artifact);
          return artifact;
        },

        getContext: () => context,

        getCapturedArtifacts: () => testArtifacts.get(contextId) ?? [],

        clearCapturedArtifacts: () => {
          testArtifacts.set(contextId, []);
        },

        addMetadata: (key: string, value: unknown) => {
          const metadata = testMetadata.get(contextId) ?? {};
          metadata[key] = value;
          testMetadata.set(contextId, metadata);
          context.metadata = metadata;
        },
      };

      await use(fixture);

      // Cleanup
      artifactService.unregisterPage(contextId);
    },
  });

  return artifactCollectorFixture;
}

/**
 * Create a test with automatic artifact capture on failure
 */
export function createTestWithArtifacts(options: ArtifactCollectorOptions = {}) {
  const testWithArtifacts = createArtifactCollector(options);

  return testWithArtifacts.extend<{}>({
    // Add automatic artifact capture on test failure
  }).extend<{ _autoCapture: void }>({
    _autoCapture: async ({ page, artifactCapture }, use, testInfo) => {
      // Set up failure handler
      testInfo.on('failed', async () => {
        const artifacts: CapturedArtifact[] = [];

        // Capture screenshot on failure if enabled
        if (options.captureScreenshotOnFailure !== false) {
          try {
            const screenshot = await artifactCapture.captureScreenshot({
              metadata: {
                trigger: 'test_failure',
                status: testInfo.status,
                error: testInfo.error?.message,
              },
            });
            artifacts.push(screenshot);
            testInfo.attachments.push({
              name: 'screenshot',
              path: screenshot.path,
              contentType: screenshot.mimeType,
            });
          } catch (error) {
            console.error('Failed to capture screenshot on failure:', error);
          }
        }

        // Capture logs on failure if enabled
        if (options.captureLogsOnFailure !== false) {
          try {
            const logs = await artifactCapture.captureDeviceLogs();
            artifacts.push(logs);
            testInfo.attachments.push({
              name: 'device-logs',
              path: logs.path,
              contentType: logs.mimeType,
            });
          } catch (error) {
            console.error('Failed to capture device logs on failure:', error);
          }
        }

        // Capture performance metrics on failure if enabled
        if (options.captureMetricsOnFailure !== false) {
          try {
            const metrics = await artifactCapture.capturePerformanceMetrics();
            artifacts.push(metrics);
            testInfo.attachments.push({
              name: 'performance-metrics',
              path: metrics.path,
              contentType: metrics.mimeType,
            });
          } catch (error) {
            console.error('Failed to capture performance metrics on failure:', error);
          }
        }

        // Add metadata about the failure
        artifactCapture.addMetadata('failureCaptured', true);
        artifactCapture.addMetadata('failureReason', testInfo.error?.message);
        artifactCapture.addMetadata('failureTimestamp', new Date().toISOString());
      });

      await use();
    },
  });
}

/**
 * Export the default test with artifact capture
 */
export const test = createTestWithArtifacts({
  baseDir: 'test-artifacts',
  captureScreenshotOnFailure: true,
  captureLogsOnFailure: true,
  captureMetricsOnFailure: true,
});

/**
 * Export the expect function from the test
 */
export const expect = test.expect;
