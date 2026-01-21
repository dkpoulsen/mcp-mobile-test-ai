/**
 * Flaky Test Manager Service
 * Orchestrates flaky test detection, quarantine, and notifications
 */

import type {
  FlakyTestManagerConfig,
  DetectionRunResult,
  FlakyTestSummaryReport,
} from './types.js';
import type { PrismaClient } from '@prisma/client';
import type { FlakyTestEvent, FlakinessAnalysis } from '../flaky-test-detector/types.js';
import { FlakyTestDetector } from '../flaky-test-detector/flaky-test-detector.js';
import { NotificationService } from '../notification/service.js';
import {
  generateFlakyTestSlackMessage,
  generateFlakyTestEmailHtml,
  generateFlakyTestEmailText,
  generateFlakyTestSubject,
  generateFlakyTestWebhookPayload,
} from '../notification/templates.js';
import { createModuleLogger } from '../../utils/logger.js';
import type { Logger } from '../../utils/logger.js';
import { getNotificationService } from '../notification/service.js';

/**
 * Flaky test manager service
 */
export class FlakyTestManager {
  private readonly logger: Logger;
  private readonly detector: FlakyTestDetector;
  private readonly notificationService: NotificationService | null;
  private readonly config: Required<FlakyTestManagerConfig>;

  constructor(
    private prisma: PrismaClient,
    config: FlakyTestManagerConfig = {}
  ) {
    this.logger = createModuleLogger('services:flaky-test-manager');
    this.config = {
      detector: config.detector ?? {},
      notifications: config.notifications ?? {},
      autoDetectEnabled: config.autoDetectEnabled ?? true,
      autoDetectInterval: config.autoDetectInterval ?? 300000, // 5 minutes
      notificationsEnabled: config.notificationsEnabled ?? true,
      defaultTeam: config.defaultTeam ?? undefined,
    };

    this.detector = new FlakyTestDetector(this.prisma, {
      ...this.config.detector,
      defaultTeam: this.config.defaultTeam,
    });

    this.notificationService = this.config.notificationsEnabled
      ? (getNotificationService() ?? null)
      : null;
  }

  /**
   * Run detection for all tests or a specific test suite
   */
  async runDetection(testSuiteId?: string): Promise<DetectionRunResult> {
    this.logger.info(`Running flaky test detection${testSuiteId ? ` for suite: ${testSuiteId}` : ''}`);

    const startTime = Date.now();
    const events = await this.detector.detectFlakyTests(testSuiteId);

    // Process events and send notifications
    for (const event of events) {
      await this.processFlakyTestEvent(event);
    }

    // Auto-promote stabilized tests if enabled
    let promoted = 0;
    if (this.config.detector?.autoPromote !== false) {
      const promotionEvents = await this.autoPromoteStabilizedTests();
      promoted = promotionEvents.length;

      for (const event of promotionEvents) {
        await this.processFlakyTestEvent(event);
      }
    }

    // Count events by type
    const flakyDetected = events.filter((e) => e.type === 'detected').length;
    const quarantined = events.filter((e) => e.type === 'quarantined').length;

    const result: DetectionRunResult = {
      analyzedCount: events.length,
      flakyDetected,
      quarantined,
      promoted,
      events: events.map((e) => ({
        type: e.type,
        testCaseId: e.testCaseId,
        testCaseName: e.testCaseName,
        testSuiteName: e.testSuiteName,
      })),
      timestamp: new Date(),
    };

    this.logger.info('Flaky test detection complete', {
      analyzedCount: result.analyzedCount,
      flakyDetected,
      quarantined,
      promoted,
      duration: Date.now() - startTime,
    });

    return result;
  }

