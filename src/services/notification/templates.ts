/**
 * Notification Templates
 * Message templates for different notification channels
 */

import type {
  NotificationData,
  TestSummaryReport,
  NotificationSeverity,
} from './types.js';
import type { FlakyTestEvent, FlakinessAnalysis } from '../flaky-test-detector/types.js';

/**
 * Map severity to emoji indicators
 */
const SEVERITY_EMOJIS: Record<NotificationSeverity, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  error: '❌',
  success: '✅',
};

/**
 * Map severity to colors
 */
const SEVERITY_COLORS: Record<NotificationSeverity, string> = {
  info: '#36a64f', // green
  warning: '#ff9900', // orange
  error: '#ff0000', // red
  success: '#36a64f', // green
};

/**
 * Map test run status to emoji
 */
const STATUS_EMOJIS: Record<string, string> = {
  PENDING: '⏳',
  RUNNING: '▶️',
  COMPLETED: '✅',
  FAILED: '❌',
  CANCELLED: '🚫',
};

/**
 * Map result status to emoji
 */
const RESULT_EMOJIS: Record<string, string> = {
  PASSED: '✅',
  FAILED: '❌',
  SKIPPED: '⏭️',
  TIMEOUT: '⏱️',
};

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  return date.toLocaleString();
}

/**
 * Format duration for display
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

/**
 * Generate Slack message blocks for notification
 */
export function generateSlackMessage(data: NotificationData): {
  text: string;
  blocks: Array<Record<string, unknown>>;
} {
  const severity = data.severity;
  const emoji = SEVERITY_EMOJIS[severity];
  // void SEVERITY_COLORS[severity]; // Available for future use

  const header = `${emoji} Test ${data.trigger.replace(/_/g, ' ')}`;
  const title = `${header}: ${data.testRun.testSuiteName}`;

  // Build message sections
  const blocks: Array<Record<string, unknown>> = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: title,
        emoji: true,
      },
    },
  ];

  // Add context fields
  const fields = [
    {
      type: 'mrkdwn',
      text: `*Status:*\n${STATUS_EMOJIS[data.testRun.status] || ''} ${data.testRun.status}`,
    },
    {
      type: 'mrkdwn',
      text: `*Platform:*\n${data.testRun.devicePlatform.toUpperCase()}`,
    },
    {
      type: 'mrkdwn',
      text: `*Device:*\n${data.testRun.deviceName}`,
    },
    {
      type: 'mrkdwn',
      text: `*Results:*\n✅ ${data.testRun.passedCount} | ❌ ${data.testRun.failedCount} | ⏭️ ${data.testRun.skippedCount}`,
    },
  ];

  if (data.testRun.startedAt) {
    fields.push({
      type: 'mrkdwn',
      text: `*Started:*\n\`${formatDate(data.testRun.startedAt)}\``,
    });
  }

  if (data.testRun.totalDuration) {
    fields.push({
      type: 'mrkdwn',
      text: `*Duration:*\n${formatDuration(data.testRun.totalDuration)}`,
    });
  }

  blocks.push({
    type: 'section',
    fields,
  });

  // Add failed test details if available
  if (data.testResults && data.testResults.length > 0) {
    const failedTests = data.testResults.filter((r) => r.status === 'FAILED');
    if (failedTests.length > 0) {
      const failureList = failedTests
        .slice(0, 5)
        .map(
          (t) =>
            `• ${RESULT_EMOJIS.FAILED} *${t.testCaseName}*\n  ${
              t.errorMessage ? `_${t.errorMessage.split('\n')[0]}_` : 'No error message'
            }`
        )
        .join('\n');

      const moreText = failedTests.length > 5 ? `\n_... and ${failedTests.length - 5} more_` : '';

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Failed Tests (${failedTests.length})*\n${failureList}${moreText}`,
        },
      });
    }
  }

  // Add divider
  blocks.push({ type: 'divider' });

  // Add actions
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Test Run ID: \`${data.testRun.id}\` | Test Suite ID: \`${data.testRun.testSuiteId}\``,
      },
    ],
  });

  return {
    text: title,
    blocks,
  };
}

/**
 * Generate Slack message for summary report
 */
