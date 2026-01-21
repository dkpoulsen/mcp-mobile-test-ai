/**
 * Security Report Generator Module
 *
 * Generates security reports in various formats.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  AnySecurityFinding,
  SecurityCategory,
  SecurityReport,
  SecurityReportFormat,
  SecurityReportOptions,
  SecurityScanResult,
  SecuritySeverity,
} from './types.js';

/**
 * Sort findings by severity
 */
function sortBySeverity(findings: AnySecurityFinding[]): AnySecurityFinding[] {
  const severityOrder = {
    [SecuritySeverity.CRITICAL]: 0,
    [SecuritySeverity.HIGH]: 1,
    [SecuritySeverity.MEDIUM]: 2,
    [SecuritySeverity.LOW]: 3,
    [SecuritySeverity.INFO]: 4,
  };

  return [...findings].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

/**
 * Sort findings by category
 */
function sortByCategory(findings: AnySecurityFinding[]): AnySecurityFinding[] {
  return [...findings].sort((a, b) => a.category.localeCompare(b.category));
}

/**
 * Sort findings by location
 */
function sortByLocation(findings: AnySecurityFinding[]): AnySecurityFinding[] {
  return [...findings].sort((a, b) => a.location.localeCompare(b.location));
}

/**
 * Filter findings by severity
 */
function filterBySeverity(
  findings: AnySecurityFinding[],
  severities?: SecuritySeverity[]
): AnySecurityFinding[] {
  if (!severities || severities.length === 0) {
    return findings;
  }
  return findings.filter((f) => severities.includes(f.severity));
}

/**
 * Filter findings by category
 */
function filterByCategory(
  findings: AnySecurityFinding[],
  categories?: SecurityCategory[]
): AnySecurityFinding[] {
  if (!categories || categories.length === 0) {
    return findings;
  }
  return findings.filter((f) => categories.includes(f.category));
}

/**
 * Apply sorting and filtering
 */
function applyFiltersAndSorting(
  findings: AnySecurityFinding[],
  options: SecurityReportOptions
): AnySecurityFinding[] {
  let filtered = findings;

  // Apply filters
  filtered = filterBySeverity(filtered, options.severityFilter);
  filtered = filterByCategory(filtered, options.categoryFilter);

  // Apply sorting
  switch (options.sortBy) {
    case 'severity':
      filtered = sortBySeverity(filtered);
      break;
    case 'category':
      filtered = sortByCategory(filtered);
      break;
    case 'location':
      filtered = sortByLocation(filtered);
      break;
  }

  return filtered;
}

/**
 * Generate JSON report
 */
function generateJsonReport(
  scanResult: SecurityScanResult,
  options: SecurityReportOptions
): string {
  const findings = applyFiltersAndSorting(scanResult.findings, options);

  const report: any = {
    scanId: scanResult.scanId,
    timestamp: scanResult.timestamp,
    duration: scanResult.duration,
    summary: options.includeSummary ? scanResult.summary : undefined,
    findings: options.includeDetails !== false ? findings : undefined,
    scannedPaths: scanResult.scannedPaths,
    scannedFiles: scanResult.scannedFiles,
  };

  return JSON.stringify(report, null, 2);
}

/**
 * Generate text report
 */
function generateTextReport(
  scanResult: SecurityScanResult,
  options: SecurityReportOptions
): string {
  const lines: string[] = [];
  const findings = applyFiltersAndSorting(scanResult.findings, options);

  // Header
  lines.push('='.repeat(60));
  lines.push('SECURITY SCAN REPORT');
  lines.push('='.repeat(60));
  lines.push('');

  // Scan info
  lines.push(`Scan ID: ${scanResult.scanId}`);
  lines.push(`Timestamp: ${scanResult.timestamp.toISOString()}`);
  lines.push(`Duration: ${scanResult.duration}ms`);
  lines.push(`Files Scanned: ${scanResult.scannedFiles}`);
  lines.push('');
  lines.push('-'.repeat(60));
  lines.push('');

  // Summary
  if (options.includeSummary !== false) {
    lines.push('SUMMARY');
    lines.push('-'.repeat(60));
    lines.push(`Total Findings: ${scanResult.summary.total}`);
    lines.push(`  Critical: ${scanResult.summary.critical}`);
    lines.push(`  High: ${scanResult.summary.high}`);
    lines.push(`  Medium: ${scanResult.summary.medium}`);
    lines.push(`  Low: ${scanResult.summary.low}`);
    lines.push(`  Info: ${scanResult.summary.info}`);
    lines.push('');
    lines.push('By Category:');
    for (const [category, count] of Object.entries(scanResult.summary.byCategory)) {
      if (count > 0) {
        lines.push(`  ${category}: ${count}`);
      }
    }
    lines.push('');
    lines.push('-'.repeat(60));
    lines.push('');
  }

  // Findings
  if (options.includeDetails !== false) {
    lines.push('FINDINGS');
    lines.push('-'.repeat(60));
    lines.push('');

    for (const finding of findings) {
      lines.push(`[${finding.severity.toUpperCase()}] ${finding.title}`);
      lines.push(`  Category: ${finding.category}`);
      lines.push(`  Location: ${finding.location}`);
      lines.push(`  Description: ${finding.description}`);

      if (finding.evidence) {
        lines.push(`  Evidence: ${finding.evidence}`);
      }

      if (options.includeRecommendations !== false) {
        lines.push(`  Recommendation: ${finding.recommendation}`);
      }

      if (finding.cwe) {
        lines.push(`  CWE: ${finding.cwe}`);
      }

      lines.push('');
    }
  }

  lines.push('='.repeat(60));

  return lines.join('\n');
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(
  scanResult: SecurityScanResult,
  options: SecurityReportOptions
): string {
  const lines: string[] = [];
  const findings = applyFiltersAndSorting(scanResult.findings, options);

  // Header
  lines.push('# Security Scan Report');
  lines.push('');
  lines.push(`**Scan ID:** ${scanResult.scanId}`);
  lines.push('');
  lines.push(`**Timestamp:** ${scanResult.timestamp.toISOString()}`);
  lines.push('');
  lines.push(`**Duration:** ${scanResult.duration}ms`);
  lines.push('');
  lines.push(`**Files Scanned:** ${scanResult.scannedFiles}`);
  lines.push('');

  // Summary
  if (options.includeSummary !== false) {
    lines.push('## Summary');
    lines.push('');
    lines.push('| Severity | Count |');
    lines.push('|----------|-------|');
    lines.push(`| Critical | ${scanResult.summary.critical} |`);
    lines.push(`| High | ${scanResult.summary.high} |`);
    lines.push(`| Medium | ${scanResult.summary.medium} |`);
    lines.push(`| Low | ${scanResult.summary.low} |`);
    lines.push(`| Info | ${scanResult.summary.info} |`);
    lines.push(`| **Total** | **${scanResult.summary.total}** |`);
    lines.push('');

    lines.push('### By Category');
    lines.push('');
    for (const [category, count] of Object.entries(scanResult.summary.byCategory)) {
      if (count > 0) {
        lines.push(`- **${category}**: ${count}`);
      }
    }
    lines.push('');
  }

  // Findings
  if (options.includeDetails !== false) {
    lines.push('## Findings');
    lines.push('');

    const severityIcons: Record<SecuritySeverity, string> = {
      [SecuritySeverity.CRITICAL]: '🔴',
      [SecuritySeverity.HIGH]: '🟠',
      [SecuritySeverity.MEDIUM]: '🟡',
      [SecuritySeverity.LOW]: '🟢',
      [SecuritySeverity.INFO]: 'ℹ️',
    };

    for (const finding of findings) {
      lines.push(`### ${severityIcons[finding.severity]} ${finding.title}`);
      lines.push('');
      lines.push(`**Category:** \`${finding.category}\``);
      lines.push('');
      lines.push(`**Location:** \`${finding.location}\``);
      lines.push('');
      lines.push(`**Description:** ${finding.description}`);
      lines.push('');

      if (finding.evidence) {
        lines.push(`**Evidence:**`);
        lines.push('');
        lines.push('```');
        lines.push(finding.evidence);
        lines.push('```');
        lines.push('');
      }

      if (options.includeRecommendations !== false) {
        lines.push('**Recommendation:**');
        lines.push('');
        lines.push(finding.recommendation);
        lines.push('');
      }

      if (finding.references && finding.references.length > 0) {
        lines.push('**References:**');
        lines.push('');
        for (const ref of finding.references) {
          lines.push(`- ${ref}`);
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

/**
 * Generate HTML report
 */
function generateHtmlReport(
  scanResult: SecurityScanResult,
  options: SecurityReportOptions
): string {
  const findings = applyFiltersAndSorting(scanResult.findings, options);

  const severityColors: Record<SecuritySeverity, string> = {
    [SecuritySeverity.CRITICAL]: '#dc2626',
    [SecuritySeverity.HIGH]: '#f97316',
    [SecuritySeverity.MEDIUM]: '#eab308',
    [SecuritySeverity.LOW]: '#22c55e',
    [SecuritySeverity.INFO]: '#3b82f6',
  };

  let html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Scan Report - ${scanResult.scanId}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f9fafb;
    }
    h1 { color: #111827; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
    h2 { color: #374151; margin-top: 30px; }
    .header { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
    .summary-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .summary-card h3 { margin: 0 0 10px 0; font-size: 14px; color: #6b7280; }
    .summary-card .count { font-size: 32px; font-weight: bold; }
    .critical { color: #dc2626; }
    .high { color: #f97316; }
    .medium { color: #eab308; }
    .low { color: #22c55e; }
    .info { color: #3b82f6; }
    .finding { background: white; padding: 20px; margin: 15px 0; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-left: 4px solid #e5e7eb; }
    .finding.critical { border-left-color: #dc2626; }
    .finding.high { border-left-color: #f97316; }
    .finding.medium { border-left-color: #eab308; }
    .finding.low { border-left-color: #22c55e; }
    .finding.info { border-left-color: #3b82f6; }
    .finding-header { display: flex; align-items: center; justify-content: space-between; }
    .finding-title { font-size: 18px; font-weight: 600; margin: 0; }
    .badge { padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; color: white; }
    .finding-details { margin-top: 15px; }
    .detail-row { display: flex; margin: 8px 0; }
    .detail-label { font-weight: 600; width: 120px; color: #6b7280; }
    .evidence { background: #f3f4f6; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 14px; overflow-x: auto; margin-top: 10px; }
    .recommendation { background: #eff6ff; padding: 15px; border-radius: 4px; margin-top: 10px; border-left: 4px solid #3b82f6; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Security Scan Report</h1>
    <p><strong>Scan ID:</strong> ${scanResult.scanId}</p>
    <p><strong>Timestamp:</strong> ${scanResult.timestamp.toISOString()}</p>
    <p><strong>Duration:</strong> ${scanResult.duration}ms</p>
    <p><strong>Files Scanned:</strong> ${scanResult.scannedFiles}</p>
  </div>
`;

  // Summary section
  if (options.includeSummary !== false) {
    html += `
  <div class="summary">
    <div class="summary-card">
      <h3>Total Findings</h3>
      <div class="count">${scanResult.summary.total}</div>
    </div>
    <div class="summary-card">
      <h3>Critical</h3>
      <div class="count critical">${scanResult.summary.critical}</div>
    </div>
    <div class="summary-card">
      <h3>High</h3>
      <div class="count high">${scanResult.summary.high}</div>
    </div>
    <div class="summary-card">
      <h3>Medium</h3>
      <div class="count medium">${scanResult.summary.medium}</div>
    </div>
    <div class="summary-card">
      <h3>Low</h3>
      <div class="count low">${scanResult.summary.low}</div>
    </div>
    <div class="summary-card">
      <h3>Info</h3>
      <div class="count info">${scanResult.summary.info}</div>
    </div>
  </div>
`;
  }

  // Findings section
  if (options.includeDetails !== false) {
    html += `  <h2>Findings</h2>`;

    for (const finding of findings) {
      const badgeColor = severityColors[finding.severity];
      html += `
  <div class="finding ${finding.severity}">
    <div class="finding-header">
      <h3 class="finding-title">${finding.title}</h3>
      <span class="badge" style="background-color: ${badgeColor}">${finding.severity.toUpperCase()}</span>
    </div>
    <div class="finding-details">
      <div class="detail-row">
        <span class="detail-label">Category:</span>
        <span>${finding.category}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Location:</span>
        <span><code>${finding.location}</code></span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Description:</span>
        <span>${finding.description}</span>
      </div>`;

      if (finding.evidence) {
        html += `
      <div class="evidence">${finding.evidence}</div>`;
      }

      if (options.includeRecommendations !== false) {
        html += `
      <div class="recommendation">
        <strong>Recommendation:</strong> ${finding.recommendation}
      </div>`;
      }

      html += `
    </div>
  </div>`;
    }
  }

  html += `
</body>
</html>`;

  return html;
}

/**
 * Security Report Generator class
 */
export class SecurityReportGenerator {
  /**
   * Generate a security report
   */
  generateReport(
    scanResult: SecurityScanResult,
    options: SecurityReportOptions
  ): SecurityReport {
    let content: string;

    switch (options.format) {
      case SecurityReportFormat.JSON:
        content = generateJsonReport(scanResult, options);
        break;
      case SecurityReportFormat.TEXT:
        content = generateTextReport(scanResult, options);
        break;
      case SecurityReportFormat.MARKDOWN:
        content = generateMarkdownReport(scanResult, options);
        break;
      case SecurityReportFormat.HTML:
        content = generateHtmlReport(scanResult, options);
        break;
      default:
        content = generateTextReport(scanResult, options);
    }

    const report: SecurityReport = {
      scanResult,
      format: options.format,
      generatedAt: new Date(),
      content,
    };

    // Write to file if path specified
    if (options.outputPath) {
      this.writeReportToFile(report, options.outputPath);
    }

    return report;
  }

  /**
   * Write report to file
   */
  async writeReportToFile(report: SecurityReport, filePath: string): Promise<void> {
    const fs = await import('node:fs/promises');
    await fs.writeFile(filePath, report.content, 'utf-8');
  }

  /**
   * Get report file extension for a format
   */
  getFileExtension(format: SecurityReportFormat): string {
    const extensions: Record<SecurityReportFormat, string> = {
      [SecurityReportFormat.JSON]: '.json',
      [SecurityReportFormat.TEXT]: '.txt',
      [SecurityReportFormat.MARKDOWN]: '.md',
      [SecurityReportFormat.HTML]: '.html',
    };
    return extensions[format];
  }
}
