/**
 * Notification Service Types
 * Types for notification delivery via Slack, email, and webhooks
 */

/**
 * Notification channel types
 */
export type NotificationChannel = 'slack' | 'email' | 'webhook';

/**
 * Status of a notification delivery
 */
export type NotificationDeliveryStatus = 'pending' | 'sent' | 'failed' | 'retrying';

/**
 * Trigger events for notifications
 */
export type NotificationTrigger =
  | 'test_started'
  | 'test_completed'
  | 'test_failed'
  | 'test_passed'
  | 'test_skipped'
  | 'test_timeout'
  | 'suite_started'
  | 'suite_completed'
  | 'suite_failed'
  | 'flaky_test_detected'
  | 'flaky_test_quarantined'
  | 'flaky_test_promoted'
  | 'quarantine_summary';

/**
 * Severity levels for notifications
 */
export type NotificationSeverity = 'info' | 'warning' | 'error' | 'success';

/**
 * Notification rule configuration
 */
export interface NotificationRule {
  /**
   * Unique identifier for the rule
   */
  id: string;

  /**
   * Human-readable name
   */
  name: string;

  /**
   * Whether this rule is enabled
   */
  enabled: boolean;

  /**
   * Events that trigger this notification
   */
  triggers: NotificationTrigger[];

  /**
   * Channels to send notifications to
   */
  channels: NotificationChannel[];

  /**
   * Filter conditions (optional)
   */
  filters?: NotificationFilter;

  /**
   * Custom message template (optional)
   */
  template?: string;
}

/**
 * Notification filter conditions
 */
export interface NotificationFilter {
  /**
   * Filter by test suite tags
   */
  tags?: string[];

  /**
   * Filter by test suite name pattern
   */
  suitePattern?: string;

  /**
   * Filter by device platform
   */
  platform?: 'ios' | 'android' | 'both';

  /**
   * Minimum severity level
   */
  minSeverity?: NotificationSeverity;

  /**
   * Only notify on specific failure count threshold
   */
  failureThreshold?: number;
}

/**
 * Base notification data
 */
export interface NotificationData {
  /**
   * Type of event
   */
  trigger: NotificationTrigger;

  /**
   * Severity level
   */
  severity: NotificationSeverity;

  /**
   * Test run information
   */
  testRun: {
    id: string;
    testSuiteId: string;
    testSuiteName: string;
    deviceId: string;
    deviceName: string;
    devicePlatform: 'ios' | 'android';
    status: string;
    startedAt?: Date;
    completedAt?: Date;
    totalDuration?: number;
    passedCount: number;
    failedCount: number;
    skippedCount: number;
  };

  /**
   * Individual test results (optional, for detailed notifications)
   */
  testResults?: Array<{
    id: string;
    testCaseName: string;
    status: string;
    duration: number;
    errorMessage?: string;
  }>;

  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Slack notification configuration
 */
export interface SlackConfig {
  /**
   * Slack webhook URL
   */
  webhookUrl: string;

  /**
   * Default channel (overrides webhook channel if provided)
   */
  channel?: string;

  /**
   * Bot username
   */
  username?: string;

  /**
   * Bot icon URL
   */
  iconUrl?: string;

  /**
   * Custom emoji icon
   */
  iconEmoji?: string;
}

/**
 * Email notification configuration
 */
export interface EmailConfig {
  /**
   * SMTP host
   */
  host: string;

  /**
   * SMTP port
   */
  port: number;

  /**
   * Use secure connection (TLS)
   */
  secure?: boolean;

  /**
   * SMTP username
   */
  user?: string;

  /**
   * SMTP password
   */
  password?: string;

  /**
   * From email address
   */
  from: string;

  /**
   * From name
   */
  fromName?: string;

  /**
   * Default recipients
   */
  to?: string[];

  /**
   * Default CC recipients
   */
  cc?: string[];

  /**
   * Default BCC recipients
   */
  bcc?: string[];
}

/**
 * Webhook notification configuration
 */
export interface WebhookConfig {
  /**
   * Webhook URL
   */
  url: string;

  /**
   * HTTP method
   */
  method?: 'POST' | 'PUT' | 'PATCH';

  /**
   * Additional headers to include
   */
  headers?: Record<string, string>;

  /**
   * Basic authentication
   */
  auth?: {
    username: string;
    password: string;
  };

  /**
   * Bearer token authentication
   */
  bearerToken?: string;

  /**
   * Content type
   */
  contentType?: string;
}

/**
 * Notification delivery result
 */
export interface NotificationResult {
  /**
   * Channel the notification was sent to
   */
  channel: NotificationChannel;

  /**
   * Delivery status
   */
  status: NotificationDeliveryStatus;

  /**
   * Error message if failed
   */
  error?: string;

  /**
   * Timestamp of delivery attempt
   */
  timestamp: Date;

  /**
   * Response data from the notification service
   */
  response?: unknown;
}

/**
 * Summary report data
 */
export interface TestSummaryReport {
  /**
   * Report title
   */
  title: string;

  /**
   * Test run ID
   */
  testRunId: string;

  /**
   * Test suite name
   */
  testSuiteName: string;

  /**
   * Device information
   */
  device: {
    name: string;
    platform: 'ios' | 'android';
    osVersion: string;
  };

  /**
   * Execution summary
   */
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    startedAt: Date;
    completedAt?: Date;
  };

  /**
   * Failed test details
   */
  failures: Array<{
    testName: string;
    errorMessage: string;
    stackTrace?: string;
    duration: number;
  }>;

  /**
   * Pass rate percentage
   */
  passRate: number;

  /**
   * Severity assessment
   */
  severity: NotificationSeverity;

  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Notification service configuration
 */
export interface NotificationServiceConfig {
  /**
   * Slack configuration
   */
  slack?: SlackConfig;

  /**
   * Email configuration
   */
  email?: EmailConfig;

  /**
   * Webhook configurations (keyed by name)
   */
  webhooks?: Record<string, WebhookConfig>;

  /**
   * Global notification rules
   */
  rules?: NotificationRule[];

  /**
   * Default enabled channels
   */
  defaultChannels?: NotificationChannel[];

  /**
   * Retry configuration
   */
  retry?: {
    maxAttempts: number;
    backoffMs: number;
  };

  /**
   * Timeout for notification delivery (ms)
   */
  timeout?: number;
}