export function generateSlackSummary(report: TestSummaryReport): {
  text: string;
  attachments: Array<Record<string, unknown>>;
} {
  const emoji = SEVERITY_EMOJIS[report.severity];
  const color = SEVERITY_COLORS[report.severity];
  const title = `${emoji} ${report.title}`;

  // Build summary section
  const summaryText =
    `*Test Suite:* ${report.testSuiteName}\n` +
    `*Device:* ${report.device.name} (${report.device.platform.toUpperCase()} ${report.device.osVersion})\n` +
    `*Duration:* ${formatDuration(report.summary.duration)}\n` +
    `*Results:* ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.skipped} skipped\n` +
    `*Pass Rate:* ${report.passRate.toFixed(1)}%`;

  // Build failure details
  let failureText = '';
  if (report.failures.length > 0) {
    const failureList = report.failures
      .slice(0, 10)
      .map(
        (f, i) =>
          `${i + 1}. *${f.testName}*\n   ${f.errorMessage}${f.duration ? ` (${formatDuration(f.duration)})` : ''}`
      )
      .join('\n');

    const moreText = report.failures.length > 10 ? `\n... and ${report.failures.length - 10} more failures` : '';
    failureText = `\n*Failures (${report.failures.length})*\n${failureList}${moreText}`;
  }

  return {
    text: title,
    attachments: [
      {
        color,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: summaryText,
            },
          },
          ...(report.failures.length > 0
            ? [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: failureText,
                  },
                },
              ]
            : []),
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Test Run ID: \`${report.testRunId}\` | Completed: \`${formatDate(report.summary.completedAt || report.summary.startedAt)}\``,
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Generate email subject line
 */
export function generateEmailSubject(data: NotificationData): string {
  const severity = data.severity;
  const emoji = SEVERITY_EMOJIS[severity];

  return `${emoji} ${data.testRun.testSuiteName} - ${data.testRun.status}`;
}

/**
 * Generate email subject for summary report
 */
export function generateSummarySubject(report: TestSummaryReport): string {
  const emoji = SEVERITY_EMOJIS[report.severity];
  const status = report.summary.failed > 0 ? 'FAILED' : 'PASSED';
  return `${emoji} ${report.testSuiteName} - ${status} (${report.summary.passed}/${report.summary.total} passed)`;
}

/**
 * Generate HTML email body
 */
