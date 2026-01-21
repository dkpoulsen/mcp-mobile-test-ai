/**
 * Preset device configurations for the test matrix
 *
 * Provides a library of common devices, browsers, and viewport configurations.
 */

import type { PresetDevice, PresetDeviceLibrary } from './types.js';

/**
 * Built-in preset devices
 */
const BUILTIN_DEVICES: PresetDevice[] = [
  // Desktop - Common Resolutions
  {
    name: 'desktop-1920x1080',
    category: 'desktop',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
  },
  {
    name: 'desktop-1366x768',
    category: 'desktop',
    viewport: { width: 1366, height: 768 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
  },
  {
    name: 'desktop-2560x1440',
    category: 'desktop',
    viewport: { width: 2560, height: 1440 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
  },
  {
    name: 'desktop-1440x900',
    category: 'desktop',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
  },
  {
    name: 'desktop-1280x720',
    category: 'desktop',
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
  },

  // Tablet Devices
  {
    name: 'ipad-landscape',
    category: 'tablet',
    viewport: { width: 1024, height: 768 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  },
  {
    name: 'ipad-portrait',
    category: 'tablet',
    viewport: { width: 768, height: 1024 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  },
  {
    name: 'ipad-pro-12.9-landscape',
    category: 'tablet',
    viewport: { width: 1366, height: 1024 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  },
  {
    name: 'ipad-pro-12.9-portrait',
    category: 'tablet',
    viewport: { width: 1024, height: 1366 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  },
  {
    name: 'tablet-android-10-landscape',
    category: 'tablet',
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-T865) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  },
  {
    name: 'tablet-android-10-portrait',
    category: 'tablet',
    viewport: { width: 800, height: 1280 },
    userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-T865) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  },

  // Mobile - iPhone
  {
    name: 'iphone-14-pro-max',
    category: 'mobile',
    viewport: { width: 430, height: 932 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  },
  {
    name: 'iphone-14-pro',
    category: 'mobile',
    viewport: { width: 393, height: 852 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  },
  {
    name: 'iphone-14',
    category: 'mobile',
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  },
  {
    name: 'iphone-se',
    category: 'mobile',
    viewport: { width: 375, height: 667 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  },
  {
    name: 'iphone-12-pro',
    category: 'mobile',
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  },

  // Mobile - Android
  {
    name: 'pixel-7',
    category: 'mobile',
    viewport: { width: 412, height: 915 },
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
    deviceScaleFactor: 2.625,
    hasTouch: true,
    isMobile: true,
  },
  {
    name: 'pixel-6',
    category: 'mobile',
    viewport: { width: 412, height: 915 },
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
    deviceScaleFactor: 2.625,
    hasTouch: true,
    isMobile: true,
  },
  {
    name: 'samsung-galaxy-s21',
    category: 'mobile',
    viewport: { width: 384, height: 854 },
    userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  },
  {
    name: 'samsung-galaxy-s20',
    category: 'mobile',
    viewport: { width: 360, height: 800 },
    userAgent: 'Mozilla/5.0 (Linux; Android 11; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  },

  // Small mobile
  {
    name: 'mobile-small',
    category: 'mobile',
    viewport: { width: 320, height: 568 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  },
];

/**
 * Create a preset device library
 */
export function createPresetDeviceLibrary(): PresetDeviceLibrary {
  const devices = new Map<string, PresetDevice>();

  // Initialize with built-in devices
  for (const device of BUILTIN_DEVICES) {
    devices.set(device.name, { ...device });
  }

  return {
    get(name: string): PresetDevice | undefined {
      return devices.get(name);
    },

    all(): PresetDevice[] {
      return Array.from(devices.values());
    },

    getByCategory(category: string): PresetDevice[] {
      return Array.from(devices.values()).filter((d) => d.category === category);
    },

    add(device: PresetDevice): void {
      devices.set(device.name, { ...device });
    },

    remove(name: string): void {
      devices.delete(name);
    },
  };
}

/**
 * Default preset device library instance
 */
export const defaultDeviceLibrary = createPresetDeviceLibrary();

/**
 * Get common preset devices by category
 */
export const PresetDevices = {
  /** All desktop resolutions */
  get desktop(): PresetDevice[] {
    return defaultDeviceLibrary.getByCategory('desktop');
  },

  /** All tablet devices */
  get tablet(): PresetDevice[] {
    return defaultDeviceLibrary.getByCategory('tablet');
  },

  /** All mobile devices */
  get mobile(): PresetDevice[] {
    return defaultDeviceLibrary.getByCategory('mobile');
  },

  /** Common devices for quick testing */
  get common(): PresetDevice[] {
    return [
      defaultDeviceLibrary.get('desktop-1920x1080')!,
      defaultDeviceLibrary.get('iphone-14')!,
      defaultDeviceLibrary.get('ipad-landscape')!,
      defaultDeviceLibrary.get('mobile-small')!,
    ].filter((d): d is PresetDevice => d !== undefined);
  },

  /** All preset devices */
  get all(): PresetDevice[] {
    return defaultDeviceLibrary.all();
  },

  /** Get a specific device by name */
  get(name: string): PresetDevice | undefined {
    return defaultDeviceLibrary.get(name);
  },
};
