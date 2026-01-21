/**
 * Accessibility Tester
 *
 * Main accessibility testing service that coordinates platform-specific
 * accessibility scans for iOS and Android applications.
 */

import type {
  AccessibilityScanResult,
  AccessibilityScanConfig,
  AccessibilityViolation,
  AccessibilityDriver,
  AccessibilityTreeNode,
} from './types.js';
import {
  AccessibilitySeverity,
  AccessibilityViolationType,
  AccessibilityError,
  AccessibilityErrorType,
} from './types.js';
import { IOSA11yScanner, createIOSA11yScanner } from './ios-a11y-scanner.js';
import { AndroidA11yScanner, createAndroidA11yScanner } from './android-a11y-scanner.js';
import { createModuleLogger } from '../../utils/logger.js';

const logger = createModuleLogger('accessibility-tester');

/**
 * Default accessibility scan configuration
 */
const DEFAULT_CONFIG: Required<AccessibilityScanConfig> = {
  checkMissingLabels: true,
  checkContrast: true,
  checkFocus: true,
  checkTouchTargets: true,
  checkDuplicateIds: true,
  minContrastAA: 4.5,
  minContrastAAA: 7.0,
  minTouchTargetSize: {
    width: 44,
    height: 44,
  },
  excludeSelectors: [],
  includeSelectors: [],
  timeout: 60000,
};

/**
 * Accessibility Tester class
 */
export class AccessibilityTester {
  private driver: AccessibilityDriver;
  private config: Required<AccessibilityScanConfig>;
  private iosScanner: IOSA11yScanner | null = null;
  private androidScanner: AndroidA11yScanner | null = null;

  constructor(driver: AccessibilityDriver, config?: AccessibilityScanConfig) {
    this.driver = driver;
    this.config = { ...DEFAULT_CONFIG, ...config };

    logger.info('Accessibility Tester initialized', {
      checkMissingLabels: this.config.checkMissingLabels,
      checkContrast: this.config.checkContrast,
      checkFocus: this.config.checkFocus,
    });
  }

