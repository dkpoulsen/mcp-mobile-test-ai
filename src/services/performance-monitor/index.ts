/**
 * Performance monitoring service
 * Exports for the performance monitoring module
 */

// Types
export type {
  CPUMetrics,
  MemoryMetrics,
  BatteryMetrics,
  NetworkMetrics,
  PerformanceMetric,
  MetricThreshold,
  RegressionResult,
  PerformanceSummary,
  PerformanceMonitorConfig,
  BaselineMetrics,
} from './types.js';

export {
  MetricType,
  MetricSeverity,
} from './types.js';

// Collector
export {
  MetricsCollector,
  getGlobalMetricsCollector,
} from './collector.js';

// Thresholds
export {
  ThresholdManager,
  getGlobalThresholdManager,
  resetGlobalThresholdManager,
  DEFAULT_THRESHOLDS,
} from './thresholds.js';

// Monitor
export {
  PerformanceMonitor,
  createPerformanceMonitor,
  getPerformanceMonitor,
  removePerformanceMonitor,
  getActiveMonitors,
} from './monitor.js';
