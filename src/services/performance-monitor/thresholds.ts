/**
 * Performance threshold management and regression detection
 */

import { createModuleLogger } from '../../utils/logger.js';
import type {
  MetricThreshold,
  MetricSeverity,
  MetricType,
  RegressionResult,
  BaselineMetrics,
  PerformanceMetric,
  PerformanceSummary,
} from './types.js';

const logger = createModuleLogger('performance-thresholds');

/**
 * Default thresholds for performance metrics
 */
export const DEFAULT_THRESHOLDS: MetricThreshold[] = [
  {
    type: 'cpu' as MetricType,
    warningThreshold: 70,
    criticalThreshold: 90,
    regressionEnabled: true,
    regressionThreshold: 20, // 20% increase from baseline triggers warning
    field: 'usagePercent',
  },
  {
    type: 'memory' as MetricType,
    warningThreshold: 75,
    criticalThreshold: 90,
    regressionEnabled: true,
    regressionThreshold: 15, // 15% increase from baseline triggers warning
    field: 'usagePercent',
  },
  {
    type: 'battery' as MetricType,
    warningThreshold: 20,
    criticalThreshold: 10,
    regressionEnabled: false,
    regressionThreshold: 0,
    field: 'level',
  },
];

/**
 * Threshold manager
 */
export class ThresholdManager {
  /** Custom thresholds */
  private thresholds: Map<string, MetricThreshold> = new Map();

  /** Baseline metrics by test suite */
  private baselines: Map<string, BaselineMetrics> = new Map();

  constructor(customThresholds?: MetricThreshold[]) {
    // Initialize with defaults
    for (const threshold of DEFAULT_THRESHOLDS) {
      this.thresholds.set(threshold.type, threshold);
    }

    // Apply custom thresholds
    if (customThresholds) {
      for (const threshold of customThresholds) {
        this.thresholds.set(threshold.type, threshold);
      }
    }

    logger.info(
      { thresholdsCount: this.thresholds.size },
      'Threshold manager initialized'
    );
  }

  /**
   * Get threshold for a metric type
   */
  getThreshold(type: MetricType): MetricThreshold | undefined {
    return this.thresholds.get(type);
  }

  /**
   * Set or update a threshold
   */
  setThreshold(threshold: MetricThreshold): void {
    this.thresholds.set(threshold.type, threshold);
    logger.debug({ type: threshold.type }, 'Threshold updated');
  }

  /**
   * Remove a threshold
   */
  removeThreshold(type: MetricType): boolean {
    return this.thresholds.delete(type);
  }

  /**
   * Get all thresholds
   */
  getAllThresholds(): MetricThreshold[] {
    return Array.from(this.thresholds.values());
  }

  /**
   * Check a metric against thresholds
   */
  checkThreshold(
    metric: PerformanceMetric
  ): MetricSeverity {
    const threshold = this.getThreshold(metric.type);
    if (!threshold) {
      return 'info' as MetricSeverity;
    }

    let value: number | undefined;

    // Extract the value to check based on metric type
    switch (metric.type) {
      case 'cpu':
        value = threshold.field === 'usagePercent' ? metric.cpu?.usagePercent : undefined;
        break;
      case 'memory':
        value = threshold.field === 'usagePercent' ? metric.memory?.usagePercent : undefined;
        break;
      case 'battery':
        value = threshold.field === 'level' ? metric.battery?.level : undefined;
        break;
      case 'network':
        // Network metrics use different thresholds
        value = undefined;
        break;
    }

    if (value === undefined) {
      return 'info' as MetricSeverity;
    }

    // Check against thresholds
    // For battery, lower is worse; for others, higher is worse
    const isBattery = metric.type === 'battery';

    if (isBattery) {
      // Battery: lower level = more severe
      if (value <= threshold.criticalThreshold) {
        return 'critical' as MetricSeverity;
      }
      if (value <= threshold.warningThreshold) {
        return 'warning' as MetricSeverity;
      }
    } else {
      // CPU/Memory: higher value = more severe
      if (value >= threshold.criticalThreshold) {
        return 'critical' as MetricSeverity;
      }
      if (value >= threshold.warningThreshold) {
        return 'warning' as MetricSeverity;
      }
    }

    return 'info' as MetricSeverity;
  }

  /**
   * Set baseline metrics for a test suite
   */
  setBaseline(baseline: BaselineMetrics): void {
    this.baselines.set(baseline.testSuiteId, baseline);
    logger.info(
      { testSuiteId: baseline.testSuiteId },
      'Baseline metrics updated'
    );
  }

  /**
   * Get baseline metrics for a test suite
   */
  getBaseline(testSuiteId: string): BaselineMetrics | undefined {
    return this.baselines.get(testSuiteId);
  }

  /**
   * Calculate baseline from historical performance summaries
   */
  calculateBaseline(
    testSuiteId: string,
    summaries: PerformanceSummary[]
  ): BaselineMetrics {
    if (summaries.length === 0) {
      throw new Error('Cannot calculate baseline from empty summaries');
    }

    const avgCpuUsage =
      summaries.reduce((sum, s) => sum + s.avgCpuUsage, 0) / summaries.length;
    const avgMemoryUsage =
      summaries.reduce((sum, s) => sum + s.avgMemoryUsage, 0) / summaries.length;
    const avgDuration =
      summaries.reduce((sum, s) => sum + s.duration, 0) / summaries.length;

    const baseline: BaselineMetrics = {
      testSuiteId,
      avgCpuUsage,
      avgMemoryUsage,
      avgDuration,
      sampleSize: summaries.length,
      updatedAt: new Date(),
    };

    this.setBaseline(baseline);
    return baseline;
  }

