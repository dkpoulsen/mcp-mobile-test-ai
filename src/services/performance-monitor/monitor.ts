/**
 * Performance monitor - orchestrates metrics collection and threshold checking
 */

import { createModuleLogger } from '../../utils/logger.js';
import { getPrismaClient } from '../../database/client.js';
import { Prisma } from '@prisma/client';
import { getGlobalMetricsCollector } from './collector.js';
import { getGlobalThresholdManager } from './thresholds.js';
import type {
  PerformanceMetric,
  PerformanceMonitorConfig,
  PerformanceSummary,
  MetricSeverity,
  MetricType,
} from './types.js';
import { MetricType as MetricTypeEnum } from './types.js';

const logger = createModuleLogger('performance-monitor');

/**
 * Default configuration
 */
const DEFAULT_CONFIG: PerformanceMonitorConfig = {
  enabled: true,
  samplingInterval: 1000, // 1 second
  thresholds: [],
  collectCpu: true,
  collectMemory: true,
  collectBattery: false,
  collectNetwork: true,
  maxSamples: 10000,
  persistMetrics: true,
};

/**
 * Performance monitor for a test run
 */
export class PerformanceMonitor {
  /** Monitor configuration */
  private config: PerformanceMonitorConfig;

  /** Test run ID */
  private testRunId: string;

  /** Test suite ID */
  private testSuiteId: string;

  /** Collected metrics */
  private metrics: PerformanceMetric[] = [];

  /** Sampling interval timer */
  private samplingTimer?: NodeJS.Timeout;

  /** Start time */
  private startTime?: Date;

  /** Metrics collector */
  private collector = getGlobalMetricsCollector();

  /** Threshold manager */
  private thresholdManager = getGlobalThresholdManager();

  /** In-memory metric snapshots for summary calculation */
  private cpuSamples: number[] = [];
  private memorySamples: number[] = [];
  private batteryStart?: number;
  private batteryEnd?: number;

  constructor(
    testRunId: string,
    testSuiteId: string,
    config?: Partial<PerformanceMonitorConfig>,
    deviceId?: string
  ) {
    this.testRunId = testRunId;
    this.testSuiteId = testSuiteId;
    this.config = { ...DEFAULT_CONFIG, ...config };

    logger.info(
      { testRunId, testSuiteId, deviceId, enabled: this.config.enabled },
      'Performance monitor created'
    );
  }

  /**
   * Start monitoring
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      logger.debug({ testRunId: this.testRunId }, 'Performance monitoring disabled');
      return;
    }

    this.startTime = new Date();

    // Capture initial battery level
    if (this.config.collectBattery) {
      const batteryMetrics = this.collector.collectBatteryMetrics();
      if (batteryMetrics) {
        this.batteryStart = batteryMetrics.level;
      }
    }

    // Start periodic sampling
    this.samplingTimer = setInterval(
      () => {
        void this.collectMetrics();
      },
      this.config.samplingInterval
    );

    logger.info(
      { testRunId: this.testRunId, interval: this.config.samplingInterval },
      'Performance monitoring started'
    );
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<PerformanceSummary | null> {
    if (!this.config.enabled || !this.startTime) {
      return null;
    }

    // Clear sampling timer
    if (this.samplingTimer) {
      clearInterval(this.samplingTimer);
      this.samplingTimer = undefined;
    }

    // Capture final battery level
    if (this.config.collectBattery) {
      const batteryMetrics = this.collector.collectBatteryMetrics();
      if (batteryMetrics) {
        this.batteryEnd = batteryMetrics.level;
      }
    }

    // Collect final metrics
    await this.collectMetrics();

    const endTime = new Date();
    const duration = endTime.getTime() - this.startTime.getTime();

    // Generate summary
    const summary = this.generateSummary(endTime, duration);

    logger.info(
      { testRunId: this.testRunId, duration, metricsCollected: this.metrics.length },
      'Performance monitoring stopped'
    );

    return summary;
  }

  /**
   * Collect metrics sample
   */
  private async collectMetrics(): Promise<void> {
    const timestamp = new Date();

    try {
      // Collect CPU metrics
      if (this.config.collectCpu) {
        const cpuMetrics = this.collector.collectCPUMetrics();
        if (cpuMetrics) {
          const metric = this.createMetric(MetricTypeEnum.CPU, timestamp, { cpu: cpuMetrics });
          this.metrics.push(metric);
          this.cpuSamples.push(cpuMetrics.usagePercent);
        }
      }

      // Collect memory metrics
      if (this.config.collectMemory) {
        const memoryMetrics = this.collector.collectMemoryMetrics();
        if (memoryMetrics) {
          const metric = this.createMetric(MetricTypeEnum.MEMORY, timestamp, { memory: memoryMetrics });
          this.metrics.push(metric);
          this.memorySamples.push(memoryMetrics.usagePercent);
        }
      }

      // Collect battery metrics
      if (this.config.collectBattery) {
        const batteryMetrics = this.collector.collectBatteryMetrics();
        if (batteryMetrics) {
          const metric = this.createMetric(MetricTypeEnum.BATTERY, timestamp, { battery: batteryMetrics });
          this.metrics.push(metric);
        }
      }

      // Collect network metrics
      if (this.config.collectNetwork) {
        const networkMetrics = this.collector.collectNetworkMetrics();
        if (networkMetrics) {
          const metric = this.createMetric(MetricTypeEnum.NETWORK, timestamp, { network: networkMetrics });
          this.metrics.push(metric);
        }
      }

      // Check if we've exceeded max samples and remove oldest
      if (this.metrics.length > this.config.maxSamples) {
        const excess = this.metrics.length - this.config.maxSamples;
        this.metrics.splice(0, excess);
      }
    } catch (error) {
      logger.error({ error, testRunId: this.testRunId }, 'Error collecting metrics');
    }
  }