export function generateEmailHtml(data: NotificationData): string {
  const severity = data.severity;
  const color = SEVERITY_COLORS[severity];

  const failedTests =
    data.testResults?.filter((r) => r.status === 'FAILED').map((t) => ({
      name: t.testCaseName,
      error: t.errorMessage || 'No error message',
    })) || [];

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { padding: 15px; background: ${color}; color: white; border-radius: 5px 5px 0 0; }
    .content { padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 5px 5px; }
    .summary { display: flex; justify-content: space-between; margin-bottom: 20px; }
    .stat-box { text-align: center; padding: 10px; background: #f5f5f5; border-radius: 5px; flex: 1; margin: 0 5px; }
    .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
    .stat-value { font-size: 24px; font-weight: bold; }
    .passed { color: #28a745; }
    .failed { color: #dc3545; }
    .skipped { color: #6c757d; }
    .failures { margin-top: 20px; }
    .failure-item { padding: 10px; background: #fff3cd; border-left: 3px solid #ffc107; margin-bottom: 10px; border-radius: 3px; }
    .failure-name { font-weight: bold; margin-bottom: 5px; }
    .failure-error { font-size: 14px; color: #856404; font-family: monospace; }
    .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${data.testRun.testSuiteName} - ${data.testRun.status}</h1>
      <p>Device: ${data.testRun.deviceName} (${data.testRun.devicePlatform.toUpperCase()})</p>
    </div>
    <div class="content">
      <div class="summary">
        <div class="stat-box">
          <div class="stat-label">Total</div>
          <div class="stat-value">${data.testRun.passedCount + data.testRun.failedCount + data.testRun.skippedCount}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Passed</div>
          <div class="stat-value passed">${data.testRun.passedCount}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Failed</div>
          <div class="stat-value failed">${data.testRun.failedCount}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Skipped</div>
          <div class="stat-value skipped">${data.testRun.skippedCount}</div>
        </div>
      </div>
      ${failedTests.length > 0
        ? `
      <div class="failures">
        <h3>Failed Tests (${failedTests.length})</h3>
        ${failedTests
          .slice(0, 10)
          .map(
            (f) => `
          <div class="failure-item">
            <div class="failure-name">${f.name}</div>
            <div class="failure-error">${f.error}</div>
          </div>
        `
          ).join('')}
        ${failedTests.length > 10 ? `<p><em>... and ${failedTests.length - 10} more failures</em></p>` : ''}
      </div>
      `
        : ''}
      <div class="footer">
        <p>Test Run ID: ${data.testRun.id}</p>
        <p>Started: ${data.testRun.startedAt ? formatDate(data.testRun.startedAt) : 'N/A'}</p>
        ${data.testRun.totalDuration ? `<p>Duration: ${formatDuration(data.testRun.totalDuration)}</p>` : ''}
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text email body
 */
export function generateEmailText(data: NotificationData): string {
  const lines = [
    `Test: ${data.testRun.testSuiteName}`,
    `Status: ${data.testRun.status}`,
    `Device: ${data.testRun.deviceName} (${data.testRun.devicePlatform.toUpperCase()})`,
    '',
    'Results:',
    `  Total: ${data.testRun.passedCount + data.testRun.failedCount + data.testRun.skippedCount}`,
    `  Passed: ${data.testRun.passedCount}`,
    `  Failed: ${data.testRun.failedCount}`,
    `  Skipped: ${data.testRun.skippedCount}`,
    '',
    `Started: ${data.testRun.startedAt ? formatDate(data.testRun.startedAt) : 'N/A'}`,
    data.testRun.totalDuration ? `Duration: ${formatDuration(data.testRun.totalDuration)}` : '',
    '',
    `Test Run ID: ${data.testRun.id}`,
  ];

  const failedTests =
    data.testResults?.filter((r) => r.status === 'FAILED').map((t) => ({
      name: t.testCaseName,
      error: t.errorMessage || 'No error message',
    })) || [];

  if (failedTests.length > 0) {
    lines.push('', 'Failed Tests:');
    failedTests.slice(0, 10).forEach((f, i) => {
      lines.push(`${i + 1}. ${f.name}`);
      lines.push(`   ${f.error}`);
    });
    if (failedTests.length > 10) {
      lines.push(`... and ${failedTests.length - 10} more failures`);
    }
  }

  return lines.filter(Boolean).join('\n');
}

/**
 * Generate webhook payload
 */
export function generateWebhookPayload(data: NotificationData): Record<string, unknown> {
  return {
    version: '1.0',
    eventType: data.trigger,
    severity: data.severity,
    timestamp: new Date().toISOString(),
    testRun: {
      id: data.testRun.id,
      testSuiteId: data.testRun.testSuiteId,
      testSuiteName: data.testRun.testSuiteName,
      deviceId: data.testRun.deviceId,
      deviceName: data.testRun.deviceName,
      devicePlatform: data.testRun.devicePlatform,
      status: data.testRun.status,
      startedAt: data.testRun.startedAt?.toISOString(),
      completedAt: data.testRun.completedAt?.toISOString(),
      totalDuration: data.testRun.totalDuration,
      passedCount: data.testRun.passedCount,
      failedCount: data.testRun.failedCount,
      skippedCount: data.testRun.skippedCount,
    },
    testResults: data.testResults?.map((r) => ({
      id: r.id,
      testCaseName: r.testCaseName,
      status: r.status,
      duration: r.duration,
      errorMessage: r.errorMessage,
    })),
    metadata: data.metadata,
  };
}

/**
 * Generate summary report payload for webhooks
 */
export function generateSummaryPayload(report: TestSummaryReport): Record<string, unknown> {
  return {
    version: '1.0',
    eventType: 'test_summary',
    severity: report.severity,
    timestamp: new Date().toISOString(),
    title: report.title,
    testRunId: report.testRunId,
    testSuiteName: report.testSuiteName,
    device: report.device,
    summary: {
      ...report.summary,
      startedAt: report.summary.startedAt.toISOString(),
      completedAt: report.summary.completedAt?.toISOString(),
    },
    failures: report.failures,
    passRate: report.passRate,
    metadata: report.metadata,
  };
}

/**
 * Generate Slack message for flaky test notification
 */
export function generateFlakyTestSlackMessage(event: FlakyTestEvent): {
  text: string;
  blocks: Array<Record<string, unknown>>;
} {
  const typeConfig = {
    detected: { emoji: '🔬', color: '#ff9900', title: 'Flaky Test Detected' },
    quarantined: { emoji: '🚫', color: '#ff4444', title: 'Test Quarantined' },
    promoted: { emoji: '✅', color: '#36a64f', title: 'Test Promoted from Quarantine' },
    stabilizing: { emoji: '📈', color: '#ffcc00', title: 'Test Stabilizing' },
  };

  const config = typeConfig[event.type];
  const title = `${config.emoji} ${config.title}`;

  const analysis = event.analysis;
  const patternDisplay = analysis.recentPattern || 'N/A';

  const blocks: Array<Record<string, unknown>> = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: title,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Test Suite:*\n${event.testSuiteName}`,
        },
        {
          type: 'mrkdwn',
          text: `*Test Case:*\n${event.testCaseName}`,
        },
        {
          type: 'mrkdwn',
          text: `*Flakiness Score:*\n${(analysis.flakinessScore * 100).toFixed(1)}%`,
        },
        {
          type: 'mrkdwn',
          text: `*Pass Rate:*\n${analysis.passRate.toFixed(1)}%`,
        },
        {
          type: 'mrkdwn',
          text: `*Total Runs:*\n${analysis.totalRuns}`,
        },
        {
          type: 'mrkdwn',
          text: `*Recent Pattern:*\n\`${patternDisplay}\``,
        },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Reason:*\n${analysis.reason}`,
      },
    },
  ];

  // Add failure patterns if detected
  if (analysis.failurePatterns.length > 0) {
    const patterns = analysis.failurePatterns
      .slice(0, 3)
      .map((p) => `• *${p.type}*: ${p.description}`)
      .join('\n');
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Detected Patterns:*\n${patterns}`,
      },
    });
  }

  // Add suggested fixes
  if (analysis.suggestedFixes.length > 0) {
    const fixes = analysis.suggestedFixes.slice(0, 5).map((f) => `• ${f}`).join('\n');
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Suggested Fixes:*\n${fixes}`,
      },
    });
  }

  // Add assigned team info
  if (event.assignedTeam) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Assigned Team:* ${event.assignedTeam}`,
      },
    });
  }

  blocks.push(
    {
      type: 'divider',
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Test Case ID: \`${event.testCaseId}\` | Test Suite ID: \`${event.testSuiteId}\` | ${formatDate(event.timestamp)}`,
        },
      ],
    }
  );

  return {
    text: title,
    blocks,
  };
}