  /**
   * Check for performance regression against baseline
   */
  checkRegression(
    testSuiteId: string,
    summary: PerformanceSummary
  ): RegressionResult[] {
    const baseline = this.getBaseline(testSuiteId);
    const regressions: RegressionResult[] = [];

    if (!baseline) {
      logger.debug(
        { testSuiteId },
        'No baseline available for regression detection'
      );
      return regressions;
    }

    // Check CPU regression
    const cpuThreshold = this.getThreshold('cpu' as MetricType);
    if (cpuThreshold?.regressionEnabled) {
      const cpuDiff = this.calculatePercentageDifference(
        summary.avgCpuUsage,
        baseline.avgCpuUsage
      );

      if (cpuDiff > cpuThreshold.regressionThreshold) {
        regressions.push({
          detected: true,
          metricType: 'cpu' as MetricType,
          currentValue: summary.avgCpuUsage,
          baselineValue: baseline.avgCpuUsage,
          differencePercent: cpuDiff,
          severity: cpuDiff > cpuThreshold.criticalThreshold
            ? ('critical' as MetricSeverity)
            : ('warning' as MetricSeverity),
          message: `CPU usage increased by ${cpuDiff.toFixed(1)}% from baseline (${baseline.avgCpuUsage.toFixed(2)}% → ${summary.avgCpuUsage.toFixed(2)}%)`,
        });
      }
    }

    // Check memory regression
    const memoryThreshold = this.getThreshold('memory' as MetricType);
    if (memoryThreshold?.regressionEnabled) {
      const memoryDiff = this.calculatePercentageDifference(
        summary.avgMemoryUsage,
        baseline.avgMemoryUsage
      );

      if (memoryDiff > memoryThreshold.regressionThreshold) {
        regressions.push({
          detected: true,
          metricType: 'memory' as MetricType,
          currentValue: summary.avgMemoryUsage,
          baselineValue: baseline.avgMemoryUsage,
          differencePercent: memoryDiff,
          severity: memoryDiff > memoryThreshold.criticalThreshold
            ? ('critical' as MetricSeverity)
            : ('warning' as MetricSeverity),
          message: `Memory usage increased by ${memoryDiff.toFixed(1)}% from baseline (${this.formatBytes(baseline.avgMemoryUsage)} → ${this.formatBytes(summary.avgMemoryUsage)})`,
        });
      }
    }

    // Check duration regression
    const durationDiff = this.calculatePercentageDifference(
      summary.duration,
      baseline.avgDuration
    );

    if (durationDiff > 20) {
      // 20% slower is considered regression
      regressions.push({
        detected: true,
        metricType: 'custom' as MetricType,
        currentValue: summary.duration,
        baselineValue: baseline.avgDuration,
        differencePercent: durationDiff,
        severity: durationDiff > 50
          ? ('critical' as MetricSeverity)
          : ('warning' as MetricSeverity),
        message: `Test duration increased by ${durationDiff.toFixed(1)}% from baseline (${baseline.avgDuration}ms → ${summary.duration}ms)`,
      });
    }

    if (regressions.length > 0) {
      logger.warn(
        { testSuiteId, regressionCount: regressions.length },
        'Performance regressions detected'
      );
    }

    return regressions;
  }

  /**
   * Calculate percentage difference between two values
   */
  private calculatePercentageDifference(current: number, baseline: number): number {
    if (baseline === 0) {
      return current > 0 ? 100 : 0;
    }
    return ((current - baseline) / baseline) * 100;
  }

  /**
   * Format bytes for display
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Export thresholds as JSON
   */
  exportThresholds(): string {
    return JSON.stringify(Array.from(this.thresholds.values()), null, 2);
  }

  /**
   * Import thresholds from JSON
   */
  importThresholds(json: string): void {
    try {
      const thresholds = JSON.parse(json) as MetricThreshold[];
      for (const threshold of thresholds) {
        this.setThreshold(threshold);
      }
      logger.info(
        { count: thresholds.length },
        'Thresholds imported from JSON'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to import thresholds from JSON');
      throw new Error('Invalid threshold JSON format');
    }
  }

  /**
   * Clear all baselines
   */
  clearBaselines(): void {
    this.baselines.clear();
    logger.info('All baselines cleared');
  }
}

/**
 * Global threshold manager instance
 */
let globalThresholdManager: ThresholdManager | null = null;

/**
 * Get the global threshold manager instance
 */
export function getGlobalThresholdManager(): ThresholdManager {
  if (!globalThresholdManager) {
    globalThresholdManager = new ThresholdManager();
  }
  return globalThresholdManager;
}

/**
 * Reset the global threshold manager (useful for testing)
 */
export function resetGlobalThresholdManager(): void {
  globalThresholdManager = null;
}