  /**
   * Process a flaky test event and send notifications
   */
  async processFlakyTestEvent(event: FlakyTestEvent): Promise<void> {
    if (!this.notificationService) {
      this.logger.debug('Notification service not available, skipping notification');
      return;
    }

    try {
      // Send notification based on event type
      const trigger = `flaky_test_${event.type}` as const;

      // For Slack
      if (this.notificationService['slack']) {
        const slackMessage = generateFlakyTestSlackMessage(event);
        await this.notificationService.sendToChannel('slack', {
          trigger,
          severity: event.type === 'quarantined' ? 'error' : 'warning',
          testRun: {
            id: event.testCaseId,
            testSuiteId: event.testSuiteId,
            testSuiteName: event.testSuiteName,
            deviceId: '',
            deviceName: 'N/A',
            devicePlatform: 'ios',
            status: event.type.toUpperCase(),
            passedCount: event.analysis.passCount,
            failedCount: event.analysis.failCount,
            skippedCount: 0,
          },
          metadata: {
            blocks: slackMessage.blocks,
          },
        });
      }

      // For Email
      if (this.notificationService['email']) {
        const emailHtml = generateFlakyTestEmailHtml(event);
        const emailText = generateFlakyTestEmailText(event);
        const emailSubject = generateFlakyTestSubject(event);

        await this.notificationService.sendToChannel('email', {
          trigger,
          severity: event.type === 'quarantined' ? 'error' : 'warning',
          testRun: {
            id: event.testCaseId,
            testSuiteId: event.testSuiteId,
            testSuiteName: event.testSuiteName,
            deviceId: '',
            deviceName: 'N/A',
            devicePlatform: 'ios',
            status: event.type.toUpperCase(),
            passedCount: event.analysis.passCount,
            failedCount: event.analysis.failCount,
            skippedCount: 0,
          },
          metadata: {
            subject: emailSubject,
            html: emailHtml,
            text: emailText,
          },
        });
      }

      // For Webhook
      if (this.notificationService['webhooks']) {
        const webhookPayload = generateFlakyTestWebhookPayload(event);
        await this.notificationService.sendToChannel('webhook', {
          trigger,
          severity: event.type === 'quarantined' ? 'error' : 'warning',
          testRun: {
            id: event.testCaseId,
            testSuiteId: event.testSuiteId,
            testSuiteName: event.testSuiteName,
            deviceId: '',
            deviceName: 'N/A',
            devicePlatform: 'ios',
            status: event.type.toUpperCase(),
            passedCount: event.analysis.passCount,
            failedCount: event.analysis.failCount,
            skippedCount: 0,
          },
          metadata: webhookPayload,
        });
      }

      this.logger.info(`Sent notification for flaky test event: ${event.type}`, {
        testCaseId: event.testCaseId,
      });
    } catch (error) {
      this.logger.error('Failed to send notification for flaky test event', {
        error: error instanceof Error ? error.message : String(error),
        testCaseId: event.testCaseId,
        eventType: event.type,
      });
    }
  }

  /**
   * Auto-promote stabilized tests from quarantine
   */
  async autoPromoteStabilizedTests(): Promise<FlakyTestEvent[]> {
    this.logger.info('Checking for stabilized tests to auto-promote');

    // Get all active quarantines
    const quarantines = await this.prisma.testQuarantine.findMany({
      where: { status: 'ACTIVE' },
      include: {
        testCase: { include: { testSuite: true } },
      },
    });

    const promotedEvents: FlakyTestEvent[] = [];

    for (const quarantine of quarantines) {
      const eligibility = await this.detector.checkPromotionEligibility(quarantine.testCaseId);

      if (eligibility.isEligible) {
        const promoted = await this.detector.promoteTest(quarantine.testCaseId);

        if (promoted) {
          // Get the latest analysis
          const analysis = await this.detector.analyzeTest(quarantine.testCaseId);

          promotedEvents.push({
            type: 'promoted',
            testCaseId: quarantine.testCaseId,
            testSuiteId: quarantine.testSuiteId,
            testCaseName: quarantine.testCase.name,
            testSuiteName: quarantine.testCase.testSuite.name,
            analysis: analysis ?? {
              isFlaky: false,
              flakinessScore: 0,
              confidence: 'low',
              totalRuns: 0,
              passCount: eligibility.consecutivePasses,
              failCount: 0,
              passRate: 100,
              recentPattern: 'P'.repeat(eligibility.consecutivePasses),
              failurePatterns: [],
              suggestedFixes: [],
              shouldQuarantine: false,
              reason: eligibility.reason,
            },
            assignedTeam: quarantine.assignedTeam ?? undefined,
            timestamp: new Date(),
          });

          this.logger.info(`Auto-promoted test from quarantine: ${quarantine.testCaseId}`);
        }
      }
    }

    return promotedEvents;
  }

