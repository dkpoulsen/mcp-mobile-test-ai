/**
 * Android device discovery using ADB (Android Debug Bridge)
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  AdbDevice,
  AdbDeviceProperties,
  DiscoveredDevice,
  DeviceDiscoveryOptions,
} from './types.js';
import type { Logger } from '../../utils/logger.js';

const execAsync = promisify(exec);

/**
 * Default timeout for ADB commands
 */
const DEFAULT_ADB_TIMEOUT = 10000;

/**
 * Android device discovery class
 */
export class AndroidDeviceDiscovery {
  private adbPath: string;
  private timeout: number;
  private logger?: Logger;

  constructor(options: { adbPath?: string; timeout?: number; logger?: Logger } = {}) {
    this.adbPath = options.adbPath || 'adb';
    this.timeout = options.timeout || DEFAULT_ADB_TIMEOUT;
    this.logger = options.logger;
  }

  /**
   * Discover all Android devices
   */
  async discover(options: DeviceDiscoveryOptions = {}): Promise<DiscoveredDevice[]> {
    this.logger?.debug('Starting Android device discovery');

    try {
      // Check if ADB is available
      await this.checkAdbAvailable();

      // Get list of devices
      const adbDevices = await this.listDevices();

      if (adbDevices.length === 0) {
        this.logger?.info('No Android devices found');
        return [];
      }

      // Get detailed info for each device
      const devices: DiscoveredDevice[] = [];
      const errors: string[] = [];

      for (const adbDevice of adbDevices) {
        try {
          const device = await this.getDeviceInfo(adbDevice);
          if (device) {
            devices.push(device);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push(`Failed to get info for device ${adbDevice.serial}: ${errorMsg}`);
          this.logger?.warn(`Failed to get info for device ${adbDevice.serial}: ${errorMsg}`);
        }
      }

      // Filter by options
      let filteredDevices = devices;
      if (options.availableOnly) {
        filteredDevices = filteredDevices.filter((d) => d.status === 'available');
      }

      this.logger?.info(`Discovered ${filteredDevices.length} Android devices`);

      return filteredDevices;
    } catch (error) {
      this.logger?.error('Android device discovery failed', error);
      return [];
    }
  }

  /**
   * Check if ADB is available on the system
   */
  private async checkAdbAvailable(): Promise<void> {
    try {
      await execAsync(`${this.adbPath} version`, { timeout: this.timeout });
      this.logger?.debug('ADB is available');
    } catch (error) {
      throw new Error(
        `ADB not found. Please ensure Android SDK is installed and ADB is in PATH, or specify adbPath.`
      );
    }
  }

  /**
   * List all devices connected via ADB
   */
  private async listDevices(): Promise<AdbDevice[]> {
    const { stdout } = await execAsync(`${this.adbPath} devices -l`, { timeout: this.timeout });

    const devices: AdbDevice[] = [];
    const lines = stdout.trim().split('\n');

    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;

      // Parse line format: <serial>  <status> <product>:<model>:<device>
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;

      const serial = parts[0];
      const status = parts[1];

      if (!serial || !status) continue;

      const device: AdbDevice = {
        serial,
        status: status as AdbDevice['status'],
      };

      // Parse additional properties
      for (let j = 2; j < parts.length; j++) {
        const prop = parts[j];
        if (!prop) continue;
        const colonIndex = prop.indexOf(':');
        if (colonIndex === -1) continue;
        const key = prop.slice(0, colonIndex);
        const value = prop.slice(colonIndex + 1);
        if (value) {
          if (key === 'product') device.product = value;
          if (key === 'model') device.model = value;
          if (key === 'device') device.device = value;
          if (key === 'transport_id') device.transportId = value;
        }
      }

      devices.push(device);
    }

    return devices;
  }

