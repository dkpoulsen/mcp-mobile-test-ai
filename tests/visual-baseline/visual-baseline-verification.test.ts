/**
 * Visual Baseline Verification Test
 *
 * This test verifies the core functionality of the visual baseline service.
 * Uses mocked page functionality for testing without browser dependencies.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, unlinkSync, rmSync, readFileSync, statSync } from 'node:fs';
import { VisualBaselineService } from '../../src/services/visual-baseline/index.js';

const TEST_BASELINE_DIR = 'test-visual-baselines';

describe('Visual Baseline Service - Verification Tests', () => {
  let visualBaselineService: VisualBaselineService;
  let mockPage: any;

  before(() => {
    // Clean up any existing test baselines
    if (existsSync(TEST_BASELINE_DIR)) {
      rmSync(TEST_BASELINE_DIR, { recursive: true, force: true });
    }
  });

  after(() => {
    // Clean up test baselines
    if (existsSync(TEST_BASELINE_DIR)) {
      rmSync(TEST_BASELINE_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Create a new service instance for each test
    visualBaselineService = new VisualBaselineService({
      baseDir: TEST_BASELINE_DIR,
      defaultAppMetadata: {
        appName: 'TestApp',
        appVersion: '1.0.0-test',
        environment: 'development',
      },
    });

    // Create mock page
    mockPage = {
      screenshot: async (options: any) => {
        const { writeFileSync } = await import('node:fs');
        const { join } = await import('node:path');
        const path = options.path || join(TEST_BASELINE_DIR, 'screenshot.png');
        // Create a minimal PNG file (1x1 transparent pixel)
        const minimalPng = Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
          0x00, 0x00, 0x00, 0x0d, // IHDR chunk length
          0x49, 0x48, 0x44, 0x52, // IHDR
          0x00, 0x00, 0x00, 0x01, // width: 1
          0x00, 0x00, 0x00, 0x01, // height: 1
          0x08, 0x06, 0x00, 0x00, 0x00, // bit depth, color type, etc.
          0x1f, 0x15, 0xc4, 0x89, // CRC
          0x00, 0x00, 0x00, 0x0a, // IDAT chunk length
          0x49, 0x44, 0x41, 0x54, // IDAT
          0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, // compressed data
          0x0d, 0x0a, 0x2d, 0xb4, // CRC
          0x00, 0x00, 0x00, 0x00, // IEND chunk length
          0x49, 0x45, 0x4e, 0x44, // IEND
          0xae, 0x42, 0x60, 0x82, // CRC
        ]);
        writeFileSync(path, minimalPng);
        return Buffer.from(minimalPng);
      },
      viewportSize: () => ({ width: 1920, height: 1080 }),
      evaluate: async (fn: any, ...args: any[]) => {
        // Return mock browser data
        return {
          pixelRatio: 1,
          userAgent: 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
          width: 1920,
          height: 1080,
        };
      },
      waitForSelector: async () => {},
      waitForTimeout: async (ms: number) => {},
      context: () => ({
        browser: () => ({
          browserType: () => ({ name: () => 'chromium' }),
          version: () => '120.0.0',
        }),
      }),
    };
  });

  afterEach(() => {
    // Clear service cache
    visualBaselineService.clearCache();
  });

  it('should create visual baseline service with default config', () => {
    const service = new VisualBaselineService();
    const config = service.getConfig();

    assert.strictEqual(config.baseDir, 'visual-baselines');
    assert.strictEqual(config.includeDeviceMetadata, true);
    assert.strictEqual(config.defaultScreenshotType, 'png');

    service.clearCache();
  });

  it('should create visual baseline service with custom config', () => {
    const service = new VisualBaselineService({
      baseDir: TEST_BASELINE_DIR,
      defaultAppMetadata: {
        appName: 'CustomApp',
        appVersion: '2.0.0',
        environment: 'production',
      },
      includeDeviceMetadata: false,
    });

    const config = service.getConfig();

    assert.strictEqual(config.baseDir, TEST_BASELINE_DIR);
    assert.strictEqual(config.defaultAppMetadata.appName, 'CustomApp');
    assert.strictEqual(config.includeDeviceMetadata, false);

    service.clearCache();
  });

  it('should capture visual baseline screenshot', async () => {
    const baseline = await visualBaselineService.captureBaseline(mockPage, 'test-run-001', {
      screenName: 'test-page',
      description: 'Test page for visual baseline verification',
      tags: ['test', 'verification'],
    });

    assert.ok(baseline);
    assert.strictEqual(baseline.screenName, 'test-page');
    assert.ok(baseline.id);
    assert.strictEqual(existsSync(baseline.imagePath), true);
    assert.strictEqual(existsSync(baseline.metadataPath), true);

    // Clean up files
    unlinkSync(baseline.imagePath);
    unlinkSync(baseline.metadataPath);
  });

  it('should capture baseline with metadata', async () => {
    const baseline = await visualBaselineService.captureBaseline(mockPage, 'test-run-002', {
      screenName: 'metadata-test',
      description: 'Test metadata capture',
      customMetadata: { testKey: 'testValue' },
    });

    assert.strictEqual(existsSync(baseline.metadataPath), true);

    const metadataContent = JSON.parse(readFileSync(baseline.metadataPath, 'utf-8'));

    assert.strictEqual(metadataContent.screenName, 'metadata-test');
    assert.strictEqual(metadataContent.testRunId, 'test-run-002');
    assert.ok(metadataContent.device);
    assert.strictEqual(metadataContent.device.deviceType, 'desktop');
    assert.ok(metadataContent.device.os);
    assert.strictEqual(metadataContent.device.browser, 'chromium');
    assert.ok(metadataContent.device.viewport);
    assert.strictEqual(metadataContent.device.viewport.width, 1920);
    assert.ok(metadataContent.appVersion);
    assert.strictEqual(metadataContent.appVersion.appName, 'TestApp');
    assert.strictEqual(metadataContent.appVersion.appVersion, '1.0.0-test');
    assert.ok(metadataContent.timestamp);
    assert.ok(metadataContent.custom);
    assert.strictEqual(metadataContent.custom.testKey, 'testValue');

    // Clean up files
    unlinkSync(baseline.imagePath);
    unlinkSync(baseline.metadataPath);
  });

  it('should include file size and dimensions in baseline', async () => {
    const baseline = await visualBaselineService.captureBaseline(mockPage, 'test-run-003', {
      screenName: 'size-dimensions-test',
    });

    assert.ok(baseline.fileSize);
    assert.ok(baseline.fileSize > 0);
    assert.ok(baseline.dimensions);
    assert.strictEqual(baseline.dimensions.width, 1);
    assert.strictEqual(baseline.dimensions.height, 1);

    // Clean up files
    unlinkSync(baseline.imagePath);
    unlinkSync(baseline.metadataPath);
  });

  it('should store and retrieve baseline from cache', async () => {
    const baseline = await visualBaselineService.captureBaseline(mockPage, 'test-run-004', {
      screenName: 'cache-test',
    });

    const retrieved = visualBaselineService.loadBaseline(baseline.id);

    assert.ok(retrieved);
    assert.strictEqual(retrieved?.id, baseline.id);
    assert.strictEqual(retrieved?.screenName, 'cache-test');

    // Clean up files
    unlinkSync(baseline.imagePath);
    unlinkSync(baseline.metadataPath);
  });

  it('should load baseline from file', async () => {
    const baseline = await visualBaselineService.captureBaseline(mockPage, 'test-run-005', {
      screenName: 'load-file-test',
    });

    // Clear the cache
    visualBaselineService.clearCache();

    // Load baseline from file
    const loadedBaseline = visualBaselineService.loadBaselineFromFile(baseline.imagePath);

    assert.ok(loadedBaseline);
    assert.strictEqual(loadedBaseline?.screenName, 'load-file-test');
    assert.strictEqual(loadedBaseline?.imagePath, baseline.imagePath);
    assert.strictEqual(loadedBaseline?.metadataPath, baseline.metadataPath);
    assert.strictEqual(loadedBaseline?.metadata.screenName, 'load-file-test');

    // Clean up files
    unlinkSync(baseline.imagePath);
    unlinkSync(baseline.metadataPath);
  });

  it('should find baselines by screen name', async () => {
    await visualBaselineService.captureBaseline(mockPage, 'test-run-006', {
      screenName: 'same-screen',
    });

    await visualBaselineService.captureBaseline(mockPage, 'test-run-007', {
      screenName: 'different-screen',
    });

    await visualBaselineService.captureBaseline(mockPage, 'test-run-008', {
      screenName: 'same-screen',
    });

    const sameScreenBaselines = visualBaselineService.findBaselinesByScreen('same-screen');
    const differentBaselines = visualBaselineService.findBaselinesByScreen('different-screen');

    assert.strictEqual(sameScreenBaselines.length, 2);
    assert.strictEqual(differentBaselines.length, 1);

    // Clean up files
    for (const b of [...sameScreenBaselines, ...differentBaselines]) {
      if (existsSync(b.imagePath)) unlinkSync(b.imagePath);
      if (existsSync(b.metadataPath)) unlinkSync(b.metadataPath);
    }
  });

  it('should list all baselines', async () => {
    await visualBaselineService.captureBaseline(mockPage, 'test-run-009', {
      screenName: 'list-test-1',
    });

    await visualBaselineService.captureBaseline(mockPage, 'test-run-010', {
      screenName: 'list-test-2',
    });

    const allBaselines = visualBaselineService.listBaselines();

    assert.ok(allBaselines.length >= 2);

    // Clean up files
    for (const b of allBaselines) {
      if (existsSync(b.imagePath)) unlinkSync(b.imagePath);
      if (existsSync(b.metadataPath)) unlinkSync(b.metadataPath);
    }
  });

  it('should update configuration dynamically', () => {
    assert.strictEqual(visualBaselineService.getConfig().includeDeviceMetadata, true);

    visualBaselineService.updateConfig({
      includeDeviceMetadata: false,
      defaultFullPage: true,
    });

    assert.strictEqual(visualBaselineService.getConfig().includeDeviceMetadata, false);
    assert.strictEqual(visualBaselineService.getConfig().defaultFullPage, true);
  });

  it('should return undefined for non-existent baseline', () => {
    const result = visualBaselineService.loadBaseline('non-existent-id');
    assert.strictEqual(result, undefined);
  });

  it('should return undefined for non-existent file', () => {
    const result = visualBaselineService.loadBaselineFromFile('/non/existent/path.png');
    assert.strictEqual(result, undefined);
  });

  it('should create baseline directory if it does not exist', () => {
    const uniqueDir = `test-visual-baselines-${Date.now()}`;
    const service = new VisualBaselineService({
      baseDir: uniqueDir,
    });

    assert.strictEqual(existsSync(uniqueDir), true);

    // Clean up
    rmSync(uniqueDir, { recursive: true, force: true });
    service.clearCache();
  });

  it('should sanitize screen names for filenames', async () => {
    const baseline = await visualBaselineService.captureBaseline(mockPage, 'test-run-011', {
      screenName: 'test/screen:with?special*chars',
    });

    // The filename should be sanitized (special chars replaced with underscores)
    assert.ok(baseline.imagePath.includes('test_screen_with_special_chars'));

    // Clean up files
    unlinkSync(baseline.imagePath);
    unlinkSync(baseline.metadataPath);
  });

  it('should use custom path when provided', async () => {
    const customPath = `${TEST_BASELINE_DIR}/custom-screenshot.png`;
    const baseline = await visualBaselineService.captureBaseline(mockPage, 'test-run-012', {
      screenName: 'custom-path-test',
      path: customPath,
    });

    assert.strictEqual(baseline.imagePath, customPath);
    assert.strictEqual(existsSync(customPath), true);

    // Clean up files
    unlinkSync(baseline.imagePath);
    unlinkSync(baseline.metadataPath);
  });
});
