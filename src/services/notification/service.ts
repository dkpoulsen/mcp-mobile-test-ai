/**
 * Notification Service
 * Main service for coordinating notifications across multiple channels
 */

import type {
  NotificationChannel,
  NotificationData,
  NotificationRule,
  NotificationResult,
  NotificationServiceConfig,
  TestSummaryReport,
  NotificationSeverity,
} from './types.js';
import { SlackNotifier, createSlackNotifier } from './slack.js';
import { EmailNotifier, createEmailNotifier } from './email.js';
import {
  WebhookNotifierCollection,
  createWebhookNotifiers,
} from './webhook.js';
import { createModuleLogger } from '../../utils/logger.js';
import type { Logger } from '../../utils/logger.js';

/**
 * Notification service error class
 */
export class NotificationServiceError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'NotificationServiceError';
  }
}

/**
 * Default notification rules
 */
const DEFAULT_RULES: NotificationRule[] = [
  {
    id: 'test-failed',
    name: 'Notify on test failures',
    enabled: true,
    triggers: ['test_failed', 'suite_failed'],
    channels: ['slack', 'email'],
    filters: {
      minSeverity: 'error',
    },
  },
  {
    id: 'test-completed',
    name: 'Notify on test completion',
    enabled: true,
    triggers: ['test_completed', 'suite_completed'],
    channels: ['slack'],
    filters: {
      minSeverity: 'info',
    },
  },
  {
    id: 'test-started',
    name: 'Notify on test start',
    enabled: false,
    triggers: ['test_started', 'suite_started'],
    channels: ['webhook'],
    filters: {
      minSeverity: 'info',
    },
  },
];

/**
 * Main notification service class
 */
export class NotificationService {
  private readonly logger: Logger;
  private readonly slack?: SlackNotifier;
  private readonly email?: EmailNotifier;
  private readonly webhooks?: WebhookNotifierCollection;
  private readonly rules: Map<string, NotificationRule>;
  private readonly retryConfig: { maxAttempts: number; backoffMs: number };

  constructor(config: NotificationServiceConfig = {}) {
    this.logger = createModuleLogger('services:notification');
    // void config.defaultChannels; // Available for future use
    this.retryConfig = config.retry || { maxAttempts: 3, backoffMs: 1000 };
    // void config.timeout; // Available for future use

    // Initialize channel providers
    if (config.slack) {
      this.slack = new SlackNotifier(config.slack);
      if (this.slack.validate()) {
        this.logger.info('Slack notifications enabled');
      } else {
        this.slack = undefined;
      }
    }

    if (config.email) {
      this.email = new EmailNotifier(config.email);
      if (this.email.validate()) {
        this.logger.info('Email notifications enabled');
      } else {
        this.email = undefined;
      }
    }

    if (config.webhooks && Object.keys(config.webhooks).length > 0) {
      this.webhooks = new WebhookNotifierCollection(config.webhooks);
      this.logger.info(`Webhook notifications enabled: ${this.webhooks.getWebhookNames().join(', ')}`);
    }

    // Initialize rules
    this.rules = new Map();
    const rulesToUse = config.rules || DEFAULT_RULES;
    for (const rule of rulesToUse) {
      this.rules.set(rule.id, rule);
      this.logger.debug(`Loaded notification rule: ${rule.name} (${rule.enabled ? 'enabled' : 'disabled'})`);
    }

    this.logger.info('Notification service initialized', {
      channels: this.getEnabledChannels(),
      rules: this.getEnabledRuleIds(),
    });
  }

