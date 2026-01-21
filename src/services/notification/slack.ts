/**
 * Slack Notification Provider
 * Sends test result notifications to Slack via webhooks
 */

import type {
  SlackConfig,
  NotificationData,
  TestSummaryReport,
  NotificationResult,
} from './types.js';
import { generateSlackMessage, generateSlackSummary } from './templates.js';
import { createModuleLogger } from '../../utils/logger.js';
import type { Logger } from '../../utils/logger.js';

/**
 * Slack notification error class
 */
export class SlackNotificationError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'SlackNotificationError';
  }
}

/**
 * Slack notification provider
 */
export class SlackNotifier {
  private readonly logger: Logger;
  private readonly config: SlackConfig;

  constructor(config: SlackConfig) {
    this.logger = createModuleLogger('services:notification:slack');
    this.config = config;
  }

  /**
   * Send a notification to Slack
   */
  async send(data: NotificationData): Promise<NotificationResult> {
    const timestamp = new Date();

    try {
      const message = generateSlackMessage(data);
      const payload = this.buildPayload(message);

      this.logger.debug('Sending Slack notification', {
        trigger: data.trigger,
        testRunId: data.testRun.id,
      });

      const response = await this.executeWebhook(payload);

      this.logger.info('Slack notification sent successfully', {
        trigger: data.trigger,
        testRunId: data.testRun.id,
      });

      return {
        channel: 'slack',
        status: 'sent',
        timestamp,
        response: {
          statusCode: response.status,
          body: await response.text(),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to send Slack notification', {
        trigger: data.trigger,
        testRunId: data.testRun.id,
        error: errorMessage,
      });

      return {
        channel: 'slack',
        status: 'failed',
        timestamp,
        error: errorMessage,
      };
    }
  }

  /**
   * Send a summary report to Slack
   */
  async sendSummary(report: TestSummaryReport): Promise<NotificationResult> {
    const timestamp = new Date();

    try {
      const message = generateSlackSummary(report);
      const payload = this.buildPayload(message, true);

      this.logger.debug('Sending Slack summary report', {
        testRunId: report.testRunId,
        passRate: report.passRate,
      });

      const response = await this.executeWebhook(payload);

      this.logger.info('Slack summary sent successfully', {
        testRunId: report.testRunId,
      });

      return {
        channel: 'slack',
        status: 'sent',
        timestamp,
        response: {
          statusCode: response.status,
          body: await response.text(),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to send Slack summary', {
        testRunId: report.testRunId,
        error: errorMessage,
      });

      return {
        channel: 'slack',
        status: 'failed',
        timestamp,
        error: errorMessage,
      };
    }
  }

  /**
   * Build the Slack webhook payload
   */
  private buildPayload(
    message: { text: string; blocks?: Array<Record<string, unknown>>; attachments?: Array<Record<string, unknown>> },
    isSummary = false
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      text: message.text,
    };

    // Add blocks if present
    if (message.blocks && message.blocks.length > 0) {
      payload.blocks = message.blocks;
    }

    // Add attachments if present (for summaries)
    if (isSummary && message.attachments && message.attachments.length > 0) {
      payload.attachments = message.attachments;
    }

    // Override channel if specified
    if (this.config.channel) {
      payload.channel = this.config.channel;
    }

    // Set username if specified
    if (this.config.username) {
      payload.username = this.config.username;
    }

    // Set icon if specified
    if (this.config.iconUrl) {
      payload.icon_url = this.config.iconUrl;
    } else if (this.config.iconEmoji) {
      payload.icon_emoji = this.config.iconEmoji;
    }

    return payload;
  }

  /**
   * Execute the webhook request
   */
  private async executeWebhook(payload: Record<string, unknown>): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => 'Unable to read response body');
        throw new SlackNotificationError(
          `Slack webhook returned ${response.status}: ${response.statusText}. Body: ${body}`
        );
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Validate the Slack configuration
   */
  validate(): boolean {
    if (!this.config.webhookUrl) {
      this.logger.error('Slack webhook URL is not configured');
      return false;
    }

    try {
      new URL(this.config.webhookUrl);
    } catch {
      this.logger.error('Slack webhook URL is invalid');
      return false;
    }

    return true;
  }
}

/**
 * Create a Slack notifier from environment variables
 */
export function createSlackNotifier(): SlackNotifier | null {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  const channel = process.env.SLACK_CHANNEL;
  const username = process.env.SLACK_USERNAME;
  const iconEmoji = process.env.SLACK_ICON_EMOJI;

  if (!webhookUrl) {
    return null;
  }

  return new SlackNotifier({
    webhookUrl,
    channel,
    username,
    iconEmoji,
  });
}
