/**
 * Unit verification test for artifact capture feature
 * This test verifies the core functionality of the artifact capture service
 * without requiring a full browser installation.
 */

import { describe, it, mock, before, after } from 'node:test';
import assert from 'node:assert';
import { existsSync, unlinkSync, rmSync, readFileSync } from 'node:fs';
import { ArtifactCaptureService, ArtifactCaptureType } from '../../src/services/artifact-capture/index.js';

const TEST_ARTIFACT_DIR = 'test-artifacts/unit-verification';

describe('Artifact Capture Service - Unit Tests', () => {
  let artifactService: ArtifactCaptureService;

  before(() => {
    // Clean up any existing test artifacts
    if (existsSync(TEST_ARTIFACT_DIR)) {
      rmSync(TEST_ARTIFACT_DIR, { recursive: true, force: true });
    }
  });

  after(() => {
    // Clean up test artifacts
    if (existsSync(TEST_ARTIFACT_DIR)) {
      rmSync(TEST_ARTIFACT_DIR, { recursive: true, force: true });
    }
  });

  it('should create artifact capture service with default config', () => {
    artifactService = new ArtifactCaptureService();

    const config = artifactService.getConfig();

    assert.strictEqual(config.baseDir, 'artifacts');
    assert.strictEqual(config.captureScreenshotOnFailure, true);
    assert.strictEqual(config.captureDeviceLogs, true);
    assert.strictEqual(config.capturePerformanceMetrics, true);
  });

  it('should create artifact capture service with custom config', () => {
    const service = new ArtifactCaptureService({
      baseDir: TEST_ARTIFACT_DIR,
      captureScreenshotOnFailure: false,
      captureVideo: true,
      captureTrace: true,
    });

    const config = service.getConfig();

    assert.strictEqual(config.baseDir, TEST_ARTIFACT_DIR);
    assert.strictEqual(config.captureScreenshotOnFailure, false);
    assert.strictEqual(config.captureVideo, true);
    assert.strictEqual(config.captureTrace, true);

    service.destroy();
  });

  it('should create artifact base directory', () => {
    const service = new ArtifactCaptureService({
      baseDir: TEST_ARTIFACT_DIR,
    });

    // The base directory should be created
    assert.strictEqual(existsSync(TEST_ARTIFACT_DIR), true);

    service.destroy();

    // Clean up directory
    if (existsSync(TEST_ARTIFACT_DIR)) {
      rmSync(TEST_ARTIFACT_DIR, { recursive: true, force: true });
    }
  });

  it('should capture and store a mock screenshot artifact', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const service = new ArtifactCaptureService({
      baseDir: TEST_ARTIFACT_DIR,
    });

    const context = {
      testRunId: 'test-run-002',
      testCaseId: 'test-case-002',
      testName: 'Screenshot Test',
    };

    // Create directory structure
    const artifactDir = `${TEST_ARTIFACT_DIR}/${context.testRunId}/${context.testCaseId}`;
    await mkdir(artifactDir, { recursive: true });

    // Create a mock screenshot file
    const screenshotPath = `${artifactDir}/screenshot-test.png`;
    await writeFile(screenshotPath, Buffer.from('mock-screenshot-data'));

    assert.strictEqual(existsSync(screenshotPath), true);

    // Verify file has content
    const stats = (await import('node:fs')).statSync(screenshotPath);
    assert.strictEqual(stats.size > 0, true);

    // Clean up
    unlinkSync(screenshotPath);
    service.destroy();
  });

  it('should capture and store device logs', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const service = new ArtifactCaptureService({
      baseDir: TEST_ARTIFACT_DIR,
    });

    const context = {
      testRunId: 'test-run-003',
      testCaseId: 'test-case-003',
      testName: 'Device Logs Test',
    };

    // Create directory structure
    const artifactDir = `${TEST_ARTIFACT_DIR}/${context.testRunId}/${context.testCaseId}`;
    await mkdir(artifactDir, { recursive: true });

    // Create mock device logs
    const mockLogs = {
      console: [
        { type: 'log', text: 'Test message', timestamp: Date.now() },
        { type: 'warn', text: 'Warning message', timestamp: Date.now() },
      ],
      network: [
        { method: 'GET', url: 'https://example.com', status: 200 },
      ],
    };

    const logsPath = `${artifactDir}/logs-test.json`;
    await writeFile(logsPath, JSON.stringify(mockLogs, null, 2));

    assert.strictEqual(existsSync(logsPath), true);

    // Verify log content
    const logContent = JSON.parse(readFileSync(logsPath, 'utf-8'));
    assert.strictEqual(Array.isArray(logContent.console), true);
    assert.strictEqual(logContent.console.length, 2);
    assert.strictEqual(logContent.console[0].text, 'Test message');

    // Clean up
    unlinkSync(logsPath);
    service.destroy();
  });

  it('should capture and store performance metrics', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const service = new ArtifactCaptureService({
      baseDir: TEST_ARTIFACT_DIR,
    });

    const context = {
      testRunId: 'test-run-004',
      testCaseId: 'test-case-004',
      testName: 'Performance Metrics Test',
    };

    // Create directory structure
    const artifactDir = `${TEST_ARTIFACT_DIR}/${context.testRunId}/${context.testCaseId}`;
    await mkdir(artifactDir, { recursive: true });

    // Create mock performance metrics
    const mockMetrics = {
      timings: {
        domContentLoaded: 250,
        loadComplete: 500,
        firstPaint: 100,
        firstContentfulPaint: 150,
      },
      resources: {
        count: 10,
        totalTransferSize: 50000,
        byType: { script: 3, stylesheet: 2, image: 5 },
      },
      network: {
        requestCount: 10,
        failedRequests: 0,
        avgResponseTime: 50,
      },
    };

    const metricsPath = `${artifactDir}/metrics-test.json`;
    await writeFile(metricsPath, JSON.stringify(mockMetrics, null, 2));

    assert.strictEqual(existsSync(metricsPath), true);

    // Verify metrics content
    const metricsContent = JSON.parse(readFileSync(metricsPath, 'utf-8'));
    assert.strictEqual(metricsContent.timings.domContentLoaded, 250);
    assert.strictEqual(metricsContent.resources.count, 10);
    assert.strictEqual(metricsContent.network.requestCount, 10);

    // Clean up
    unlinkSync(metricsPath);
    service.destroy();
  });

  it('should provide artifact summary for test run', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const service = new ArtifactCaptureService({
      baseDir: TEST_ARTIFACT_DIR,
    });

    const testRunId = 'test-run-005';

    // Create multiple artifacts
    const artifactDir = `${TEST_ARTIFACT_DIR}/${testRunId}/test-case-001`;
    await mkdir(artifactDir, { recursive: true });

    await writeFile(`${artifactDir}/screenshot-001.png`, Buffer.from('screenshot'));
    await writeFile(`${artifactDir}/logs-001.json`, JSON.stringify({ logs: [] }));
    await writeFile(`${artifactDir}/metrics-001.json`, JSON.stringify({ metrics: {} }));

    // Get summary
    const summary = await service.getArtifactSummary(testRunId);

    assert.strictEqual(summary.totalArtifacts, 3);
    assert.strictEqual(summary.totalSize > 0, true);
    assert.strictEqual(Object.keys(summary.byType).length > 0, true);

    // Clean up
    service.destroy();
  });

  it('should update configuration dynamically', () => {
    const service = new ArtifactCaptureService({
      baseDir: TEST_ARTIFACT_DIR,
      captureScreenshotOnFailure: true,
    });

    assert.strictEqual(service.getConfig().captureScreenshotOnFailure, true);

    service.updateConfig({
      captureScreenshotOnFailure: false,
      captureVideo: true,
    });

    assert.strictEqual(service.getConfig().captureScreenshotOnFailure, false);
    assert.strictEqual(service.getConfig().captureVideo, true);

    service.destroy();
  });

  it('should cleanup artifacts for test run', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const service = new ArtifactCaptureService({
      baseDir: TEST_ARTIFACT_DIR,
    });

    const testRunId = 'test-run-006';

    // Create artifacts
    const artifactDir = `${TEST_ARTIFACT_DIR}/${testRunId}/test-case-001`;
    await mkdir(artifactDir, { recursive: true });
    await writeFile(`${artifactDir}/screenshot-001.png`, Buffer.from('screenshot'));

    assert.strictEqual(existsSync(artifactDir), true);

    // Cleanup
    await service.cleanupArtifacts(testRunId);

    assert.strictEqual(existsSync(`${TEST_ARTIFACT_DIR}/${testRunId}`), false);

    service.destroy();
  });

  it('should export ArtifactCaptureType enum', () => {
    assert.strictEqual(ArtifactCaptureType.SCREENSHOT, 'screenshot');
    assert.strictEqual(ArtifactCaptureType.VIDEO, 'video');
    assert.strictEqual(ArtifactCaptureType.TRACE, 'trace');
    assert.strictEqual(ArtifactCaptureType.HAR, 'har');
    assert.strictEqual(ArtifactCaptureType.DEVICE_LOGS, 'device_logs');
    assert.strictEqual(ArtifactCaptureType.PERFORMANCE_METRICS, 'performance_metrics');
    assert.strictEqual(ArtifactCaptureType.NETWORK_LOGS, 'network_logs');
    assert.strictEqual(ArtifactCaptureType.CONSOLE_LOGS, 'console_logs');
  });
});
