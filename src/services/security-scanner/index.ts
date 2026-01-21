/**
 * Security Scanner Service
 *
 * Main service for security scanning functionality.
 * Provides comprehensive security analysis including:
 * - Insecure data storage checks
 * - Exposed API key detection
 * - Insecure network configuration checks
 * - Security report generation
 */

import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { v4 as uuidv4 } from 'uuid';
import { APIKeyDetector } from './api-key-detection.js';
import { InsecureStorageChecker } from './insecure-storage-check.js';
import { NetworkConfigChecker } from './network-config-check.js';
import { SecurityReportGenerator } from './report-generator.js';
import {
  SecurityCategory,
  SecuritySeverity,
  SecurityReportFormat,
  type AnySecurityFinding,
  type SecurityScanOptions,
  type SecurityScanResult,
  type SecurityScanSummary,
  type SecurityReportOptions,
} from './types.js';

/**
 * Default scan options
 */
const DEFAULT_SCAN_OPTIONS: SecurityScanOptions = {
  checkInsecureStorage: true,
  checkExposedKeys: true,
  checkInsecureNetwork: true,
  includePaths: ['./src', './config'],
  excludePaths: ['node_modules', '.git', 'dist', 'build', 'coverage'],
  filePatterns: ['**/*.{js,ts,jsx,tsx,json,env,config.js}'],
  maxDepth: 10,
  followSymlinks: false,
};

/**
 * Security Scanner class
 */
export class SecurityScanner {
  private apiKeyDetector: APIKeyDetector;
  private storageChecker: InsecureStorageChecker;
  private networkChecker: NetworkConfigChecker;
  private reportGenerator: SecurityReportGenerator;

  constructor() {
    this.apiKeyDetector = new APIKeyDetector();
    this.storageChecker = new InsecureStorageChecker();
    this.networkChecker = new NetworkConfigChecker();
    this.reportGenerator = new SecurityReportGenerator();
  }

  /**
   * Perform a security scan
   */
  async scan(options: Partial<SecurityScanOptions> = {}): Promise<SecurityScanResult> {
    const scanOptions = { ...DEFAULT_SCAN_OPTIONS, ...options };
    const scanId = uuidv4();
    const startTime = Date.now();

    const findings: AnySecurityFinding[] = [];
    const scannedPaths: string[] = [];
    let scannedFiles = 0;

    // Determine paths to scan
    const pathsToScan = scanOptions.includePaths || ['./'];

    // Scan each path
    for (const scanPath of pathsToScan) {
      const pathFindings = await this.scanPath(scanPath, scanOptions);
      findings.push(...pathFindings.findings);
      scannedPaths.push(...pathFindings.paths);
      scannedFiles += pathFindings.fileCount;
    }

    const duration = Date.now() - startTime;

    return {
      scanId,
      timestamp: new Date(),
      duration,
      options: scanOptions,
      findings,
      summary: this.generateSummary(findings),
      scannedPaths,
      scannedFiles,
    };
  }

  /**
   * Scan a single path for security issues
   */
  private async scanPath(
    scanPath: string,
    options: SecurityScanOptions
  ): Promise<{ findings: AnySecurityFinding[]; paths: string[]; fileCount: number }> {
    const findings: AnySecurityFinding[] = [];
    const scannedPaths: string[] = [];
    let fileCount = 0;

    try {
      const stat = await fs.stat(scanPath);

      if (stat.isFile()) {
        // Scan single file
        const fileFindings = await this.scanFile(scanPath, options);
        findings.push(...fileFindings);
        scannedPaths.push(scanPath);
        fileCount = 1;
      } else if (stat.isDirectory()) {
        // Scan directory
        const dirResults = await this.scanDirectory(scanPath, options);
        findings.push(...dirResults.findings);
        scannedPaths.push(...dirResults.paths);
        fileCount = dirResults.fileCount;
      }
    } catch (error) {
      // Skip files/directories that can't be accessed
    }

    return { findings, paths: scannedPaths, fileCount };
  }