  /**
   * Get detailed information about a specific device
   */
  private async getDeviceInfo(adbDevice: AdbDevice): Promise<DiscoveredDevice | null> {
    const props = await this.getDeviceProperties(adbDevice.serial);
    const screenSize = await this.getScreenSize(adbDevice.serial);

    // Determine device type
    const isEmulator = adbDevice.serial.startsWith('emulator-') ||
                        props['ro.product.name']?.includes('sdk') ||
                        props['ro.product.name']?.includes('emulator') ||
                        props['ro.build.characteristics']?.includes('emulator');

    // Determine status
    let status: DiscoveredDevice['status'] = 'offline';
    if (adbDevice.status === 'device') {
      status = 'available';
    } else if (adbDevice.status === 'offline') {
      status = 'offline';
    } else if (adbDevice.status === 'unauthorized') {
      status = 'offline';
    }

    // Get OS version
    const osVersion = props['ro.build.version.release'] || 'Unknown';

    // Get device name/model
    const manufacturer = props['ro.product.manufacturer'] || '';
    const model = props['ro.product.model'] || adbDevice.model || 'Unknown';
    const name = manufacturer ? `${manufacturer} ${model}` : model;

    const device: DiscoveredDevice = {
      id: adbDevice.serial,
      platform: 'android',
      name,
      osVersion,
      type: isEmulator ? 'emulator' : 'physical',
      screenWidth: screenSize?.width,
      screenHeight: screenSize?.height,
      screenDensity: props['ro.sf.lcd_density']
        ? parseInt(props['ro.sf.lcd_density'], 10)
        : undefined,
      model: props['ro.product.model'] || adbDevice.model,
      status,
      isReady: adbDevice.status === 'device',
      capabilities: {
        apiLevel: props['ro.build.version.sdk'],
        manufacturer,
        product: props['ro.product.name'],
        device: props['ro.build.characteristics'],
      },
    };

    return device;
  }

  /**
   * Get device properties via getprop
   */
  private async getDeviceProperties(serial: string): Promise<AdbDeviceProperties> {
    try {
      const { stdout } = await execAsync(
        `${this.adbPath} -s ${serial} shell getprop`,
        { timeout: this.timeout }
      );

      const props: AdbDeviceProperties = {};
      const lines = stdout.trim().split('\n');

      for (const line of lines) {
        // Parse format: [prop.name]: [value]
        const match = line.match(/^\[(.+?)\]: \[(.+?)\]$/);
        if (match) {
          props[match[1] as keyof AdbDeviceProperties] = match[2];
        }
      }

      return props;
    } catch (error) {
      this.logger?.warn(`Failed to get properties for device ${serial}`);
      return {};
    }
  }

  /**
   * Get screen size for a device
   */
  private async getScreenSize(serial: string): Promise<{ width: number; height: number } | null> {
    try {
      const { stdout } = await execAsync(
        `${this.adbPath} -s ${serial} shell wm size`,
        { timeout: this.timeout }
      );

      // Parse format: Physical size: 1080x2400
      const match = stdout.match(/Physical size: (\d+)x(\d+)/);
      if (match?.[1] && match?.[2]) {
        return {
          width: parseInt(match[1], 10),
          height: parseInt(match[2], 10),
        };
      }
      return null;
    } catch (error) {
      this.logger?.debug(`Failed to get screen size for device ${serial}`);
      return null;
    }
  }

  /**
   * Start an Android emulator
   */
  async startEmulator(emulatorName: string): Promise<void> {
    this.logger?.info(`Starting Android emulator: ${emulatorName}`);

    try {
      // Run in background - don't wait for it to finish
      exec(`${this.adbPath} -e emu -avd ${emulatorName} &`);

      // Wait for device to become available
      let attempts = 0;
      const maxAttempts = 60; // 60 seconds max wait

      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const devices = await this.listDevices();
        const device = devices.find((d) => d.serial.includes(emulatorName) || d.serial.startsWith('emulator-'));

        if (device && device.status === 'device') {
          this.logger?.info(`Emulator ${emulatorName} started successfully`);
          return;
        }

        attempts++;
      }

      throw new Error(`Timeout waiting for emulator ${emulatorName} to start`);
    } catch (error) {
      throw new Error(`Failed to start emulator ${emulatorName}: ${error}`);
    }
  }

  /**
   * List available Android AVDs (Android Virtual Devices)
   */
  async listAvds(): Promise<string[]> {
    try {
      const { stdout } = await execAsync(`${this.adbPath} list avd`, { timeout: this.timeout });

      const avds: string[] = [];
      const lines = stdout.trim().split('\n');

      for (const line of lines) {
        if (line.includes('Name:')) {
          const name = line.replace('Name:', '').trim();
          avds.push(name);
        }
      }

      return avds;
    } catch (error) {
      this.logger?.warn('Failed to list Android AVDs');
      return [];
    }
  }

  /**
   * Check if a device is ready for testing
   */
  async isDeviceReady(serial: string): Promise<boolean> {
    try {
      const devices = await this.listDevices();
      const device = devices.find((d) => d.serial === serial);
      return device?.status === 'device';
    } catch {
      return false;
    }
  }
}
