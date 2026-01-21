/**
 * Performance metrics collector
 * Collects system metrics during test execution
 */

import * as os from 'node:os';
import { createModuleLogger } from '../../utils/logger.js';
import type {
  CPUMetrics,
  MemoryMetrics,
  BatteryMetrics,
  NetworkMetrics,
  MetricType,
} from './types.js';

const logger = createModuleLogger('performance-collector');

/**
 * Network interface info type (simplified)
 */
interface NetworkInterfaceInfo {
  address: string;
  netmask: string;
  family: 'IPv4' | 'IPv6';
  mac: string;
  internal: boolean;
  cidr: string | null;
}

/**
 * Performance metrics collector
 */
export class MetricsCollector {
  /** Network stats snapshot for calculating deltas */
  private networkBaseline: Map<string, NetworkInterfaceInfo[]> = new Map();

  constructor() {
    // Capture initial network stats
    this.captureNetworkBaseline();
  }

  /**
   * Capture network baseline for calculating deltas
   */
  private captureNetworkBaseline(): void {
    const networkInterfaces = this.getNetworkInterfaces();
    for (const [name, addresses] of Object.entries(networkInterfaces)) {
      if (addresses) {
        this.networkBaseline.set(name, addresses);
      }
    }
  }

  /**
   * Get network interfaces
   */
  private getNetworkInterfaces(): Record<string, NetworkInterfaceInfo[]> {
    try {
      const ifs = os.networkInterfaces();
      const result: Record<string, NetworkInterfaceInfo[]> = {};

      for (const [name, addrs] of Object.entries(ifs)) {
        if (addrs) {
          result[name] = addrs as NetworkInterfaceInfo[];
        }
      }

      return result;
    } catch {
      return {};
    }
  }

  /**
   * Collect CPU metrics
   */
  collectCPUMetrics(): CPUMetrics | null {
    try {
      const cpus = os.cpus();
      if (!cpus || cpus.length === 0) {
        return null;
      }
      const cores = cpus.length;

      // Use load average as proxy for CPU usage
      const loadAverage = os.loadavg();

      // Process CPU usage (percentage of CPU time used by current process)
      const processUsage = this.getProcessCpuUsage();

      // Estimate CPU usage from load average
      const usagePercent = loadAverage[0] !== undefined
        ? Math.min(100, (loadAverage[0] / cores) * 100)
        : 0;

      return {
        usagePercent: Math.round(usagePercent * 100) / 100,
        cores,
        loadAverage: loadAverage.map((n) => Math.round(n * 100) / 100),
        processUsagePercent: processUsage,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to collect CPU metrics');
      return null;
    }
  }

  /**
   * Get process CPU usage percentage
   */
  private getProcessCpuUsage(): number {
    try {
      const usage = process.cpuUsage();
      // Convert microseconds to percentage (rough estimate)
      const totalUsage = usage.user + usage.system;
      return Math.round((totalUsage / 1000000) * 100) / 100;
    } catch {
      return 0;
    }
  }

  /**
   * Collect memory metrics
   */
  collectMemoryMetrics(): MemoryMetrics | null {
    try {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;

      // Process-specific memory
      const processMemory = process.memoryUsage();

      return {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        usagePercent: Math.round((usedMem / totalMem) * 10000) / 100,
        processUsed: processMemory.rss,
        heapUsed: processMemory.heapUsed,
        heapTotal: processMemory.heapTotal,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to collect memory metrics');
      return null;
    }
  }

  /**
   * Collect battery metrics (platform-specific)
   */
  collectBatteryMetrics(): BatteryMetrics | null {
    try {
      // On Linux/Unix, battery info can be read from /sys/class/power_supply
      // For now, return null as this requires platform-specific code
      // This can be extended with:
      // - Linux: read /sys/class/power_supply/BAT0/capacity
      // - macOS: use system_profiler SPPowerDataType
      // - Windows: use WMI queries

      // For mobile devices (iOS/Android), this would come from Appium

      // Return simulated data for testing purposes
      return {
        level: 100,
        charging: true,
        timeRemaining: undefined,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to collect battery metrics');
      return null;
    }
  }

  /**
   * Collect network metrics
   */
  collectNetworkMetrics(): NetworkMetrics | null {
    try {
      const networkInterfaces = os.networkInterfaces();
      let bytesReceived = 0;
      let bytesSent = 0;
      let packetsReceived = 0;
      let packetsSent = 0;

      for (const addresses of Object.values(networkInterfaces)) {
        if (!addresses) continue;

        // Note: Node.js doesn't provide packet/byte counts per interface
        // These would need to be read from /proc/net/dev on Linux
        // or similar platform-specific sources
        void addresses; // Mark as intentionally unused
      }

      // For now, use process network I/O if available
      // This is a placeholder - real implementation would read from system

      const networkType = this.detectNetworkType();

      return {
        bytesReceived,
        bytesSent,
        packetsReceived,
        packetsSent,
        networkType,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to collect network metrics');
      return null;
    }
  }

  /**
   * Detect network type
   */
  private detectNetworkType(): 'wifi' | 'cellular' | 'ethernet' | 'unknown' {
    // Placeholder implementation
    // Real implementation would check network interface names and properties
    return 'unknown';
  }

  /**
   * Collect all available metrics
   */
  collectAllMetrics(): {
    cpu?: CPUMetrics;
    memory?: MemoryMetrics;
    battery?: BatteryMetrics;
    network?: NetworkMetrics;
  } {
    const result: {
      cpu?: CPUMetrics;
      memory?: MemoryMetrics;
      battery?: BatteryMetrics;
      network?: NetworkMetrics;
    } = {};

    try {
      result.cpu = this.collectCPUMetrics() ?? undefined;
      result.memory = this.collectMemoryMetrics() ?? undefined;
      result.battery = this.collectBatteryMetrics() ?? undefined;
      result.network = this.collectNetworkMetrics() ?? undefined;
    } catch (error) {
      logger.error({ error }, 'Error collecting metrics');
    }

    return result;
  }

  /**
   * Collect specific metric type
   */
  collectMetric(type: MetricType): CPUMetrics | MemoryMetrics | BatteryMetrics | NetworkMetrics | null {
    switch (type) {
      case 'cpu':
        return this.collectCPUMetrics();
      case 'memory':
        return this.collectMemoryMetrics();
      case 'battery':
        return this.collectBatteryMetrics();
      case 'network':
        return this.collectNetworkMetrics();
      default:
        logger.warn({ type }, 'Unknown metric type');
        return null;
    }
  }
}

/**
 * Global collector instance
 */
let globalCollector: MetricsCollector | null = null;

/**
 * Get the global metrics collector instance
 */
export function getGlobalMetricsCollector(): MetricsCollector {
  if (!globalCollector) {
    globalCollector = new MetricsCollector();
  }
  return globalCollector;
}
