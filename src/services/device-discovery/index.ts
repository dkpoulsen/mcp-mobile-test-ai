/**
 * Device Discovery Service
 *
 * Discovers available mobile devices including:
 * - Android emulators and physical devices (via ADB)
 * - iOS simulators and physical devices (via simctl)
 *
 * Returns device capabilities for device selection.
 */

import { AndroidDeviceDiscovery } from './android-discovery.js';
import { IOSDeviceDiscovery } from './ios-discovery.js';
import type {
  DiscoveredDevice,
  DeviceDiscoveryOptions,
  DeviceDiscoveryResult,
  DevicePlatform,
  DeviceType,
} from './types.js';
import type { Logger } from '../../utils/logger.js';

/**
 * Device Discovery Service class
 */
export class DeviceDiscoveryService {
  private androidDiscovery: AndroidDeviceDiscovery;
  private iosDiscovery: IOSDeviceDiscovery;
  private logger?: Logger;

  constructor(options: {
    adbPath?: string;
    simctlPath?: string;
    timeout?: number;
    logger?: Logger;
  } = {}) {
    this.logger = options.logger;

    // Initialize platform-specific discovery
    this.androidDiscovery = new AndroidDeviceDiscovery({
      adbPath: options.adbPath,
      timeout: options.timeout,
      logger: this.logger?.child({ component: 'android-discovery' }),
    });

    this.iosDiscovery = new IOSDeviceDiscovery({
      simctlPath: options.simctlPath,
      timeout: options.timeout,
      logger: this.logger?.child({ component: 'ios-discovery' }),
    });
  }

  /**
   * Discover all available devices
   *
   * @param options - Discovery options
   * @returns Discovery result with all discovered devices
   */
  async discover(options: DeviceDiscoveryOptions = {}): Promise<DeviceDiscoveryResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let allDevices: DiscoveredDevice[] = [];

    this.logger?.info('Starting device discovery', { options });

    // Determine which platforms to discover
    const discoverAndroid = options.platform === 'both' || options.platform === 'android' || !options.platform;
    const discoverIos = options.platform === 'both' || options.platform === 'ios' || !options.platform;

