/**
 * Type definitions for device discovery service
 */

/**
 * Device platform type
 */
export type DevicePlatform = 'ios' | 'android';

/**
 * Device type classification
 */
export type DeviceType = 'emulator' | 'simulator' | 'physical';

/**
 * Device discovery result with capabilities
 */
export interface DiscoveredDevice {
  /**
   * Unique device identifier (UDID for iOS, serial for Android)
   */
  id: string;

  /**
   * Device platform
   */
  platform: DevicePlatform;

  /**
   * Device name (e.g., "iPhone 15 Pro", "Pixel 6")
   */
  name: string;

  /**
   * Operating system version
   */
  osVersion: string;

  /**
   * Device type
   */
  type: DeviceType;

  /**
   * Screen width in pixels
   */
  screenWidth?: number;

  /**
   * Screen height in pixels
   */
  screenHeight?: number;

  /**
   * Screen density/dpi (for Android)
   */
  screenDensity?: number;

  /**
   * Device model identifier (e.g., "iPhone16,1", "sdk_gphone64_x86_64")
   */
  model?: string;

  /**
   * Device status
   */
  status: 'available' | 'busy' | 'offline' | 'booting' | 'shutdown';

  /**
   * Additional capabilities
   */
  capabilities?: Record<string, unknown>;

  /**
   * Whether the device is ready for use
   */
  isReady: boolean;
}

/**
 * Device discovery options
 */
export interface DeviceDiscoveryOptions {
  /**
   * Filter by platform
   */
  platform?: DevicePlatform | 'both';

  /**
   * Filter by device type
   */
  type?: DeviceType | DeviceType[];

  /**
   * Include only available devices
   */
  availableOnly?: boolean;

  /**
   * Include emulators/simulators that are shut down
   */
  includeOffline?: boolean;

  /**
   * Custom ADB path for Android discovery
   */
  adbPath?: string;

  /**
   * Custom simctl path for iOS discovery
   */
  simctlPath?: string;

  /**
   * Timeout for device discovery commands (in milliseconds)
   */
  timeout?: number;
}

/**
 * Device discovery result
 */
export interface DeviceDiscoveryResult {
  /**
   * All discovered devices
   */
  devices: DiscoveredDevice[];

  /**
   * Devices by platform
   */
  byPlatform: {
    android: DiscoveredDevice[];
    ios: DiscoveredDevice[];
  };

  /**
   * Devices by type
   */
  byType: {
    emulators: DiscoveredDevice[];
    simulators: DiscoveredDevice[];
    physical: DiscoveredDevice[];
  };

  /**
   * Available devices only
   */
  available: DiscoveredDevice[];

  /**
   * Discovery metadata
   */
  metadata: {
    /**
     * When the discovery was performed
     */
    timestamp: Date;

    /**
     * How long discovery took (in milliseconds)
     */
    duration: number;

    /**
     * Any errors that occurred during discovery
     */
    errors: string[];

    /**
     * Number of devices found
     */
    totalDevices: number;
  };
}

/**
 * ADB device list entry
 */
export interface AdbDevice {
  serial: string;
  status: 'device' | 'offline' | 'unauthorized' | 'missing';
  product?: string;
  model?: string;
  device?: string;
  transportId?: string;
}

/**
 * ADB device properties
 */
export type AdbDeviceProperties = Record<string, string | undefined>;

/**
 * iOS simulator device entry from simctl
 */
export interface SimctlDevice {
  udid: string;
  name: string;
  osVersion: string;
  runtime: string;
  isAvailable: boolean;
  availability?: string;
  state: 'Booted' | 'Shutdown' | 'Booting' | 'Shutting down';
  deviceType?: string;
}

/**
 * iOS runtime entry from simctl
 */
export interface SimctlRuntime {
  identifier: string;
  version: string;
  buildNumber: string;
  isAvailable: boolean;
  name?: string;
}

/**
 * iOS device type entry from simctl
 */
export interface SimctlDeviceType {
  identifier: string;
  name: string;
  productFamily: string;
  maxRuntimeVersion?: number;
  minRuntimeVersion?: number;
}