  /**
   * Create a performance metric
   */
  private createMetric(
    type: MetricType,
    timestamp: Date,
    data: Partial<PerformanceMetric>
  ): PerformanceMetric {
    const metric: PerformanceMetric = {
      type,
      timestamp,
      testRunId: this.testRunId,
      severity: 'info' as MetricSeverity,
      ...data,
    };

    // Check against thresholds
    metric.severity = this.thresholdManager.checkThreshold(metric);

    return metric;
  }

  /**
   * Generate performance summary
   */
  private generateSummary(endTime: Date, duration: number): PerformanceSummary {
    // Calculate CPU stats
    const peakCpuUsage = this.cpuSamples.length > 0
      ? Math.max(...this.cpuSamples)
      : 0;
    const avgCpuUsage = this.cpuSamples.length > 0
      ? this.cpuSamples.reduce((a, b) => a + b, 0) / this.cpuSamples.length
      : 0;

    // Calculate memory stats
    const peakMemoryUsage = this.memorySamples.length > 0
      ? Math.max(...this.memorySamples)
      : 0;
    const avgMemoryUsage = this.memorySamples.length > 0
      ? this.memorySamples.reduce((a, b) => a + b, 0) / this.memorySamples.length
      : 0;

    // Count threshold violations
    let warningCount = 0;
    let criticalCount = 0;
    for (const metric of this.metrics) {
      if (metric.severity === 'warning') warningCount++;
      if (metric.severity === 'critical') criticalCount++;
    }

    // Calculate battery drain
    let batteryDrain: number | undefined;
    if (this.batteryStart !== undefined && this.batteryEnd !== undefined) {
      batteryDrain = this.batteryStart - this.batteryEnd;
    }

    // Calculate network usage
    let networkBytesReceived = 0;
    let networkBytesSent = 0;
    for (const metric of this.metrics) {
      if (metric.network) {
        networkBytesReceived += metric.network.bytesReceived;
        networkBytesSent += metric.network.bytesSent;
      }
    }

    // Check for regressions
    const regressions = this.thresholdManager.checkRegression(
      this.testSuiteId,
      {
        testRunId: this.testRunId,
        startTime: this.startTime!,
        endTime,
        duration,
        peakCpuUsage,
        avgCpuUsage,
        peakMemoryUsage,
        avgMemoryUsage,
        warningCount,
        criticalCount,
        regressions: [],
        networkUsage: {
          bytesReceived: networkBytesReceived,
          bytesSent: networkBytesSent,
        },
      }
    );

    return {
      testRunId: this.testRunId,
      startTime: this.startTime!,
      endTime,
      duration,
      peakCpuUsage,
      avgCpuUsage,
      peakMemoryUsage,
      avgMemoryUsage,
      warningCount,
      criticalCount,
      regressions,
      batteryDrain,
      networkUsage: {
        bytesReceived: networkBytesReceived,
        bytesSent: networkBytesSent,
      },
    };
  }

  /**
   * Get all collected metrics
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * Get metrics by type
   */
  getMetricsByType(type: MetricType): PerformanceMetric[] {
    return this.metrics.filter((m) => m.type === type);
  }

