/**
 * Notification Service Index
 * Main export point for the notification service
 */

// Types
export type {
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationTrigger,
  NotificationSeverity,
  NotificationRule,
  NotificationFilter,
  NotificationData,
  SlackConfig,
  EmailConfig,
  WebhookConfig,
  NotificationResult,
  TestSummaryReport,
  NotificationServiceConfig,
} from './types.js';

// Main service
export {
  NotificationService,
  NotificationServiceError,
  getNotificationService,
  resetNotificationService,
  createNotificationService,
} from './service.js';

// Channel providers
export {
  SlackNotifier,
  SlackNotificationError,
  createSlackNotifier,
} from './slack.js';

export {
  EmailNotifier,
  EmailNotificationError,
  createEmailNotifier,
} from './email.js';

export {
  WebhookNotifier,
  WebhookNotifierCollection,
  WebhookNotificationError,
  createWebhookNotifiers,
} from './webhook.js';

// Templates
export {
  generateSlackMessage,
  generateSlackSummary,
  generateEmailSubject,
  generateSummarySubject,
  generateEmailHtml,
  generateEmailText,
  generateWebhookPayload,
  generateSummaryPayload,
} from './templates.js';