  /**
   * Scan a directory for security issues
   */
  private async scanDirectory(
    dirPath: string,
    options: SecurityScanOptions,
    currentDepth = 0
  ): Promise<{ findings: AnySecurityFinding[]; paths: string[]; fileCount: number }> {
    const findings: AnySecurityFinding[] = [];
    const scannedPaths: string[] = [];
    let fileCount = 0;

    // Check max depth
    if (options.maxDepth !== undefined && currentDepth >= options.maxDepth) {
      return { findings, paths: scannedPaths, fileCount };
    }

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = `${dirPath}/${entry.name}`;

        // Skip excluded paths
        if (this.shouldExcludePath(fullPath, options.excludePaths)) {
          continue;
        }

        // Skip symlinks if not following them
        if (entry.isSymbolicLink() && !options.followSymlinks) {
          continue;
        }

        if (entry.isDirectory()) {
          // Recursively scan subdirectory
          const subResults = await this.scanDirectory(fullPath, options, currentDepth + 1);
          findings.push(...subResults.findings);
          scannedPaths.push(...subResults.paths);
          fileCount += subResults.fileCount;
        } else if (entry.isFile()) {
          // Scan file if it matches patterns
          if (this.shouldScanFile(fullPath, options.filePatterns)) {
            const fileFindings = await this.scanFile(fullPath, options);
            findings.push(...fileFindings);
            scannedPaths.push(fullPath);
            fileCount++;
          }
        }
      }
    } catch (error) {
      // Skip directories that can't be accessed
    }

    return { findings, paths: scannedPaths, fileCount };
  }

  /**
   * Scan a single file for security issues
   */
  private async scanFile(
    filePath: string,
    options: SecurityScanOptions
  ): Promise<AnySecurityFinding[]> {
    const findings: AnySecurityFinding[] = [];

    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Check for exposed API keys
      if (options.checkExposedKeys !== false) {
        const keyFindings = await this.apiKeyDetector.scanFile(filePath, content);
        findings.push(...keyFindings);
      }

      // Check for insecure storage
      if (options.checkInsecureStorage !== false) {
        const storageFindings = await this.storageChecker.scanFile(filePath, content);
        findings.push(...storageFindings);
      }

      // Check for insecure network configurations
      if (options.checkInsecureNetwork !== false) {
        const networkFindings = await this.networkChecker.scanFile(filePath, content);
        findings.push(...networkFindings);
      }
    } catch (error) {
      // Skip files that can't be read
    }

    return findings;
  }

  /**
   * Check if a path should be excluded
   */
  private shouldExcludePath(path: string, excludePaths?: string[]): boolean {
    if (!excludePaths || excludePaths.length === 0) {
      return false;
    }

    const normalizedPath = path.replace(/\\/g, '/');

    for (const exclude of excludePaths) {
      if (normalizedPath.includes(exclude)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a file should be scanned based on file patterns
   */
  private shouldScanFile(filePath: string, filePatterns?: string[]): boolean {
    if (!filePatterns || filePatterns.length === 0) {
      return true;
    }

    const fileName = filePath.split('/').pop() || '';

    for (const pattern of filePatterns) {
      // Simple glob pattern matching
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');

      const regex = new RegExp(regexPattern, 'i');

      if (regex.test(fileName) || regex.test(filePath)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate summary from findings
   */
  private generateSummary(findings: AnySecurityFinding[]): SecurityScanSummary {
    const summary: SecurityScanSummary = {
      total: findings.length,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
      byCategory: {
        [SecurityCategory.INSECURE_STORAGE]: 0,
        [SecurityCategory.EXPOSED_API_KEY]: 0,
        [SecurityCategory.INSECURE_NETWORK]: 0,
        [SecurityCategory.WEAK_CRYPTO]: 0,
        [SecurityCategory.AUTH_ISSUE]: 0,
        [SecurityCategory.DATA_LEAK]: 0,
      },
    };

    // Initialize category counts
    for (const category of Object.values(SecurityCategory)) {
      if (summary.byCategory[category] === undefined) {
        summary.byCategory[category] = 0;
      }
    }

    // Count findings
    for (const finding of findings) {
      switch (finding.severity) {
        case 'critical':
          summary.critical++;
          break;
        case 'high':
          summary.high++;
          break;
        case 'medium':
          summary.medium++;
          break;
        case 'low':
          summary.low++;
          break;
        case 'info':
          summary.info++;
          break;
      }

      summary.byCategory[finding.category]++;
    }

    return summary;
  }

  /**
   * Generate a security report
   */
  generateReport(
    scanResult: SecurityScanResult,
    format: SecurityReportFormat = SecurityReportFormat.TEXT
  ): string {
    const options: SecurityReportOptions = {
      format,
      includeSummary: true,
      includeDetails: true,
      includeRecommendations: true,
      sortBy: 'severity',
    };

    const report = this.reportGenerator.generateReport(scanResult, options);
    return report.content;
  }

  /**
   * Save a security report to a file
   */
  async saveReport(
    scanResult: SecurityScanResult,
    outputPath: string,
    format?: SecurityReportFormat
  ): Promise<void> {
    // Detect format from file extension if not specified
    let reportFormat = format;
    if (!reportFormat) {
      const ext = outputPath.substring(outputPath.lastIndexOf('.'));
      switch (ext) {
        case '.json':
          reportFormat = SecurityReportFormat.JSON;
          break;
        case '.html':
          reportFormat = SecurityReportFormat.HTML;
          break;
        case '.md':
          reportFormat = SecurityReportFormat.MARKDOWN;
          break;
        default:
          reportFormat = SecurityReportFormat.TEXT;
      }
    }

    const options: SecurityReportOptions = {
      format: reportFormat,
      includeSummary: true,
      includeDetails: true,
      includeRecommendations: true,
      sortBy: 'severity',
      outputPath,
    };

    await this.reportGenerator.generateReport(scanResult, options);
  }

  /**
   * Quick scan for critical issues only
   */
  async quickScan(paths?: string[]): Promise<SecurityScanResult> {
    const result = await this.scan({
      includePaths: paths,
      checkInsecureStorage: true,
      checkExposedKeys: true,
      checkInsecureNetwork: true,
    });

    // Filter to only critical and high severity
    result.findings = result.findings.filter(
      (f) => f.severity === 'critical' || f.severity === 'high'
    );

    // Recalculate summary
    result.summary = this.generateSummary(result.findings);

    return result;
  }

  /**
   * Scan for exposed API keys only
   */
  async scanForAPIKeys(paths?: string[]): Promise<SecurityScanResult> {
    const result = await this.scan({
      includePaths: paths,
      checkExposedKeys: true,
      checkInsecureStorage: false,
      checkInsecureNetwork: false,
    });

    return result;
  }

  /**
   * Scan for insecure storage only
   */
  async scanForInsecureStorage(paths?: string[]): Promise<SecurityScanResult> {
    const result = await this.scan({
      includePaths: paths,
      checkExposedKeys: false,
      checkInsecureStorage: true,
      checkInsecureNetwork: false,
    });

    return result;
  }

  /**
   * Scan for insecure network configurations only
   */
  async scanForNetworkIssues(paths?: string[]): Promise<SecurityScanResult> {
    const result = await this.scan({
      includePaths: paths,
      checkExposedKeys: false,
      checkInsecureStorage: false,
      checkInsecureNetwork: true,
    });

    return result;
  }

  /**
   * Get the API key detector instance
   */
  getAPIKeyDetector(): APIKeyDetector {
    return this.apiKeyDetector;
  }

  /**
   * Get the insecure storage checker instance
   */
  getStorageChecker(): InsecureStorageChecker {
    return this.storageChecker;
  }

  /**
   * Get the network configuration checker instance
   */
  getNetworkChecker(): NetworkConfigChecker {
    return this.networkChecker;
  }

  /**
   * Get the report generator instance
   */
  getReportGenerator(): SecurityReportGenerator {
    return this.reportGenerator;
  }
}

// Global scanner instance
let globalScanner: SecurityScanner | null = null;

/**
 * Get the global security scanner instance
 */
export function getSecurityScanner(): SecurityScanner {
  if (!globalScanner) {
    globalScanner = new SecurityScanner();
  }
  return globalScanner;
}

/**
 * Reset the global security scanner instance
 */
export function resetSecurityScanner(): void {
  globalScanner = null;
}

/**
 * Convenience function to perform a security scan
 */
export async function scanSecurity(
  options?: Partial<SecurityScanOptions>
): Promise<SecurityScanResult> {
  const scanner = getSecurityScanner();
  return scanner.scan(options);
}

/**
 * Convenience function to perform a quick security scan
 */
export async function quickSecurityScan(paths?: string[]): Promise<SecurityScanResult> {
  const scanner = getSecurityScanner();
  return scanner.quickScan(paths);
}

/**
 * Convenience function to scan for API keys
 */
export async function scanForAPIKeys(paths?: string[]): Promise<SecurityScanResult> {
  const scanner = getSecurityScanner();
  return scanner.scanForAPIKeys(paths);
}

// Export all types
export * from './types.js';

// Export sub-modules
export { APIKeyDetector } from './api-key-detection.js';
export { InsecureStorageChecker } from './insecure-storage-check.js';
export { NetworkConfigChecker } from './network-config-check.js';
export { SecurityReportGenerator } from './report-generator.js';
