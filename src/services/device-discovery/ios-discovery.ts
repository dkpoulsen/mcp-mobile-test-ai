/**
 * iOS device discovery using simctl and instruments
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  DiscoveredDevice,
  DeviceDiscoveryOptions,
  SimctlDevice,
  SimctlRuntime,
  SimctlDeviceType,
} from './types.js';
import type { Logger } from '../../utils/logger.js';

const execAsync = promisify(exec);

/**
 * Default timeout for simctl commands
 */
const DEFAULT_SIMCTL_TIMEOUT = 10000;

/**
 * iOS device discovery class
 */
export class IOSDeviceDiscovery {
  private simctlPath: string;
  private timeout: number;
  private logger?: Logger;

  constructor(options: { simctlPath?: string; timeout?: number; logger?: Logger } = {}) {
    this.simctlPath = options.simctlPath || 'xcrun simctl';
    this.timeout = options.timeout || DEFAULT_SIMCTL_TIMEOUT;
    this.logger = options.logger;
  }

  /**
   * Discover all iOS devices (simulators and physical)
   */
  async discover(options: DeviceDiscoveryOptions = {}): Promise<DiscoveredDevice[]> {
    this.logger?.debug('Starting iOS device discovery');

    const devices: DiscoveredDevice[] = [];
    const errors: string[] = [];

    try {
      // Check if simctl is available
      await this.checkSimctlAvailable();

      // Discover simulators
      try {
        const simulators = await this.discoverSimulators(options);
        devices.push(...simulators);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to discover iOS simulators: ${errorMsg}`);
        this.logger?.warn('Failed to discover iOS simulators', error);
      }

      // Discover physical devices
      try {
        const physicalDevices = await this.discoverPhysicalDevices();
        devices.push(...physicalDevices);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to discover physical iOS devices: ${errorMsg}`);
        this.logger?.warn('Failed to discover physical iOS devices', error);
      }

      // Filter by options
      let filteredDevices = devices;
      if (options.availableOnly) {
        filteredDevices = filteredDevices.filter((d) => d.status === 'available');
      }
      if (!options.includeOffline) {
        filteredDevices = filteredDevices.filter((d) => d.status !== 'offline');
      }

      this.logger?.info(`Discovered ${filteredDevices.length} iOS devices`);

      return filteredDevices;
    } catch (error) {
      this.logger?.error('iOS device discovery failed', error);
      return [];
    }
  }

  /**
   * Check if simctl is available on the system
   */
  private async checkSimctlAvailable(): Promise<void> {
    try {
      await execAsync(`${this.simctlPath} help`, { timeout: this.timeout });
      this.logger?.debug('simctl is available');
    } catch (error) {
      throw new Error(
        `simctl not found. Please ensure Xcode is installed and you are on macOS.`
      );
    }
  }

  /**
   * Discover iOS simulators
   */
  private async discoverSimulators(options: DeviceDiscoveryOptions): Promise<DiscoveredDevice[]> {
    const devices: DiscoveredDevice[] = [];

    // Get list of all devices from simctl
    const simctlDevices = await this.listSimctlDevices();

    for (const simDevice of simctlDevices) {
      // Determine if simulator is booted
      const isBooted = simDevice.state === 'Booted';
      const isBooting = simDevice.state === 'Booting';

      // Determine status
      let status: DiscoveredDevice['status'] = 'offline';
      if (isBooted) {
        status = 'available';
      } else if (isBooting) {
        status = 'booting';
      }

      // Skip offline if not requested
      if (!options.includeOffline && status === 'offline') {
        continue;
      }

      // Extract screen size from device type
      const screenSize = this.getScreenSizeForDeviceType(simDevice.deviceType || simDevice.name);

      const device: DiscoveredDevice = {
        id: simDevice.udid,
        platform: 'ios',
        name: simDevice.name,
        osVersion: this.extractOsVersion(simDevice.osVersion),
        type: 'simulator',
        screenWidth: screenSize?.width,
        screenHeight: screenSize?.height,
        model: simDevice.deviceType,
        status,
        isReady: isBooted && simDevice.isAvailable,
        capabilities: {
          runtime: simDevice.runtime,
          state: simDevice.state,
          availability: simDevice.availability,
        },
      };

      devices.push(device);
    }

    return devices;
  }

  /**
   * Discover physical iOS devices
   */
  private async discoverPhysicalDevices(): Promise<DiscoveredDevice[]> {
    const devices: DiscoveredDevice[] = [];

    try {
      // Use simctl to list devices (includes physical ones)
      const { stdout } = await execAsync(
        `${this.simctlPath} list devices available`,
        { timeout: this.timeout }
      );

      const lines = stdout.trim().split('\n');
      let currentRuntime = '';

      for (const line of lines) {
        // Check for runtime header (== --iOS 17.0 --)
        const runtimeMatch = line.match(/^== (.+?) ==$/);
        if (runtimeMatch) {
          currentRuntime = runtimeMatch[1] ?? '';
          continue;
        }

        // Check for physical device (doesn't have (Booted) or (Shutdown))
        // Physical devices are typically shown as "iPhone (USB)"
        const deviceMatch = line.match(/^\s*(.+?)\s+\(([0-9a-f-]+)\)\s+\((.+?)\)$/);
        if (!deviceMatch) continue;

        const name = deviceMatch[1];
        const udid = deviceMatch[2];
        const state = deviceMatch[3];

        if (!name || !udid || !state) continue;

        // Skip simulators (they have Shutdown/Booted state)
        if (['Shutdown', 'Booted', 'Booting', 'Shutting down'].includes(state)) {
          continue;
        }

        // This is a physical device
        const status: DiscoveredDevice['status'] = 'available';

        const device: DiscoveredDevice = {
          id: udid,
          platform: 'ios',
          name,
          osVersion: this.extractOsVersion(currentRuntime),
          type: 'physical',
          status,
          isReady: true,
          capabilities: {
            state,
            runtime: currentRuntime,
          },
        };

        devices.push(device);
      }
    } catch (error) {
      this.logger?.debug('Failed to discover physical iOS devices', error);
    }

    return devices;
  }

  /**
   * List all simctl devices
   */
  private async listSimctlDevices(): Promise<SimctlDevice[]> {
    const devices: SimctlDevice[] = [];

    try {
      // Get JSON output from simctl
      const { stdout } = await execAsync(`${this.simctlPath} list devices available --json`, {
        timeout: this.timeout,
      });

      const data = JSON.parse(stdout);

      // Parse the devices structure
      if (data.devices) {
        for (const [runtimeIdentifier, runtimeDevices] of Object.entries(data.devices)) {
          const runtimeDevicesArray = Array.isArray(runtimeDevices) ? runtimeDevices : [];

          for (const device of runtimeDevicesArray) {
            // Extract OS version from runtime identifier
            const osVersion = this.extractOsVersion(runtimeIdentifier);

            devices.push({
              udid: device.udid,
              name: device.name,
              osVersion,
              runtime: runtimeIdentifier,
              isAvailable: device.isAvailable || device.state === 'Booted',
              availability: device.availability,
              state: device.state || 'Shutdown',
              deviceType: device.deviceTypeIdentifier || undefined,
            });
          }
        }
      }
    } catch (error) {
      // Fall back to text parsing if JSON fails
      this.logger?.debug('JSON parsing failed, falling back to text parsing');
      return this.listSimctlDevicesText();
    }

    return devices;
  }

  /**
   * List simctl devices using text parsing (fallback)
   */
  private async listSimctlDevicesText(): Promise<SimctlDevice[]> {
    const devices: SimctlDevice[] = [];

    try {
      const { stdout } = await execAsync(`${this.simctlPath} list devices available`, {
        timeout: this.timeout,
      });

      const lines = stdout.trim().split('\n');
      let currentRuntime = '';

      for (const line of lines) {
        // Check for runtime header
        const runtimeMatch = line.match(/^== (.+?) ==$/);
        if (runtimeMatch) {
          currentRuntime = runtimeMatch[1] ?? '';
          continue;
        }

        // Parse device line
        // Format: "    iPhone 15 Pro (ABC123) (Booted)"
        const deviceMatch = line.match(/^\s+(.+?)\s+\(([0-9A-Fa-f-]+)\)\s*\((.+?)\)?$/);
        if (deviceMatch) {
          const name = deviceMatch[1];
          const udid = deviceMatch[2];
          const state = deviceMatch[3];

          if (!name || !udid || !state) continue;

          devices.push({
            udid,
            name,
            osVersion: this.extractOsVersion(currentRuntime),
            runtime: currentRuntime,
            isAvailable: state !== 'unavailable',
            state: state === 'unavailable' ? 'Shutdown' : (state as SimctlDevice['state']),
          });
        }
      }
    } catch (error) {
      this.logger?.warn('Failed to parse simctl devices text output', error);
    }

    return devices;
  }

  /**
   * Extract OS version from runtime string
   */
  private extractOsVersion(runtime: string): string {
    // Handle formats like "com.apple.CoreSimulator.SimRuntime.iOS-17-0"
    const match = runtime.match(/iOS[-._]?(\d+[._]\d+)/);
    if (match?.[1]) {
      return match[1].replace('_', '.');
    }
    return runtime;
  }

  /**
   * Get screen size for a device type
   */
  private getScreenSizeForDeviceType(deviceType: string): { width: number; height: number } | null {
    // Common iOS device screen sizes (portrait)
    const screenSizes: Record<string, { width: number; height: number }> = {
      // iPhone 15 series
      'iPhone 15 Pro Max': { width: 1290, height: 2796 },
      'iPhone 15 Plus': { width: 960, height: 2079 },
      'iPhone 15 Pro': { width: 1179, height: 2556 },
      'iPhone 15': { width: 1179, height: 2556 },
      // iPhone 14 series
      'iPhone 14 Pro Max': { width: 1290, height: 2796 },
      'iPhone 14 Plus': { width: 960, height: 2079 },
      'iPhone 14 Pro': { width: 1179, height: 2556 },
      'iPhone 14': { width: 1170, height: 2532 },
      // iPhone 13 series
      'iPhone 13 Pro Max': { width: 1284, height: 2778 },
      'iPhone 13 Pro': { width: 1170, height: 2532 },
      'iPhone 13': { width: 1170, height: 2532 },
      'iPhone 13 mini': { width: 1080, height: 2340 },
      // iPhone SE
      'iPhone SE (3rd generation)': { width: 1080, height: 2340 },
      'iPhone SE (2nd generation)': { width: 1080, height: 2340 },
      // iPad Pro
      'iPad Pro 12.9': { width: 2048, height: 2732 },
      'iPad Pro 11': { width: 1668, height: 2388 },
      'iPad Pro 10.5': { width: 1668, height: 2224 },
      // iPad Air
      'iPad Air 10.9': { width: 1640, height: 2360 },
      // iPad mini
      'iPad mini 8.3': { width: 1488, height: 2266 },
      // iPad
      'iPad 10.2': { width: 1620, height: 2160 },
      // Generic
      'iPad': { width: 1620, height: 2160 },
    };

    // Try exact match first
    for (const [key, value] of Object.entries(screenSizes)) {
      if (deviceType.includes(key)) {
        return value;
      }
    }

    // Try partial match
    if (deviceType.includes('iPad')) {
      return { width: 1620, height: 2160 };
    }
    if (deviceType.includes('iPhone')) {
      return { width: 1170, height: 2532 };
    }

    return null;
  }

  /**
   * Boot an iOS simulator
   */
  async bootSimulator(udid: string): Promise<void> {
    this.logger?.info(`Booting iOS simulator: ${udid}`);

    try {
      await execAsync(`${this.simctlPath} boot ${udid}`, { timeout: this.timeout });

      // Wait for simulator to be ready
      let attempts = 0;
      const maxAttempts = 60;

      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const devices = await this.listSimctlDevices();
        const device = devices.find((d) => d.udid === udid);

        if (device && device.state === 'Booted') {
          this.logger?.info(`Simulator ${udid} booted successfully`);
          return;
        }

        attempts++;
      }

      throw new Error(`Timeout waiting for simulator ${udid} to boot`);
    } catch (error) {
      throw new Error(`Failed to boot simulator ${udid}: ${error}`);
    }
  }

  /**
   * Shutdown an iOS simulator
   */
  async shutdownSimulator(udid: string): Promise<void> {
    this.logger?.info(`Shutting down iOS simulator: ${udid}`);

    try {
      await execAsync(`${this.simctlPath} shutdown ${udid}`, { timeout: this.timeout });
      this.logger?.info(`Simulator ${udid} shut down successfully`);
    } catch (error) {
      throw new Error(`Failed to shutdown simulator ${udid}: ${error}`);
    }
  }

  /**
   * Erase an iOS simulator (reset to factory settings)
   */
  async eraseSimulator(udid: string): Promise<void> {
    this.logger?.info(`Erasing iOS simulator: ${udid}`);

    try {
      await execAsync(`${this.simctlPath} erase ${udid}`, { timeout: this.timeout });
      this.logger?.info(`Simulator ${udid} erased successfully`);
    } catch (error) {
      throw new Error(`Failed to erase simulator ${udid}: ${error}`);
    }
  }

  /**
   * List all available iOS runtimes
   */
  async listRuntimes(): Promise<SimctlRuntime[]> {
    try {
      const { stdout } = await execAsync(`${this.simctlPath} list runtimes available --json`, {
        timeout: this.timeout,
      });

      const data = JSON.parse(stdout);
      const runtimes: SimctlRuntime[] = [];

      if (data.runtimes) {
        for (const runtime of data.runtimes) {
          runtimes.push({
            identifier: runtime.identifier,
            version: runtime.version || '',
            buildNumber: runtime.buildversion || '',
            isAvailable: runtime.isAvailable === true,
            name: runtime.name,
          });
        }
      }

      return runtimes;
    } catch (error) {
      this.logger?.warn('Failed to list iOS runtimes', error);
      return [];
    }
  }

  /**
   * List all available iOS device types
   */
  async listDeviceTypes(): Promise<SimctlDeviceType[]> {
    try {
      const { stdout } = await execAsync(`${this.simctlPath} list devicetypes available --json`, {
        timeout: this.timeout,
      });

      const data = JSON.parse(stdout);
      const deviceTypes: SimctlDeviceType[] = [];

      if (data.devicetypes) {
        for (const deviceType of data.devicetypes) {
          deviceTypes.push({
            identifier: deviceType.identifier || deviceType.name,
            name: deviceType.name,
            productFamily: deviceType.productFamily || '',
            maxRuntimeVersion: deviceType.maxRuntimeVersion,
            minRuntimeVersion: deviceType.minRuntimeVersion,
          });
        }
      }

      return deviceTypes;
    } catch (error) {
      this.logger?.warn('Failed to list iOS device types', error);
      return [];
    }
  }

  /**
   * Create a new simulator
   */
  async createSimulator(
    deviceTypeIdentifier: string,
    runtimeIdentifier: string,
    name: string
  ): Promise<string> {
    this.logger?.info(`Creating iOS simulator: ${name}`);

    try {
      const { stdout } = await execAsync(
        `${this.simctlPath} create "${name}" ${deviceTypeIdentifier} ${runtimeIdentifier}`,
        { timeout: this.timeout }
      );

      // Parse output to get UDID
      const match = stdout.match(/([0-9A-Fa-f-]{36})/);
      if (match?.[0]) {
        this.logger?.info(`Simulator created with UDID: ${match[0]}`);
        return match[0];
      }

      throw new Error('Failed to parse UDID from create output');
    } catch (error) {
      throw new Error(`Failed to create simulator: ${error}`);
    }
  }

  /**
   * Delete a simulator
   */
  async deleteSimulator(udid: string): Promise<void> {
    this.logger?.info(`Deleting iOS simulator: ${udid}`);

    try {
      await execAsync(`${this.simctlPath} delete ${udid}`, { timeout: this.timeout });
      this.logger?.info(`Simulator ${udid} deleted successfully`);
    } catch (error) {
      throw new Error(`Failed to delete simulator ${udid}: ${error}`);
    }
  }

  /**
   * Check if a simulator is ready for testing
   */
  async isSimulatorReady(udid: string): Promise<boolean> {
    try {
      const devices = await this.listSimctlDevices();
      const device = devices.find((d) => d.udid === udid);
      return device?.state === 'Booted' && device?.isAvailable;
    } catch {
      return false;
    }
  }

  /**
   * Install app on simulator
   */
  async installApp(udid: string, appPath: string): Promise<void> {
    this.logger?.info(`Installing app on simulator ${udid}: ${appPath}`);

    try {
      await execAsync(`${this.simctlPath} install ${udid} "${appPath}"`, { timeout: this.timeout });
      this.logger?.info(`App installed successfully`);
    } catch (error) {
      throw new Error(`Failed to install app: ${error}`);
    }
  }

  /**
   * Launch app on simulator
   */
  async launchApp(udid: string, bundleId: string): Promise<void> {
    this.logger?.info(`Launching app ${bundleId} on simulator ${udid}`);

    try {
      await execAsync(`${this.simctlPath} launch ${udid} ${bundleId}`, { timeout: this.timeout });
      this.logger?.info(`App launched successfully`);
    } catch (error) {
      throw new Error(`Failed to launch app: ${error}`);
    }
  }

  /**
   * Terminate app on simulator
   */
  async terminateApp(udid: string, bundleId: string): Promise<void> {
    this.logger?.info(`Terminating app ${bundleId} on simulator ${udid}`);

    try {
      await execAsync(`${this.simctlPath} terminate ${udid} ${bundleId}`, { timeout: this.timeout });
      this.logger?.info(`App terminated successfully`);
    } catch (error) {
      throw new Error(`Failed to terminate app: ${error}`);
    }
  }

  /**
   * Uninstall app from simulator
   */
  async uninstallApp(udid: string, bundleId: string): Promise<void> {
    this.logger?.info(`Uninstalling app ${bundleId} from simulator ${udid}`);

    try {
      await execAsync(`${this.simctlPath} uninstall ${udid} ${bundleId}`, { timeout: this.timeout });
      this.logger?.info(`App uninstalled successfully`);
    } catch (error) {
      throw new Error(`Failed to uninstall app: ${error}`);
    }
  }
}
