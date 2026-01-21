/**
 * Webhook Notification Provider
 * Sends test result notifications via HTTP webhooks
 */

import type {
  WebhookConfig,
  NotificationData,
  TestSummaryReport,
  NotificationResult,
} from './types.js';
import { generateWebhookPayload, generateSummaryPayload } from './templates.js';
import { createModuleLogger } from '../../utils/logger.js';
import type { Logger } from '../../utils/logger.js';

/**
 * Webhook notification error class
 */
export class WebhookNotificationError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'WebhookNotificationError';
  }
}

/**
 * Webhook notification provider
 */
export class WebhookNotifier {
  private readonly logger: Logger;
  private readonly name: string;
  private readonly config: WebhookConfig;

  constructor(name: string, config: WebhookConfig) {
    this.logger = createModuleLogger(`services:notification:webhook:${name}`);
    this.name = name;
    this.config = config;
  }

  /**
   * Send a notification via webhook
   */
  async send(data: NotificationData): Promise<NotificationResult> {
    const timestamp = new Date();

    try {
      const payload = generateWebhookPayload(data);

      this.logger.debug('Sending webhook notification', {
        name: this.name,
        trigger: data.trigger,
        testRunId: data.testRun.id,
        url: this.config.url,
      });

      const response = await this.executeWebhook(payload);

      this.logger.info('Webhook notification sent successfully', {
        name: this.name,
        trigger: data.trigger,
        testRunId: data.testRun.id,
      });

      return {
        channel: 'webhook',
        status: 'sent',
        timestamp,
        response: {
          statusCode: response.status,
          body: await response.text().catch(() => undefined),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to send webhook notification', {
        name: this.name,
        trigger: data.trigger,
        testRunId: data.testRun.id,
        error: errorMessage,
      });

      return {
        channel: 'webhook',
        status: 'failed',
        timestamp,
        error: errorMessage,
      };
    }
  }

  /**
   * Send a summary report via webhook
   */
  async sendSummary(report: TestSummaryReport): Promise<NotificationResult> {
    const timestamp = new Date();

    try {
      const payload = generateSummaryPayload(report);

      this.logger.debug('Sending webhook summary report', {
        name: this.name,
        testRunId: report.testRunId,
      });

      const response = await this.executeWebhook(payload);

      this.logger.info('Webhook summary sent successfully', {
        name: this.name,
        testRunId: report.testRunId,
      });

      return {
        channel: 'webhook',
        status: 'sent',
        timestamp,
        response: {
          statusCode: response.status,
          body: await response.text().catch(() => undefined),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to send webhook summary', {
        name: this.name,
        testRunId: report.testRunId,
        error: errorMessage,
      });

      return {
        channel: 'webhook',
        status: 'failed',
        timestamp,
        error: errorMessage,
      };
    }
  }

  /**
   * Execute the webhook request
   */
  private async executeWebhook(payload: Record<string, unknown>): Promise<Response> {
    const controller = new AbortController();
    const timeoutMs = 30000; // 30 second default timeout
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Build headers
      const headers: Record<string, string> = {
        'Content-Type': this.config.contentType || 'application/json',
        ...this.config.headers,
      };

      // Add authentication headers
      if (this.config.bearerToken) {
        headers['Authorization'] = `Bearer ${this.config.bearerToken}`;
      } else if (this.config.auth) {
        const credentials = Buffer.from(
          `${this.config.auth.username}:${this.config.auth.password}`
        ).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      }

      const response = await fetch(this.config.url, {
        method: this.config.method || 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => 'Unable to read response body');
        throw new WebhookNotificationError(
          `Webhook returned ${response.status}: ${response.statusText}. Body: ${body}`
        );
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Validate the webhook configuration
   */
  validate(): boolean {
    if (!this.config.url) {
      this.logger.error('Webhook URL is not configured');
      return false;
    }

    try {
      new URL(this.config.url);
    } catch {
      this.logger.error('Webhook URL is invalid');
      return false;
    }

    return true;
  }
}

/**
 * Collection of webhook notifiers
 */
export class WebhookNotifierCollection {
  private readonly notifiers: Map<string, WebhookNotifier> = new Map();
  private readonly logger: Logger;

  constructor(configs: Record<string, WebhookConfig>) {
    this.logger = createModuleLogger('services:notification:webhooks');

    for (const [name, webhookConfig] of Object.entries(configs)) {
      const notifier = new WebhookNotifier(name, webhookConfig);
      if (notifier.validate()) {
        this.notifiers.set(name, notifier);
        this.logger.debug(`Registered webhook: ${name}`);
      } else {
        this.logger.warn(`Skipping invalid webhook: ${name}`);
      }
    }
  }

  /**
   * Send notification to all registered webhooks
   */
  async sendToAll(data: NotificationData): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    for (const notifier of this.notifiers.values()) {
      const result = await notifier.send(data);
      results.push(result);
    }

    return results;
  }

  /**
   * Send summary to all registered webhooks
   */
  async sendSummaryToAll(report: TestSummaryReport): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    for (const notifier of this.notifiers.values()) {
      const result = await notifier.sendSummary(report);
      results.push(result);
    }

    return results;
  }

  /**
   * Send to a specific webhook by name
   */
  async sendTo(name: string, data: NotificationData): Promise<NotificationResult | null> {
    const notifier = this.notifiers.get(name);
    if (!notifier) {
      this.logger.warn(`Webhook not found: ${name}`);
      return null;
    }
    return await notifier.send(data);
  }

  /**
   * Get all registered webhook names
   */
  getWebhookNames(): string[] {
    return Array.from(this.notifiers.keys());
  }
}

/**
 * Create webhook notifiers from environment variables
 * Expected format: WEBHOOK_<NAME>_URL, WEBHOOK_<NAME>_TOKEN, etc.
 */
export function createWebhookNotifiers(): WebhookNotifierCollection | null {
  const webhookConfigs: Record<string, WebhookConfig> = {};

  // Find all WEBHOOK_<NAME>_URL variables
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('WEBHOOK_') && key.endsWith('_URL') && value) {
      const name = key.replace('WEBHOOK_', '').replace('_URL', '').toLowerCase();
      const tokenKey = `WEBHOOK_${name.toUpperCase()}_TOKEN`;
      const headerKey = `WEBHOOK_${name.toUpperCase()}_HEADERS`;

      webhookConfigs[name] = {
        url: value,
        bearerToken: process.env[tokenKey],
        headers: process.env[headerKey]
          ? JSON.parse(process.env[headerKey])
          : undefined,
      };
    }
  }

  if (Object.keys(webhookConfigs).length === 0) {
    return null;
  }

  return new WebhookNotifierCollection(webhookConfigs);
}
