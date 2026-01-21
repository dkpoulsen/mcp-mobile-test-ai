/**
 * Type definitions for performance monitoring
 */

/**
 * Performance metric types that can be collected
 */
export enum MetricType {
  /** CPU usage percentage */
  CPU = 'cpu',
  /** Memory usage in bytes */
  MEMORY = 'memory',
  /** Battery level and status */
  BATTERY = 'battery',
  /** Network statistics */
  NETWORK = 'network',
  /** Custom metrics */
  CUSTOM = 'custom',
}

/**
 * Severity level for metric threshold violations
 */
export enum MetricSeverity {
  /** Informational - within acceptable bounds */
  INFO = 'info',
  /** Warning - approaching threshold */
  WARNING = 'warning',
  /** Critical - exceeded threshold */
  CRITICAL = 'critical',
}

/**
 * CPU metrics
 */
export interface CPUMetrics {
  /** CPU usage percentage (0-100) */
  usagePercent: number;
  /** Number of cores */
  cores: number;
  /** CPU load average (1, 5, 15 minutes) */
  loadAverage?: number[];
  /** Process CPU usage */
  processUsagePercent?: number;
}

/**
 * Memory metrics
 */
export interface MemoryMetrics {
  /** Total memory in bytes */
  total: number;
  /** Used memory in bytes */
  used: number;
  /** Free memory in bytes */
  free: number;
  /** Usage percentage */
  usagePercent: number;
  /** Process memory usage in bytes */
  processUsed?: number;
  /** Process heap usage in bytes */
  heapUsed?: number;
  /** Heap total in bytes */
  heapTotal?: number;
}

/**
 * Battery metrics
 */
export interface BatteryMetrics {
  /** Battery level percentage (0-100) */
  level: number;
  /** Whether battery is charging */
  charging: boolean;
  /** Estimated time remaining in seconds */
  timeRemaining?: number;
  /** Battery temperature in Celsius */
  temperature?: number;
  /** Battery voltage */
  voltage?: number;
}

/**
 * Network metrics
 */
export interface NetworkMetrics {
  /** Total bytes received */
  bytesReceived: number;
  /** Total bytes sent */
  bytesSent: number;
  /** Packets received */
  packetsReceived: number;
  /** Packets sent */
  packetsSent: number;
  /** Packets dropped */
  packetsDropped?: number;
  /** Current network type */
  networkType?: 'wifi' | 'cellular' | 'ethernet' | 'unknown';
  /** Network latency in ms */
  latency?: number;
  /** Download speed in bytes/sec */
  downloadSpeed?: number;
  /** Upload speed in bytes/sec */
  uploadSpeed?: number;
}

/**
 * Single performance metric snapshot
 */
export interface PerformanceMetric {
  /** Metric type */
  type: MetricType;
  /** Timestamp of measurement */
  timestamp: Date;
  /** Test run ID this metric is associated with */
  testRunId: string;
  /** Test case ID if applicable */
  testCaseId?: string;
  /** Device ID if applicable */
  deviceId?: string;
  /** Severity level */
  severity: MetricSeverity;
  /** Metric data based on type */
  cpu?: CPUMetrics;
  memory?: MemoryMetrics;
  battery?: BatteryMetrics;
  network?: NetworkMetrics;
  /** Custom metric value */
  customValue?: number | string | boolean;
  /** Custom metric name */
  customName?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Threshold configuration for a metric type
 */
export interface MetricThreshold {
  /** Metric type this threshold applies to */
  type: MetricType;
  /** Warning threshold value */
  warningThreshold: number;
  /** Critical threshold value */
  criticalThreshold: number;
  /** Whether to flag regression vs baseline */
  regressionEnabled: boolean;
  /** Regression threshold as percentage of baseline */
  regressionThreshold: number;
  /** Specific metric field to apply threshold to */
  field?: string;
}

/**
 * Performance regression detection result
 */
export interface RegressionResult {
  /** Whether a regression was detected */
  detected: boolean;
  /** Metric type that regressed */
  metricType: MetricType;
  /** Current value */
  currentValue: number;
  /** Baseline value */
  baselineValue: number;
  /** Percentage difference */
  differencePercent: number;
  /** Severity of regression */
  severity: MetricSeverity;
  /** Message describing the regression */
  message: string;
}

/**
 * Performance summary for a test run
 */
export interface PerformanceSummary {
  /** Test run ID */
  testRunId: string;
  /** Start timestamp */
  startTime: Date;
  /** End timestamp */
  endTime: Date;
  /** Total duration in milliseconds */
  duration: number;
  /** Peak CPU usage percentage */
  peakCpuUsage: number;
  /** Average CPU usage percentage */
  avgCpuUsage: number;
  /** Peak memory usage in bytes */
  peakMemoryUsage: number;
  /** Average memory usage in bytes */
  avgMemoryUsage: number;
  /** Number of threshold warnings */
  warningCount: number;
  /** Number of critical threshold violations */
  criticalCount: number;
  /** Regressions detected */
  regressions: RegressionResult[];
  /** Battery drain percentage during test run */
  batteryDrain?: number;
  /** Network usage summary */
  networkUsage: {
    bytesReceived: number;
    bytesSent: number;
  };
}

/**
 * Performance monitor configuration
 */
export interface PerformanceMonitorConfig {
  /** Whether performance monitoring is enabled */
  enabled: boolean;
  /** Sampling interval in milliseconds */
  samplingInterval: number;
  /** Metric thresholds */
  thresholds: MetricThreshold[];
  /** Whether to collect CPU metrics */
  collectCpu: boolean;
  /** Whether to collect memory metrics */
  collectMemory: boolean;
  /** Whether to collect battery metrics */
  collectBattery: boolean;
  /** Whether to collect network metrics */
  collectNetwork: boolean;
  /** Maximum number of samples to keep in memory */
  maxSamples: number;
  /** Whether to persist metrics to database */
  persistMetrics: boolean;
}

/**
 * Baseline metrics for regression detection
 */
export interface BaselineMetrics {
  /** Test suite ID these baselines apply to */
  testSuiteId: string;
  /** Average CPU usage baseline */
  avgCpuUsage: number;
  /** Average memory usage baseline */
  avgMemoryUsage: number;
  /** Average test duration baseline */
  avgDuration: number;
  /** Sample size used to calculate baseline */
  sampleSize: number;
  /** Last updated timestamp */
  updatedAt: Date;
}