/**
 * Generate email subject for flaky test notification
 */
export function generateFlakyTestSubject(event: FlakyTestEvent): string {
  const typePrefix = {
    detected: '🔬 Flaky Test Detected',
    quarantined: '🚫 Test Quarantined',
    promoted: '✅ Test Promoted',
    stabilizing: '📈 Test Stabilizing',
  };

  return `${typePrefix[event.type]}: ${event.testSuiteName} - ${event.testCaseName}`;
}

/**
 * Generate HTML email body for flaky test notification
 */
export function generateFlakyTestEmailHtml(event: FlakyTestEvent): string {
  const typeConfig = {
    detected: { color: '#ff9900', title: 'Flaky Test Detected' },
    quarantined: { color: '#ff4444', title: 'Test Quarantined' },
    promoted: { color: '#28a745', title: 'Test Promoted from Quarantine' },
    stabilizing: { color: '#ffcc00', title: 'Test Stabilizing' },
  };

  const config = typeConfig[event.type];
  const analysis = event.analysis;

  const failurePatterns = analysis.failurePatterns
    .map((p) => `<li><strong>${p.type}</strong>: ${p.description}</li>`)
    .join('');

  const suggestedFixes = analysis.suggestedFixes
    .map((f) => `<li>${f}</li>`)
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { padding: 15px; background: ${config.color}; color: white; border-radius: 5px 5px 0 0; }
    .content { padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 5px 5px; }
    .metric-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
    .metric-box { padding: 15px; background: #f8f9fa; border-radius: 5px; text-align: center; }
    .metric-label { font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 5px; }
    .metric-value { font-size: 24px; font-weight: bold; }
    .pattern-display { font-family: monospace; background: #f1f1f1; padding: 10px; border-radius: 5px; letter-spacing: 3px; text-align: center; font-size: 16px; margin: 10px 0; }
    .section { margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 5px; }
    .section-title { font-weight: bold; margin-bottom: 10px; color: #444; }
    ul { margin: 0; padding-left: 20px; }
    li { margin-bottom: 8px; }
    .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
    .flakiness-low { color: #28a745; }
    .flakiness-medium { color: #ffc107; }
    .flakiness-high { color: #fd7e14; }
    .flakiness-critical { color: #dc3545; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${config.title}</h1>
      <p>${event.testSuiteName} / ${event.testCaseName}</p>
    </div>
    <div class="content">
      <div class="metric-grid">
        <div class="metric-box">
          <div class="metric-label">Flakiness Score</div>
          <div class="metric-value ${getFlakinessClass(analysis.flakinessScore)}">${(analysis.flakinessScore * 100).toFixed(1)}%</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Pass Rate</div>
          <div class="metric-value">${analysis.passRate.toFixed(1)}%</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Total Runs</div>
          <div class="metric-value">${analysis.totalRuns}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Confidence</div>
          <div class="metric-value">${analysis.confidence.toUpperCase()}</div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Recent Execution Pattern</div>
        <div class="pattern-display">${analysis.recentPattern || 'N/A'}</div>
        <p style="text-align: center; color: #666; font-size: 14px;">
          P = Pass, F = Fail | Last ${analysis.recentPattern?.length || 0} runs
        </p>
      </div>

      <div class="section">
        <div class="section-title">Reason</div>
        <p>${analysis.reason}</p>
      </div>

      ${analysis.failurePatterns.length > 0 ? `
      <div class="section">
        <div class="section-title">Detected Failure Patterns</div>
        <ul>${failurePatterns}</ul>
      </div>
      ` : ''}

      ${analysis.suggestedFixes.length > 0 ? `
      <div class="section">
        <div class="section-title">Suggested Fixes</div>
        <ul>${suggestedFixes}</ul>
      </div>
      ` : ''}

      ${event.assignedTeam ? `
      <div class="section">
        <div class="section-title">Assigned Team</div>
        <p>${event.assignedTeam}</p>
      </div>
      ` : ''}

      <div class="footer">
        <p>Test Case ID: ${event.testCaseId}</p>
        <p>Test Suite ID: ${event.testSuiteId}</p>
        <p>Detected: ${formatDate(event.timestamp)}</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text email body for flaky test notification
 */
export function generateFlakyTestEmailText(event: FlakyTestEvent): string {
  const typePrefix = {
    detected: 'FLAKY TEST DETECTED',
    quarantined: 'TEST QUARANTINED',
    promoted: 'TEST PROMOTED',
    stabilizing: 'TEST STABILIZING',
  };

  const lines = [
    `=== ${typePrefix[event.type]} ===`,
    '',
    `Test Suite: ${event.testSuiteName}`,
    `Test Case: ${event.testCaseName}`,
    '',
    '--- Metrics ---',
    `Flakiness Score: ${(event.analysis.flakinessScore * 100).toFixed(1)}%`,
    `Pass Rate: ${event.analysis.passRate.toFixed(1)}%`,
    `Total Runs: ${event.analysis.totalRuns}`,
    `Confidence: ${event.analysis.confidence.toUpperCase()}`,
    `Recent Pattern: ${event.analysis.recentPattern || 'N/A'}`,
    '',
    '--- Details ---',
    `Reason: ${event.analysis.reason}`,
    '',
  ];

  if (event.analysis.failurePatterns.length > 0) {
    lines.push('Detected Patterns:');
    for (const pattern of event.analysis.failurePatterns) {
      lines.push(`  - ${pattern.type}: ${pattern.description}`);
    }
    lines.push('');
  }

  if (event.analysis.suggestedFixes.length > 0) {
    lines.push('Suggested Fixes:');
    for (const fix of event.analysis.suggestedFixes) {
      lines.push(`  - ${fix}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(`Test Case ID: ${event.testCaseId}`);
  lines.push(`Test Suite ID: ${event.testSuiteId}`);
  lines.push(`Detected: ${formatDate(event.timestamp)}`);

  return lines.join('\n');
}

/**
 * Get CSS class for flakiness score
 */
function getFlakinessClass(score: number): string {
  if (score < 0.3) return 'flakiness-low';
  if (score < 0.6) return 'flakiness-medium';
  if (score < 0.8) return 'flakiness-high';
  return 'flakiness-critical';
}

/**
 * Generate webhook payload for flaky test notification
 */
export function generateFlakyTestWebhookPayload(event: FlakyTestEvent): Record<string, unknown> {
  return {
    version: '1.0',
    eventType: `flaky_test_${event.type}`,
    timestamp: event.timestamp.toISOString(),
    event: {
      type: event.type,
      testCaseId: event.testCaseId,
      testSuiteId: event.testSuiteId,
      testCaseName: event.testCaseName,
      testSuiteName: event.testSuiteName,
      assignedTeam: event.assignedTeam,
    },
    analysis: {
      isFlaky: event.analysis.isFlaky,
      flakinessScore: event.analysis.flakinessScore,
      confidence: event.analysis.confidence,
      totalRuns: event.analysis.totalRuns,
      passCount: event.analysis.passCount,
      failCount: event.analysis.failCount,
      passRate: event.analysis.passRate,
      recentPattern: event.analysis.recentPattern,
      failurePatterns: event.analysis.failurePatterns,
      suggestedFixes: event.analysis.suggestedFixes,
      shouldQuarantine: event.analysis.shouldQuarantine,
      reason: event.analysis.reason,
    },
  };
}