  /**
   * Send a notification based on test data
   */
  async notify(data: NotificationData): Promise<NotificationResult[]> {
    this.logger.debug('Processing notification', {
      trigger: data.trigger,
      testRunId: data.testRun.id,
    });

    // Find matching rules
    const matchingRules = this.findMatchingRules(data);

    if (matchingRules.length === 0) {
      this.logger.debug('No matching notification rules found', {
        trigger: data.trigger,
        testRunId: data.testRun.id,
      });
      return [];
    }

    // Collect all channels to notify
    const channels = new Set<NotificationChannel>();
    for (const rule of matchingRules) {
      for (const channel of rule.channels) {
        channels.add(channel);
      }
    }

    this.logger.debug('Sending notifications', {
      trigger: data.trigger,
      testRunId: data.testRun.id,
      channels: Array.from(channels),
    });

    // Send to all channels
    const results: NotificationResult[] = [];

    for (const channel of channels) {
      const result = await this.sendToChannel(channel, data);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Send a notification to a specific channel
   */
  async sendToChannel(
    channel: NotificationChannel,
    data: NotificationData
  ): Promise<NotificationResult | null> {
    try {
      switch (channel) {
        case 'slack':
          if (this.slack) {
            return await this.withRetry(() => this.slack!.send(data));
          }
          break;

        case 'email':
          if (this.email) {
            return await this.withRetry(() => this.email!.send(data));
          }
          break;

        case 'webhook':
          if (this.webhooks) {
            const results = await this.withRetry(() => this.webhooks!.sendToAll(data));
            // Return the first result or null
            return results.length > 0 ? results[0] ?? null : null;
          }
          break;
      }

      this.logger.warn(`Channel not available: ${channel}`);
      return null;
    } catch (error) {
      this.logger.error(`Failed to send notification to ${channel}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        channel,
        status: 'failed',
        timestamp: new Date(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Send a summary report
   */
  async sendSummary(report: TestSummaryReport): Promise<NotificationResult[]> {
    this.logger.info('Sending summary report', {
      testRunId: report.testRunId,
      passRate: report.passRate,
    });

    const results: NotificationResult[] = [];

    // Send to all enabled channels
    if (this.slack) {
      const result = await this.withRetry(() => this.slack!.sendSummary(report));
      results.push(result);
    }

    if (this.email) {
      const result = await this.withRetry(() => this.email!.sendSummary(report));
      results.push(result);
    }

    if (this.webhooks) {
      const webhookResults = await this.withRetry(() => this.webhooks!.sendSummaryToAll(report));
      results.push(...webhookResults);
    }

    return results;
  }

  /**
   * Notify on test start
   */
  async notifyTestStarted(testRun: NotificationData['testRun']): Promise<NotificationResult[]> {
    return this.notify({
      trigger: 'test_started',
      severity: 'info',
      testRun,
    });
  }

  /**
   * Notify on test completion
   */
  async notifyTestCompleted(
    testRun: NotificationData['testRun'],
    testResults?: NotificationData['testResults']
  ): Promise<NotificationResult[]> {
    const severity: NotificationSeverity = testRun.failedCount > 0 ? 'warning' : 'success';
    return this.notify({
      trigger: 'test_completed',
      severity,
      testRun,
      testResults,
    });
  }

  /**
   * Notify on test failure
   */
  async notifyTestFailed(
    testRun: NotificationData['testRun'],
    testResults?: NotificationData['testResults']
  ): Promise<NotificationResult[]> {
    return this.notify({
      trigger: 'test_failed',
      severity: 'error',
      testRun,
      testResults,
    });
  }

  /**
   * Notify on test suite start
   */
  async notifySuiteStarted(testRun: NotificationData['testRun']): Promise<NotificationResult[]> {
    return this.notify({
      trigger: 'suite_started',
      severity: 'info',
      testRun,
    });
  }

  /**
   * Notify on test suite completion
   */
  async notifySuiteCompleted(
    testRun: NotificationData['testRun'],
    testResults?: NotificationData['testResults']
  ): Promise<NotificationResult[]> {
    const severity: NotificationSeverity = testRun.failedCount > 0 ? 'error' : 'success';
    return this.notify({
      trigger: 'suite_completed',
      severity,
      testRun,
      testResults,
    });
  }

  /**
   * Find rules that match the given notification data
   */
  private findMatchingRules(data: NotificationData): NotificationRule[] {
    const matching: NotificationRule[] = [];

    for (const rule of this.rules.values()) {
      if (!rule.enabled) {
        continue;
      }

      // Check trigger match
      if (!rule.triggers.includes(data.trigger)) {
        continue;
      }

      // Check filters
      if (rule.filters) {
        // Check severity filter
        if (rule.filters.minSeverity) {
          const severityOrder: Record<NotificationSeverity, number> = {
            info: 1,
            warning: 2,
            error: 3,
            success: 1,
          };
          if (severityOrder[data.severity] < severityOrder[rule.filters.minSeverity]) {
            continue;
          }
        }

        // Check failure threshold
        if (rule.filters.failureThreshold !== undefined) {
          if (data.testRun.failedCount < rule.filters.failureThreshold) {
            continue;
          }
        }

        // Check platform filter
        if (rule.filters.platform && rule.filters.platform !== 'both') {
          if (data.testRun.devicePlatform !== rule.filters.platform) {
            continue;
          }
        }

        // Check suite pattern filter
        if (rule.filters.suitePattern) {
          const pattern = new RegExp(rule.filters.suitePattern);
          if (!pattern.test(data.testRun.testSuiteName)) {
            continue;
          }
        }

        // Check tags filter (would need tags in testRun data)
        if (rule.filters.tags && rule.filters.tags.length > 0) {
          // Skip if we don't have tag information
          // This would require test suite to include tags
        }
      }

      matching.push(rule);
    }

    return matching;
  }

  /**
   * Execute a function with retry logic
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.retryConfig.maxAttempts) {
          const delay = this.retryConfig.backoffMs * attempt;
          this.logger.debug(`Retrying after ${delay}ms (attempt ${attempt}/${this.retryConfig.maxAttempts})`);
          await this.sleep(delay);
        }
      }
    }

    throw new NotificationServiceError(
      `Failed after ${this.retryConfig.maxAttempts} attempts`,
      lastError
    );
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get enabled notification channels
   */
  getEnabledChannels(): NotificationChannel[] {
    const channels: NotificationChannel[] = [];
    if (this.slack) channels.push('slack');
    if (this.email) channels.push('email');
    if (this.webhooks) channels.push('webhook');
    return channels;
  }

  /**
   * Get enabled rule IDs
   */
  getEnabledRuleIds(): string[] {
    return Array.from(this.rules.values())
      .filter((r) => r.enabled)
      .map((r) => r.id);
  }

  /**
   * Add a notification rule
   */
  addRule(rule: NotificationRule): void {
    this.rules.set(rule.id, rule);
    this.logger.info(`Added notification rule: ${rule.name}`);
  }

  /**
   * Remove a notification rule
   */
  removeRule(ruleId: string): boolean {
    const deleted = this.rules.delete(ruleId);
    if (deleted) {
      this.logger.info(`Removed notification rule: ${ruleId}`);
    }
    return deleted;
  }

  /**
   * Enable a notification rule
   */
  enableRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = true;
      this.logger.info(`Enabled notification rule: ${rule.name}`);
      return true;
    }
    return false;
  }

  /**
   * Disable a notification rule
   */
  disableRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = false;
      this.logger.info(`Disabled notification rule: ${rule.name}`);
      return true;
    }
    return false;
  }

  /**
   * Get all rules
   */
  getRules(): NotificationRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get a rule by ID
   */
  getRule(ruleId: string): NotificationRule | undefined {
    return this.rules.get(ruleId);
  }
}

/**
 * Global notification service instance
 */
let globalNotificationService: NotificationService | null = null;

/**
 * Get or create the global notification service
 */
export function getNotificationService(): NotificationService | null {
  if (!globalNotificationService) {
    // Try to create from environment variables
    const slack = createSlackNotifier();
    const email = createEmailNotifier();
    const webhooks = createWebhookNotifiers();

    if (!slack && !email && !webhooks) {
      return null;
    }

    globalNotificationService = new NotificationService({
      slack: slack ? { webhookUrl: '' } : undefined, // Config is already loaded in create* functions
      email: email ? { host: '', port: 0, from: '' } : undefined,
      webhooks: webhooks ? {} : undefined,
    });
  }

  return globalNotificationService;
}

/**
 * Reset the global notification service (useful for testing)
 */
export function resetNotificationService(): void {
  globalNotificationService = null;
}

/**
 * Create a notification service from environment variables
 */
export function createNotificationService(): NotificationService | null {
  return getNotificationService();
}