  /**
   * Persist metrics to database
   */
  async persistMetrics(summary?: PerformanceSummary): Promise<void> {
    if (!this.config.persistMetrics) {
      return;
    }

    const prisma = getPrismaClient();

    try {
      // Store summary in test run metadata
      if (summary) {
        const existingRun = await prisma.testRun.findUnique({
          where: { id: this.testRunId },
          select: { metadata: true },
        });

        // Build the new metadata object
        const existingMetadata = (existingRun?.metadata as Record<string, unknown> | null) ?? {};
        const newMetadata: Record<string, unknown> = { ...existingMetadata };
        newMetadata.performance = {
          summary: {
            avgCpuUsage: summary.avgCpuUsage,
            peakCpuUsage: summary.peakCpuUsage,
            avgMemoryUsage: summary.avgMemoryUsage,
            peakMemoryUsage: summary.peakMemoryUsage,
            duration: summary.duration,
            warningCount: summary.warningCount,
            criticalCount: summary.criticalCount,
            batteryDrain: summary.batteryDrain ?? 0,
            regressions: summary.regressions.length,
          },
        };

        await prisma.testRun.update({
          where: { id: this.testRunId },
          data: {
            metadata: newMetadata as Prisma.InputJsonValue,
          },
        });
      }

      // Store individual metrics as artifacts (limit to avoid too many DB writes)
      const maxArtifacts = 100;
      const metricsToStore = this.metrics.slice(-maxArtifacts);

      for (const metric of metricsToStore) {
        const metricData: Record<string, unknown> = {
          metricType: metric.type,
          severity: metric.severity,
          timestamp: metric.timestamp.toISOString(),
          testRunId: metric.testRunId,
        };

        if (metric.cpu) metricData.cpu = metric.cpu;
        if (metric.memory) metricData.memory = metric.memory;
        if (metric.battery) metricData.battery = metric.battery;
        if (metric.network) metricData.network = metric.network;

        await prisma.artifact.create({
          data: {
            testRunId: this.testRunId,
            type: 'OTHER',
            path: `performance://${metric.type}/${metric.timestamp.getTime()}`,
            mimeType: 'application/json',
            metadata: metricData as Prisma.InputJsonValue,
          },
        }).catch((err) => {
          logger.error({ error: err }, 'Failed to persist metric artifact');
        });
      }

      logger.info(
        { testRunId: this.testRunId, count: metricsToStore.length },
        'Metrics persisted to database'
      );
    } catch (error) {
      logger.error({ error, testRunId: this.testRunId }, 'Failed to persist metrics');
    }
  }

  /**
   * Get current snapshot of metrics
   */
  getSnapshot(): {
    cpu?: { current: number; avg: number; peak: number };
    memory?: { current: number; avg: number; peak: number };
    battery?: { level: number; drain: number };
    sampleCount: number;
  } {
    const snapshot: {
      cpu?: { current: number; avg: number; peak: number };
      memory?: { current: number; avg: number; peak: number };
      battery?: { level: number; drain: number };
      sampleCount: number;
    } = {
      sampleCount: this.metrics.length,
    };

    if (this.cpuSamples.length > 0) {
      const current = this.cpuSamples[this.cpuSamples.length - 1] ?? 0;
      const avg = this.cpuSamples.reduce((a, b) => a + b, 0) / this.cpuSamples.length;
      const peak = Math.max(0, ...this.cpuSamples);
      snapshot.cpu = { current, avg, peak };
    }

    if (this.memorySamples.length > 0) {
      const current = this.memorySamples[this.memorySamples.length - 1] ?? 0;
      const avg = this.memorySamples.reduce((a, b) => a + b, 0) / this.memorySamples.length;
      const peak = Math.max(0, ...this.memorySamples);
      snapshot.memory = { current, avg, peak };
    }

    if (this.batteryStart !== undefined && this.batteryEnd !== undefined) {
      snapshot.battery = {
        level: this.batteryEnd,
        drain: this.batteryStart - this.batteryEnd,
      };
    }

    return snapshot;
  }

  /**
   * Get test run ID
   */
  getTestRunId(): string {
    return this.testRunId;
  }

  /**
   * Check if monitoring is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Check if monitor is currently running
   */
  isRunning(): boolean {
    return this.samplingTimer !== undefined;
  }
}

/**
 * Active monitors by test run ID
 */
const activeMonitors = new Map<string, PerformanceMonitor>();

/**
 * Create a new performance monitor for a test run
 */
export function createPerformanceMonitor(
  testRunId: string,
  testSuiteId: string,
  config?: Partial<PerformanceMonitorConfig>,
  deviceId?: string
): PerformanceMonitor {
  const monitor = new PerformanceMonitor(testRunId, testSuiteId, config, deviceId);
  activeMonitors.set(testRunId, monitor);
  return monitor;
}

/**
 * Get an active performance monitor by test run ID
 */
export function getPerformanceMonitor(testRunId: string): PerformanceMonitor | undefined {
  return activeMonitors.get(testRunId);
}

/**
 * Remove an active monitor
 */
export function removePerformanceMonitor(testRunId: string): boolean {
  const monitor = activeMonitors.get(testRunId);
  if (monitor) {
    if (monitor.isRunning()) {
      void monitor.stop();
    }
    return activeMonitors.delete(testRunId);
  }
  return false;
}

/**
 * Get all active monitors
 */
export function getActiveMonitors(): PerformanceMonitor[] {
  return Array.from(activeMonitors.values());
}