  /**
   * Run a complete accessibility scan
   */
  async scan(scanConfig?: Partial<AccessibilityScanConfig>): Promise<AccessibilityScanResult> {
    const startTime = Date.now();
    const scanId = `a11y_scan_${Date.now()}`;

    logger.info('Starting accessibility scan', { scanId, scanConfig });

    const mergedConfig = { ...this.config, ...scanConfig };

    try {
      const platform = await this.driver.getPlatform();

      if (platform === 'web') {
        throw new AccessibilityError(
          AccessibilityErrorType.PLATFORM_NOT_SUPPORTED,
          'Web platform accessibility testing is not yet supported. Please use iOS or Android.'
        );
      }

      // Get scanner for current platform
      const scanner = this.getPlatformScanner(platform);

      // Run the scan
      const violations = await scanner.scan(mergedConfig);

      const duration = Date.now() - startTime;

      // Group violations by severity
      const violationsBySeverity = this.groupViolationsBySeverity(violations);

      // Group violations by type
      const violationsByType = this.groupViolationsByType(violations);

      // Calculate accessibility score
      const score = this.calculateAccessibilityScore(violations);

      const result: AccessibilityScanResult = {
        id: scanId,
        platform: platform as 'ios' | 'android',
        target: await this.getTargetIdentifier(),
        timestamp: new Date(),
        duration,
        violations,
        violationsBySeverity,
        violationsByType,
        score,
        success: true,
      };

      logger.info('Accessibility scan completed', {
        scanId,
        violationCount: violations.length,
        score,
        duration,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Accessibility scan failed', { error });

      return {
        id: scanId,
        platform: await this.driver.getPlatform().then(() => 'ios' as const).catch(() => 'ios' as const),
        target: 'unknown',
        timestamp: new Date(),
        duration,
        violations: [],
        violationsBySeverity: {
          critical: [],
          serious: [],
          moderate: [],
          minor: [],
        },
        violationsByType: new Map(),
        score: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Scan for specific violation types only
   */
  async scanForViolationTypes(
    types: AccessibilityViolationType[]
  ): Promise<AccessibilityViolation[]> {
    const result = await this.scan();
    return result.violations.filter((v) => types.includes(v.type));
  }

  /**
   * Check for missing labels only
   */
  async checkMissingLabels(): Promise<AccessibilityViolation[]> {
    return this.scanForViolationTypes([
      AccessibilityViolationType.MISSING_LABEL,
      AccessibilityViolationType.MISSING_ALT_TEXT,
      AccessibilityViolationType.UNLABELED_FIELD,
    ]);
  }

  /**
   * Check for contrast issues only
   */
  async checkContrast(): Promise<AccessibilityViolation[]> {
    return this.scanForViolationTypes([AccessibilityViolationType.LOW_CONTRAST]);
  }

  /**
   * Check for focus issues only
   */
  async checkFocus(): Promise<AccessibilityViolation[]> {
    return this.scanForViolationTypes([
      AccessibilityViolationType.NO_FOCUS,
      AccessibilityViolationType.INVALID_FOCUS_ORDER,
      AccessibilityViolationType.NO_FOCUS_INDICATOR,
    ]);
  }

  /**
   * Check for touch target issues only
   */
  async checkTouchTargets(): Promise<AccessibilityViolation[]> {
    return this.scanForViolationTypes([AccessibilityViolationType.SMALL_TOUCH_TARGET]);
  }

  /**
   * Get platform-specific scanner
   */
  private getPlatformScanner(platform: string): IOSA11yScanner | AndroidA11yScanner {
    if (platform === 'ios') {
      if (!this.iosScanner) {
        this.iosScanner = createIOSA11yScanner(this.driver);
      }
      return this.iosScanner;
    }

    if (platform === 'android') {
      if (!this.androidScanner) {
        this.androidScanner = createAndroidA11yScanner(this.driver);
      }
      return this.androidScanner;
    }

    throw new AccessibilityError(
      AccessibilityErrorType.PLATFORM_NOT_SUPPORTED,
      `Unsupported platform: ${platform}`
    );
  }

  /**
   * Group violations by severity
   */
  private groupViolationsBySeverity(violations: AccessibilityViolation[]): {
    critical: AccessibilityViolation[];
    serious: AccessibilityViolation[];
    moderate: AccessibilityViolation[];
    minor: AccessibilityViolation[];
  } {
    return {
      critical: violations.filter((v) => v.severity === AccessibilitySeverity.CRITICAL),
      serious: violations.filter((v) => v.severity === AccessibilitySeverity.SERIOUS),
      moderate: violations.filter((v) => v.severity === AccessibilitySeverity.MODERATE),
      minor: violations.filter((v) => v.severity === AccessibilitySeverity.MINOR),
    };
  }

  /**
   * Group violations by type
   */
  private groupViolationsByType(violations: AccessibilityViolation[]): Map<AccessibilityViolationType, AccessibilityViolation[]> {
    const map = new Map<AccessibilityViolationType, AccessibilityViolation[]>();

    for (const violation of violations) {
      if (!map.has(violation.type)) {
        map.set(violation.type, []);
      }
      map.get(violation.type)!.push(violation);
    }

    return map;
  }

  /**
   * Calculate accessibility score (0-100)
   */
  private calculateAccessibilityScore(violations: AccessibilityViolation[]): number {
    if (violations.length === 0) {
      return 100;
    }

    // Weight violations by severity
    const weights = {
      [AccessibilitySeverity.CRITICAL]: 25,
      [AccessibilitySeverity.SERIOUS]: 10,
      [AccessibilitySeverity.MODERATE]: 5,
      [AccessibilitySeverity.MINOR]: 1,
    };

    const totalPenalty = violations.reduce((sum, v) => sum + weights[v.severity], 0);

    // Calculate score (starting from 100, subtract penalties)
    const score = Math.max(0, 100 - totalPenalty);

    return score;
  }

  /**
   * Get target identifier (app or page)
   */
  private async getTargetIdentifier(): Promise<string> {
    try {
      const source = await this.driver.getPageSource();
      // Extract app/package name from source
      const match = source.match(/package=["']([^"']+)["']/) ||
                   source.match(/(?:app|bundle)[\s=:]["']([^"']+)["']/);
      return match ? match[1] : 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<Required<AccessibilityScanConfig>> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AccessibilityScanConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Accessibility tester config updated', { config });
  }

  /**
   * Generate accessibility report
   */
  generateReport(result: AccessibilityScanResult): string {
    const lines: string[] = [];

    lines.push('# Accessibility Scan Report');
    lines.push('');
    lines.push(`**Scan ID:** ${result.id}`);
    lines.push(`**Platform:** ${result.platform.toUpperCase()}`);
    lines.push(`**Timestamp:** ${result.timestamp.toISOString()}`);
    lines.push(`**Duration:** ${result.duration}ms`);
    lines.push(`**Score:** ${result.score}/100`);
    lines.push('');

    if (!result.success) {
      lines.push('## Scan Failed');
      lines.push(result.error || 'Unknown error');
      return lines.join('\n');
    }

    lines.push('## Summary');
    lines.push('');
    lines.push(`Total Violations: ${result.violations.length}`);
    lines.push(`- Critical: ${result.violationsBySeverity.critical.length}`);
    lines.push(`- Serious: ${result.violationsBySeverity.serious.length}`);
    lines.push(`- Moderate: ${result.violationsBySeverity.moderate.length}`);
    lines.push(`- Minor: ${result.violationsBySeverity.minor.length}`);
    lines.push('');

    // Group by type
    lines.push('## Violations by Type');
    lines.push('');

    for (const [type, violations] of result.violationsByType.entries()) {
      lines.push(`### ${type}`);
      lines.push('');
      for (const v of violations) {
        lines.push(`- [${v.severity.toUpperCase()}] ${v.message}`);
        lines.push(`  - Element: \`${v.element.elementType}\` (${v.element.identifier})`);
        if (v.recommendation) {
          lines.push(`  - Fix: ${v.recommendation}`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Export violations as JSON
   */
  exportJSON(result: AccessibilityScanResult): string {
    return JSON.stringify(
      {
        ...result,
        violationsByType: Object.fromEntries(result.violationsByType),
      },
      null,
      2
    );
  }
}

/**
 * Create a new accessibility tester instance
 */
export function createAccessibilityTester(
  driver: AccessibilityDriver,
  config?: AccessibilityScanConfig
): AccessibilityTester {
  return new AccessibilityTester(driver, config);
}

/**
 * Global accessibility tester instance
 */
let globalTester: AccessibilityTester | null = null;

/**
 * Get or create the global accessibility tester
 */
export function getAccessibilityTester(
  driver: AccessibilityDriver,
  config?: AccessibilityScanConfig
): AccessibilityTester {
  if (!globalTester) {
    globalTester = createAccessibilityTester(driver, config);
  }
  return globalTester;
}

/**
 * Reset the global accessibility tester
 */
export function resetAccessibilityTester(): void {
  globalTester = null;
}
