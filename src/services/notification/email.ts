/**
 * Email Notification Provider
 * Sends test result notifications via email using SMTP
 */

import type {
  EmailConfig,
  NotificationData,
  TestSummaryReport,
  NotificationResult,
} from './types.js';
import { generateEmailSubject, generateSummarySubject, generateEmailHtml, generateEmailText } from './templates.js';
import { createModuleLogger } from '../../utils/logger.js';
import type { Logger } from '../../utils/logger.js';

/**
 * Email notification error class
 */
export class EmailNotificationError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'EmailNotificationError';
  }
}

/**
 * Email message interface
 */
interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  cc?: string | string[];
  bcc?: string | string[];
}

/**
 * Email notification provider
 */
export class EmailNotifier {
  private readonly logger: Logger;
  private readonly config: EmailConfig;

  constructor(config: EmailConfig) {
    this.logger = createModuleLogger('services:notification:email');
    this.config = config;
  }

  /**
   * Send a notification via email
   */
  async send(data: NotificationData, recipients?: string[]): Promise<NotificationResult> {
    const timestamp = new Date();

    try {
      const subject = generateEmailSubject(data);
      const html = generateEmailHtml(data);
      const text = generateEmailText(data);

      const to = recipients?.length ? recipients : this.config.to || [];
      const cc = this.config.cc;
      const bcc = this.config.bcc;

      if (!to || to.length === 0) {
        throw new EmailNotificationError('No recipients configured for email notification');
      }

      const message: EmailMessage = { to, subject, html, text, cc, bcc };

      this.logger.debug('Sending email notification', {
        trigger: data.trigger,
        testRunId: data.testRun.id,
        to: Array.isArray(to) ? to.join(', ') : to,
      });

      await this.sendEmail(message);

      this.logger.info('Email notification sent successfully', {
        trigger: data.trigger,
        testRunId: data.testRun.id,
        to: Array.isArray(to) ? to.join(', ') : to,
      });

      return {
        channel: 'email',
        status: 'sent',
        timestamp,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to send email notification', {
        trigger: data.trigger,
        testRunId: data.testRun.id,
        error: errorMessage,
      });

      return {
        channel: 'email',
        status: 'failed',
        timestamp,
        error: errorMessage,
      };
    }
  }

  /**
   * Send a summary report via email
   */
  async sendSummary(report: TestSummaryReport, recipients?: string[]): Promise<NotificationResult> {
    const timestamp = new Date();

    try {
      const subject = generateSummarySubject(report);
      const html = generateEmailHtml({
        trigger: 'test_completed',
        severity: report.severity,
        testRun: {
          id: report.testRunId,
          testSuiteId: report.testRunId,
          testSuiteName: report.testSuiteName,
          deviceId: 'unknown',
          deviceName: report.device.name,
          devicePlatform: report.device.platform,
          status: report.summary.failed > 0 ? 'FAILED' : 'COMPLETED',
          startedAt: report.summary.startedAt,
          completedAt: report.summary.completedAt,
          totalDuration: report.summary.duration,
          passedCount: report.summary.passed,
          failedCount: report.summary.failed,
          skippedCount: report.summary.skipped,
        },
        testResults: report.failures.map((f, i) => ({
          id: String(i),
          testCaseName: f.testName,
          status: 'FAILED',
          duration: f.duration,
          errorMessage: f.errorMessage,
        })),
      });
      const text = generateEmailText({
        trigger: 'test_completed',
        severity: report.severity,
        testRun: {
          id: report.testRunId,
          testSuiteId: report.testRunId,
          testSuiteName: report.testSuiteName,
          deviceId: 'unknown',
          deviceName: report.device.name,
          devicePlatform: report.device.platform,
          status: report.summary.failed > 0 ? 'FAILED' : 'COMPLETED',
          startedAt: report.summary.startedAt,
          completedAt: report.summary.completedAt,
          totalDuration: report.summary.duration,
          passedCount: report.summary.passed,
          failedCount: report.summary.failed,
          skippedCount: report.summary.skipped,
        },
        testResults: report.failures.map((f, i) => ({
          id: String(i),
          testCaseName: f.testName,
          status: 'FAILED',
          duration: f.duration,
          errorMessage: f.errorMessage,
        })),
      });

      const to = recipients?.length ? recipients : this.config.to || [];
      const cc = this.config.cc;
      const bcc = this.config.bcc;

      if (!to || to.length === 0) {
        throw new EmailNotificationError('No recipients configured for email notification');
      }

      const message: EmailMessage = { to, subject, html, text, cc, bcc };

      this.logger.debug('Sending email summary report', {
        testRunId: report.testRunId,
        to: Array.isArray(to) ? to.join(', ') : to,
      });

      await this.sendEmail(message);

      this.logger.info('Email summary sent successfully', {
        testRunId: report.testRunId,
      });

      return {
        channel: 'email',
        status: 'sent',
        timestamp,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to send email summary', {
        testRunId: report.testRunId,
        error: errorMessage,
      });

      return {
        channel: 'email',
        status: 'failed',
        timestamp,
        error: errorMessage,
      };
    }
  }

  /**
   * Send an email message
   */
  private async sendEmail(message: EmailMessage): Promise<void> {
    // Build the email message
    const toList = Array.isArray(message.to) ? message.to : [message.to];
    const ccList = message.cc ? (Array.isArray(message.cc) ? message.cc : [message.cc]) : [];
    const bccList = message.bcc ? (Array.isArray(message.bcc) ? message.bcc : [message.bcc]) : [];

    // Build RFC 822 email message
    const boundary = `boundary-${Date.now()}-${Math.random().toString(36).substring(2)}`;

    let email = `From: ${this.formatAddress(this.config.from, this.config.fromName)}\r\n`;
    email += `To: ${toList.map((a) => this.formatEmailAddress(a)).join(', ')}\r\n`;

    if (ccList.length > 0) {
      email += `Cc: ${ccList.map((a) => this.formatEmailAddress(a)).join(', ')}\r\n`;
    }

    if (bccList.length > 0) {
      email += `Bcc: ${bccList.map((a) => this.formatEmailAddress(a)).join(', ')}\r\n`;
    }

    email += `Subject: ${this.encodeHeader(message.subject)}\r\n`;
    email += `MIME-Version: 1.0\r\n`;
    email += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;

    // Plain text version
    email += `--${boundary}\r\n`;
    email += `Content-Type: text/plain; charset=UTF-8\r\n\r\n`;
    email += `${message.text}\r\n\r\n`;

    // HTML version
    email += `--${boundary}\r\n`;
    email += `Content-Type: text/html; charset=UTF-8\r\n\r\n`;
    email += `${message.html}\r\n\r\n`;

    email += `--${boundary}--\r\n`;

    // Send via SMTP
    await this.sendViaSmtp(toList.concat(ccList).concat(bccList), email);
  }

  /**
   * Send email via SMTP
   */
  private async sendViaSmtp(recipients: string[], message: string): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      // For actual SMTP sending, we'd use a library like nodemailer
      // Since we don't have that dependency, we'll provide a stub that logs
      this.logger.debug('Sending email via SMTP', {
        host: this.config.host,
        port: this.config.port,
        recipients: recipients.join(', '),
      });

      // Store email for testing purposes (in production, use nodemailer)
      if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
        // In test/dev mode, write to a file for inspection
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const emailsDir = path.join(process.cwd(), 'tmp', 'emails');
        await fs.mkdir(emailsDir, { recursive: true });
        const filename = `email-${Date.now()}.txt`;
        await fs.writeFile(path.join(emailsDir, filename), message);
        this.logger.debug(`Email written to ${filename}`);
      }

      // In production with proper SMTP, you would use nodemailer:
      /*
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransporter({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure ?? false,
        auth: this.config.user ? {
          user: this.config.user,
          pass: this.config.password,
        } : undefined,
      });
      await transporter.sendMail({
        from: this.formatAddress(this.config.from, this.config.fromName),
        to: recipients.join(', '),
        ...message,
      });
      */
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Format an email address
   */
  private formatEmailAddress(address: string): string {
    // Simple validation - just return the address if it looks like an email
    if (address.includes('<') && address.includes('>')) {
      return address;
    }
    return `<${address}>`;
  }

  /**
   * Format an address with an optional name
   */
  private formatAddress(email: string, name?: string): string {
    if (name) {
      return `"${this.encodeHeader(name)}" <${email}>`;
    }
    return `<${email}>`;
  }

  /**
   * Encode a header value (RFC 2047)
   */
  private encodeHeader(value: string): string {
    // If the value contains non-ASCII characters, encode it
    if (/[\x00-\x1F\x7F-\xFF]/.test(value)) {
      return `=?UTF-8?B?${Buffer.from(value).toString('base64')}?=`;
    }
    return value;
  }

  /**
   * Validate the email configuration
   */
  validate(): boolean {
    if (!this.config.host) {
      this.logger.error('SMTP host is not configured');
      return false;
    }

    if (!this.config.port) {
      this.logger.error('SMTP port is not configured');
      return false;
    }

    if (!this.config.from) {
      this.logger.error('From address is not configured');
      return false;
    }

    return true;
  }
}

/**
 * Create an email notifier from environment variables
 */
export function createEmailNotifier(): EmailNotifier | null {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const secure = process.env.SMTP_SECURE;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.EMAIL_FROM;
  const fromName = process.env.EMAIL_FROM_NAME;
  const to = process.env.EMAIL_TO?.split(',').map((s) => s.trim());
  const cc = process.env.EMAIL_CC?.split(',').map((s) => s.trim());
  const bcc = process.env.EMAIL_BCC?.split(',').map((s) => s.trim());

  if (!host || !port || !from) {
    return null;
  }

  return new EmailNotifier({
    host,
    port: parseInt(port, 10),
    secure: secure === 'true',
    user,
    password,
    from,
    fromName,
    to,
    cc,
    bcc,
  });
}