    // Discover devices from each platform
    if (discoverAndroid) {
      try {
        const androidDevices = await this.androidDiscovery.discover(options);
        allDevices.push(...androidDevices);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Android discovery failed: ${errorMsg}`);
        this.logger?.error('Android device discovery failed', error);
      }
    }

    if (discoverIos) {
      try {
        const iosDevices = await this.iosDiscovery.discover(options);
        allDevices.push(...iosDevices);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`iOS discovery failed: ${errorMsg}`);
        this.logger?.error('iOS device discovery failed', error);
      }
    }

    const duration = Date.now() - startTime;

    this.logger?.info(`Device discovery completed`, {
      deviceCount: allDevices.length,
      duration,
    });

    return this.buildDiscoveryResult(allDevices, duration, errors);
  }

  /**
   * Discover only Android devices
   */
  async discoverAndroid(options: DeviceDiscoveryOptions = {}): Promise<DiscoveredDevice[]> {
    return this.androidDiscovery.discover(options);
  }

  /**
   * Discover only iOS devices
   */
  async discoverIos(options: DeviceDiscoveryOptions = {}): Promise<DiscoveredDevice[]> {
    return this.iosDiscovery.discover(options);
  }

  /**
   * Get a specific device by its ID
   */
  async getDeviceById(deviceId: string): Promise<DiscoveredDevice | null> {
    const result = await this.discover();
    return result.devices.find((d) => d.id === deviceId) || null;
  }

  /**
   * Get available devices for a specific platform
   */
  async getAvailableDevices(platform?: DevicePlatform): Promise<DiscoveredDevice[]> {
    const result = await this.discover({ availableOnly: true, platform });
    return result.available;
  }

  /**
   * Get devices by type (emulator, simulator, physical)
   */
  async getDevicesByType(type: DeviceType): Promise<DiscoveredDevice[]> {
    const result = await this.discover();
    return result.byType[type === 'emulator' ? 'emulators' : type === 'simulator' ? 'simulators' : 'physical'];
  }

  /**
   * Check if a device is ready
   */
  async isDeviceReady(deviceId: string, platform: DevicePlatform): Promise<boolean> {
    if (platform === 'android') {
      return this.androidDiscovery.isDeviceReady(deviceId);
    }
    if (platform === 'ios') {
      return this.iosDiscovery.isSimulatorReady(deviceId);
    }
    return false;
  }

  /**
   * Get device capabilities as a formatted object
   */
  async getDeviceCapabilities(deviceId: string): Promise<Record<string, unknown> | null> {
    const device = await this.getDeviceById(deviceId);
    if (!device) {
      return null;
    }

    return {
      id: device.id,
      platform: device.platform,
      name: device.name,
      osVersion: device.osVersion,
      type: device.type,
      screen: {
        width: device.screenWidth,
        height: device.screenHeight,
        density: device.screenDensity,
      },
      model: device.model,
      status: device.status,
      isReady: device.isReady,
      capabilities: device.capabilities,
    };
  }

  /**
   * Wait for a device to become ready
   */
  async waitForDeviceReady(
    deviceId: string,
    platform: DevicePlatform,
    options: { timeout?: number; interval?: number } = {}
  ): Promise<boolean> {
    const { timeout = 60000, interval = 1000 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const isReady = await this.isDeviceReady(deviceId, platform);
      if (isReady) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    return false;
  }

  /**
   * Build the discovery result object
   */
  private buildDiscoveryResult(
    devices: DiscoveredDevice[],
    duration: number,
    errors: string[]
  ): DeviceDiscoveryResult {
    // Group by platform
    const byPlatform = {
      android: devices.filter((d) => d.platform === 'android'),
      ios: devices.filter((d) => d.platform === 'ios'),
    };

    // Group by type
    const byType = {
      emulators: devices.filter((d) => d.type === 'emulator'),
      simulators: devices.filter((d) => d.type === 'simulator'),
      physical: devices.filter((d) => d.type === 'physical'),
    };

    // Available devices
    const available = devices.filter((d) => d.status === 'available');

    return {
      devices,
      byPlatform,
      byType,
      available,
      metadata: {
        timestamp: new Date(),
        duration,
        errors,
        totalDevices: devices.length,
      },
    };
  }

  /**
   * Format device info as a string
   */
  formatDeviceInfo(device: DiscoveredDevice): string {
    const typeLabel = device.type.charAt(0).toUpperCase() + device.type.slice(1);
    const platformLabel = device.platform.toUpperCase();
    const statusLabel = device.status.toUpperCase();
    const readyLabel = device.isReady ? 'Ready' : 'Not Ready';

    const parts = [
      `[${platformLabel}]`,
      device.name,
      `(${device.osVersion})`,
      `- ${typeLabel}`,
      device.screenWidth && device.screenHeight
        ? `- ${device.screenWidth}x${device.screenHeight}`
        : '',
      `- ${statusLabel}`,
      `- ${readyLabel}`,
    ];

    return parts.filter(Boolean).join(' ');
  }

  /**
   * Create a device selection summary
   */
  createSelectionSummary(result: DeviceDiscoveryResult): string {
    const lines: string[] = [];

    lines.push('='.repeat(60));
    lines.push('Device Discovery Summary');
    lines.push('='.repeat(60));
    lines.push(`Total Devices: ${result.metadata.totalDevices}`);
    lines.push(`Available: ${result.available.length}`);
    lines.push(`Discovery Time: ${result.metadata.duration}ms`);
    lines.push('');

    // Android
    if (result.byPlatform.android.length > 0) {
      lines.push('Android Devices:');
      for (const device of result.byPlatform.android) {
        lines.push(`  ${this.formatDeviceInfo(device)}`);
      }
      lines.push('');
    }

    // iOS
    if (result.byPlatform.ios.length > 0) {
      lines.push('iOS Devices:');
      for (const device of result.byPlatform.ios) {
        lines.push(`  ${this.formatDeviceInfo(device)}`);
      }
      lines.push('');
    }

    // Errors
    if (result.metadata.errors.length > 0) {
      lines.push('Errors:');
      for (const error of result.metadata.errors) {
        lines.push(`  - ${error}`);
      }
    }

    lines.push('='.repeat(60));

    return lines.join('\n');
  }
}

/**
 * Create a singleton instance for easy access
 */
let defaultInstance: DeviceDiscoveryService | null = null;

/**
 * Get the default device discovery service instance
 */
export function getDeviceDiscoveryService(options?: {
  adbPath?: string;
  simctlPath?: string;
  timeout?: number;
  logger?: Logger;
}): DeviceDiscoveryService {
  if (!defaultInstance) {
    defaultInstance = new DeviceDiscoveryService(options);
  }
  return defaultInstance;
}

/**
 * Convenience function to discover all devices
 */
export async function discoverDevices(options?: DeviceDiscoveryOptions): Promise<DeviceDiscoveryResult> {
  const service = getDeviceDiscoveryService();
  return service.discover(options);
}

// Export types
export * from './types.js';
export type { AndroidDeviceDiscovery } from './android-discovery.js';
export type { IOSDeviceDiscovery } from './ios-discovery.js';