  /**
   * Manually quarantine a test
   */
  async quarantineTest(
    testCaseId: string,
    reason: string,
    options?: {
      category?: 'FLAKY' | 'TIMEOUT' | 'ENVIRONMENT' | 'DEPRECATED' | 'UNDER_REVIEW';
      assignedTeam?: string;
    }
  ): Promise<boolean> {
    this.logger.info(`Manually quarantining test: ${testCaseId}`);

    const testCase = await this.prisma.testCase.findUnique({
      where: { id: testCaseId },
      include: { testSuite: true },
    });

    if (!testCase) {
      this.logger.warn(`Test case not found: ${testCaseId}`);
      return false;
    }

    // Create quarantine
    await this.prisma.testQuarantine.create({
      data: {
        testCaseId,
        testSuiteId: testCase.testSuiteId,
        status: 'ACTIVE',
        reason,
        category: options?.category ?? 'FLAKY',
        detectionMethod: 'manual',
        assignedTeam: options?.assignedTeam ?? this.config.defaultTeam,
      },
    });

    // Update flaky test if exists
    const existingFlaky = await this.prisma.flakyTest.findUnique({
      where: { testCaseId },
    });

    if (existingFlaky) {
      await this.prisma.flakyTest.update({
        where: { id: existingFlaky.id },
        data: { status: 'QUARANTINED' },
      });
    }

    return true;
  }

  /**
   * Manually promote a test from quarantine
   */
  async promoteTest(testCaseId: string): Promise<boolean> {
    this.logger.info(`Manually promoting test: ${testCaseId}`);
    return this.detector.promoteTest(testCaseId);
  }

  /**
   * Get flaky test summary report
   */
  async getSummaryReport(testSuiteId?: string): Promise<FlakyTestSummaryReport> {
    const stats = await this.detector.getStatistics(testSuiteId);

    // Get most flaky tests
    const mostFlaky = await this.prisma.flakyTest.findMany({
      where: testSuiteId ? { testSuiteId } : undefined,
      include: {
        testCase: { include: { testSuite: true } },
      },
      orderBy: { flakinessScore: 'desc' },
      take: 10,
    });

    // Get recently quarantined
    const recentlyQuarantined = await this.prisma.testQuarantine.findMany({
      where: {
        ...testSuiteId ? { testSuiteId } : {},
        status: 'ACTIVE',
      },
      include: {
        testCase: { include: { testSuite: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Get tests ready for promotion
    const readyForPromotion: FlakyTestSummaryReport['readyForPromotion'] = [];
    for (const quarantine of recentlyQuarantined) {
      const eligibility = await this.detector.checkPromotionEligibility(quarantine.testCaseId);
      if (eligibility.isEligible) {
        readyForPromotion.push({
          testCaseId: quarantine.testCaseId,
          testSuiteName: quarantine.testCase.testSuite.name,
          testCaseName: quarantine.testCase.name,
          consecutivePasses: eligibility.consecutivePasses,
          requiredPasses: eligibility.requiredPasses,
        });
      }
    }

    return {
      title: testSuiteId ? `Flaky Test Summary: ${testSuiteId}` : 'Flaky Test Summary',
      summary: {
        totalFlaky: stats.totalFlaky,
        totalQuarantined: stats.totalQuarantined,
        totalStabilizing: stats.totalStabilizing,
        avgFlakinessScore: mostFlaky.length > 0
          ? mostFlaky.reduce((sum, t) => sum + t.flakinessScore, 0) / mostFlaky.length
          : 0,
      },
      mostFlaky: mostFlaky.map((t) => ({
        testCaseId: t.testCaseId,
        testSuiteName: t.testSuite.name,
        testCaseName: t.testCase.name,
        flakinessScore: t.flakinessScore,
        recentPattern: t.recentPattern,
        assignedTeam: t.assignedTeam ?? undefined,
      })),
      recentlyQuarantined: recentlyQuarantined.map((q) => ({
        testCaseId: q.testCaseId,
        testSuiteName: q.testCase.testSuite.name,
        testCaseName: q.testCase.name,
        reason: q.reason,
        quarantinedAt: q.createdAt,
      })),
      readyForPromotion,
      timestamp: new Date(),
    };
  }

  /**
   * Get the detector instance
   */
  getDetector(): FlakyTestDetector {
    return this.detector;
  }
}

/**
 * Singleton instance
 */
let managerInstance: FlakyTestManager | undefined;

/**
 * Get or create the manager instance
 */
export function getFlakyTestManager(prisma: PrismaClient, config?: FlakyTestManagerConfig): FlakyTestManager {
  if (!managerInstance) {
    managerInstance = new FlakyTestManager(prisma, config);
  }
  return managerInstance;
}

/**
 * Reset the manager instance
 */
export function resetFlakyTestManager(): void {
  managerInstance = undefined;
}
