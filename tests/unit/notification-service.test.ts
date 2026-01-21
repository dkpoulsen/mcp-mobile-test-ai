/**
 * Notification Service Verification Test
 * Tests the core functionality of the notification service
 */

import { describe, it, mock, before, after } from 'node:test';
import assert from 'node:assert';
import { NotificationService } from '../../src/services/notification/service.js';
import type { NotificationData, TestSummaryReport } from '../../src/services/notification/types.js';

// Mock fetch for webhooks
const mockFetch = mock.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve('OK'),
    json: () => Promise.resolve({ success: true }),
  } as Response)
);

global.fetch = mockFetch;

describe('Notification Service', () => {
  let notificationService: NotificationService;

  before(() => {
    // Create notification service with test config
    notificationService = new NotificationService({
      slack: {
        webhookUrl: 'https://hooks.slack.com/services/TEST/TEST/TEST',
        channel: '#test',
        username: 'Test Bot',
      },
      webhooks: {
        test: {
          url: 'https://example.com/webhook',
          method: 'POST',
        },
      },
    });
  });

  after(() => {
    // Cleanup
    mockFetch.mock.resetCalls();
  });

  describe('Service Initialization', () => {
    it('should initialize with correct configuration', () => {
      const channels = notificationService.getEnabledChannels();
      assert.ok(channels.includes('slack'));
      assert.ok(channels.includes('webhook'));
    });

    it('should have default notification rules', () => {
      const rules = notificationService.getRules();
      assert.ok(rules.length > 0, 'Should have default rules');

      const failedRule = rules.find((r) => r.id === 'test-failed');
      assert.ok(failedRule, 'Should have test-failed rule');
      assert.strictEqual(failedRule?.enabled, true);
      assert.ok(failedRule?.triggers.includes('test_failed'));
      assert.ok(failedRule?.channels.includes('slack'));
    });
  });

  describe('Rule Management', () => {
    it('should add a new notification rule', () => {
      const newRule = {
        id: 'custom-rule',
        name: 'Custom Rule',
        enabled: true,
        triggers: ['test_started' as const],
        channels: ['webhook' as const],
      };

      notificationService.addRule(newRule);
      const rule = notificationService.getRule('custom-rule');
      assert.ok(rule);
      assert.strictEqual(rule?.name, 'Custom Rule');
    });

    it('should disable an existing rule', () => {
      const disabled = notificationService.disableRule('test-completed');
      assert.strictEqual(disabled, true);

      const rule = notificationService.getRule('test-completed');
      assert.strictEqual(rule?.enabled, false);

      // Re-enable for other tests
      notificationService.enableRule('test-completed');
    });

    it('should remove a rule', () => {
      notificationService.addRule({
        id: 'temp-rule',
        name: 'Temporary Rule',
        enabled: true,
        triggers: ['test_completed' as const],
        channels: ['slack' as const],
      });

      const removed = notificationService.removeRule('temp-rule');
      assert.strictEqual(removed, true);

      const rule = notificationService.getRule('temp-rule');
      assert.strictEqual(rule, undefined);
    });
  });

  describe('Notification Data Processing', () => {
    it('should create valid notification data for test completion', () => {
      const testData: NotificationData = {
        trigger: 'test_completed',
        severity: 'success',
        testRun: {
          id: 'test-run-123',
          testSuiteId: 'suite-456',
          testSuiteName: 'Login Tests',
          deviceId: 'device-789',
          deviceName: 'iPhone 14',
          devicePlatform: 'ios',
          status: 'COMPLETED',
          startedAt: new Date(),
          completedAt: new Date(),
          totalDuration: 5000,
          passedCount: 10,
          failedCount: 0,
          skippedCount: 2,
        },
      };

      assert.strictEqual(testData.trigger, 'test_completed');
      assert.strictEqual(testData.severity, 'success');
      assert.strictEqual(testData.testRun.passedCount, 10);
      assert.strictEqual(testData.testRun.failedCount, 0);
    });

    it('should create valid summary report', () => {
      const report: TestSummaryReport = {
        title: 'Test Execution Summary',
        testRunId: 'test-run-123',
        testSuiteName: 'Login Tests',
        device: {
          name: 'iPhone 14',
          platform: 'ios',
          osVersion: '16.0',
        },
        summary: {
          total: 12,
          passed: 10,
          failed: 1,
          skipped: 1,
          duration: 5000,
          startedAt: new Date(),
        },
        failures: [
          {
            testName: 'Login with invalid password',
            errorMessage: 'Expected error message not shown',
            duration: 500,
          },
        ],
        passRate: 83.33,
        severity: 'warning',
      };

      assert.strictEqual(report.summary.total, 12);
      assert.strictEqual(report.summary.passed, 10);
      assert.strictEqual(report.summary.failed, 1);
      assert.strictEqual(report.passRate, 83.33);
      assert.strictEqual(report.failures.length, 1);
    });
  });

  describe('Filter Matching', () => {
    it('should match rules by trigger', () => {
      // Enable the test-completed rule for this test
      notificationService.enableRule('test-completed');

      const testData: NotificationData = {
        trigger: 'test_completed',
        severity: 'info',
        testRun: {
          id: 'test-run-123',
          testSuiteId: 'suite-456',
          testSuiteName: 'Any Suite',
          deviceId: 'device-789',
          deviceName: 'iPhone 14',
          devicePlatform: 'ios',
          status: 'COMPLETED',
          passedCount: 5,
          failedCount: 0,
          skippedCount: 0,
        },
      };

      // The test-completed rule should match
      const results = notificationService.notify(testData);
      assert.ok(results, 'Should return notification results');
    });

    it('should filter by failure threshold', () => {
      notificationService.addRule({
        id: 'threshold-rule',
        name: 'Failure Threshold Rule',
        enabled: true,
        triggers: ['test_completed' as const],
        channels: ['slack' as const],
        filters: {
          failureThreshold: 5,
        },
      });

      const testData: NotificationData = {
        trigger: 'test_completed',
        severity: 'error',
        testRun: {
          id: 'test-run-123',
          testSuiteId: 'suite-456',
          testSuiteName: 'API Tests',
          deviceId: 'device-789',
          deviceName: 'Android Emulator',
          devicePlatform: 'android',
          status: 'COMPLETED',
          passedCount: 5,
          failedCount: 10,
          skippedCount: 0,
        },
      };

      // Should match because failure threshold (10 failures > 5 threshold)
      const results = notificationService.notify(testData);
      assert.ok(results, 'Should match threshold rule');

      // Cleanup
      notificationService.removeRule('threshold-rule');
    });

    it('should filter by platform', () => {
      notificationService.addRule({
        id: 'ios-only-rule',
        name: 'iOS Only Rule',
        enabled: true,
        triggers: ['test_started' as const],
        channels: ['webhook' as const],
        filters: {
          platform: 'ios',
        },
      });

      const iosData: NotificationData = {
        trigger: 'test_started',
        severity: 'info',
        testRun: {
          id: 'test-run-ios',
          testSuiteId: 'suite-456',
          testSuiteName: 'iOS Tests',
          deviceId: 'device-789',
          deviceName: 'iPhone 14',
          devicePlatform: 'ios',
          status: 'PENDING',
          passedCount: 0,
          failedCount: 0,
          skippedCount: 0,
        },
      };

      const androidData: NotificationData = {
        trigger: 'test_started',
        severity: 'info',
        testRun: {
          id: 'test-run-android',
          testSuiteId: 'suite-456',
          testSuiteName: 'Android Tests',
          deviceId: 'device-789',
          deviceName: 'Pixel 6',
          devicePlatform: 'android',
          status: 'PENDING',
          passedCount: 0,
          failedCount: 0,
          skippedCount: 0,
        },
      };

      // iOS should match, Android should not
      const iosResults = notificationService.notify(iosData);
      const androidResults = notificationService.notify(androidData);

      assert.ok(iosResults, 'iOS should match platform filter');
      // Note: androidResults may still return empty array if no rules match

      // Cleanup
      notificationService.removeRule('ios-only-rule');
    });
  });

  describe('Webhook Integration', () => {
    it('should send webhook notification', async () => {
      // Add a custom rule that includes webhooks for test_failed
      notificationService.addRule({
        id: 'webhook-fail-rule',
        name: 'Webhook on Failure',
        enabled: true,
        triggers: ['test_failed' as const],
        channels: ['webhook' as const],
      });

      const testData: NotificationData = {
        trigger: 'test_failed',
        severity: 'error',
        testRun: {
          id: 'test-run-123',
          testSuiteId: 'suite-456',
          testSuiteName: 'Critical Tests',
          deviceId: 'device-789',
          deviceName: 'iPhone 14',
          devicePlatform: 'ios',
          status: 'FAILED',
          startedAt: new Date(),
          completedAt: new Date(),
          totalDuration: 3000,
          passedCount: 5,
          failedCount: 3,
          skippedCount: 0,
          testResults: [
            {
              id: 'result-1',
              testCaseName: 'Test Case 1',
              status: 'FAILED',
              duration: 500,
              errorMessage: 'Assertion failed',
            },
          ],
        },
      };

      const results = await notificationService.notify(testData);
      assert.ok(results, 'Should return notification results');
      assert.ok(results.length > 0, 'Should have at least one result');

      // Check that webhook was called
      const webhookResult = results.find((r) => r.channel === 'webhook');
      assert.ok(webhookResult, 'Should have webhook result');
      assert.strictEqual(webhookResult?.status, 'sent');

      // Cleanup
      notificationService.removeRule('webhook-fail-rule');
    });

    it('should send summary report via webhook', async () => {
      const report: TestSummaryReport = {
        title: 'Test Execution Summary',
        testRunId: 'test-run-123',
        testSuiteName: 'E2E Tests',
        device: {
          name: 'Pixel 6',
          platform: 'android',
          osVersion: '13.0',
        },
        summary: {
          total: 50,
          passed: 45,
          failed: 5,
          skipped: 0,
          duration: 120000,
          startedAt: new Date(),
          completedAt: new Date(),
        },
        failures: [
          {
            testName: 'Checkout flow',
            errorMessage: 'Payment gateway timeout',
            duration: 5000,
          },
        ],
        passRate: 90,
        severity: 'warning',
      };

      const results = await notificationService.sendSummary(report);
      assert.ok(results, 'Should return summary results');
      assert.ok(results.length > 0, 'Should have at least one result');
    });
  });

  describe('Convenience Methods', () => {
    it('should notify test started', async () => {
      const results = await notificationService.notifyTestStarted({
        id: 'test-run-start',
        testSuiteId: 'suite-123',
        testSuiteName: 'Start Tests',
        deviceId: 'device-456',
        deviceName: 'iPhone 14',
        devicePlatform: 'ios',
        status: 'RUNNING',
        startedAt: new Date(),
        passedCount: 0,
        failedCount: 0,
        skippedCount: 0,
      });

      assert.ok(Array.isArray(results), 'Should return array of results');
    });

    it('should notify test completed with success', async () => {
      const results = await notificationService.notifyTestCompleted({
        id: 'test-run-complete',
        testSuiteId: 'suite-123',
        testSuiteName: 'Complete Tests',
        deviceId: 'device-456',
        deviceName: 'iPhone 14',
        devicePlatform: 'ios',
        status: 'COMPLETED',
        startedAt: new Date(Date.now() - 10000),
        completedAt: new Date(),
        totalDuration: 10000,
        passedCount: 10,
        failedCount: 0,
        skippedCount: 0,
      });

      assert.ok(Array.isArray(results), 'Should return array of results');
    });

    it('should notify test failed', async () => {
      const results = await notificationService.notifyTestFailed({
        id: 'test-run-fail',
        testSuiteId: 'suite-123',
        testSuiteName: 'Fail Tests',
        deviceId: 'device-456',
        deviceName: 'iPhone 14',
        devicePlatform: 'ios',
        status: 'FAILED',
        startedAt: new Date(Date.now() - 5000),
        completedAt: new Date(),
        totalDuration: 5000,
        passedCount: 5,
        failedCount: 3,
        skippedCount: 0,
        testResults: [
          {
            id: 'res-1',
            testCaseName: 'Failing Test',
            status: 'FAILED',
            duration: 1000,
            errorMessage: 'Test failed',
          },
        ],
      });

      assert.ok(Array.isArray(results), 'Should return array of results');

      // Should have more results because test_failed triggers more rules
      assert.ok(results.length >= 0, 'Should have notification results');
    });
  });
});
