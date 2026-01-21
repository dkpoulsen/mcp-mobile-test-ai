/**
 * Appium Server Wrapper Service
 *
 * Provides programmatic control over Appium servers including:
 * - Starting and stopping servers
 * - Automatic port allocation
 * - Log capture and management
 * - Health checks
 * - Multiple server instance management
 */

export { AppiumServer } from './appium-server.js';
export { AppiumServerManager, getAppiumManager, resetAppiumManager } from './manager.js';
export {
  findAvailablePort,
  isPortAvailable,
  releasePort,
  releaseAllPorts,
  getAllocatedPortCount,
  isPortAllocated,
} from './port-allocator.js';
export {
  LogBuffer,
  LogCaptureStream,
  createLogCaptureStream,
} from './log-capture.js';

// Export all types
export type {
  AppiumServerConfig,
  AppiumServerInfo,
  AppiumServerStatus,
  AppiumLogLevel,
  HealthCheckOptions,
  HealthCheckResult,
  AppiumLogEntry,
} from './types.js';

export {
  AppiumServerError,
  AppiumStartupError,
  AppiumShutdownError,
  AppiumHealthCheckError,
  PortAllocationError,
} from './types.js';

// Convenience functions
import { getAppiumManager } from './manager.js';
import type { AppiumServerConfig, AppiumServerInfo } from './types.js';

/**
 * Start a new Appium server with the given configuration
 */
export async function startAppiumServer(config?: AppiumServerConfig): Promise<AppiumServerInfo> {
  const manager = getAppiumManager();
  return manager.startServer(config);
}

/**
 * Stop a specific Appium server by ID
 */
export async function stopAppiumServer(serverId: string): Promise<void> {
  const manager = getAppiumManager();
  return manager.stopServer(serverId);
}

/**
 * Stop all running Appium servers
 */
export async function stopAllAppiumServers(): Promise<void> {
  const manager = getAppiumManager();
  return manager.stopAll();
}

/**
 * Get information about a specific server
 */
export function getAppiumServerInfo(serverId: string): AppiumServerInfo | undefined {
  const manager = getAppiumManager();
  return manager.getServerInfo(serverId);
}

/**
 * Get all Appium server instances
 */
export function getAllAppiumServers(): AppiumServerInfo[] {
  const manager = getAppiumManager();
  return manager.getAllServers();
}

/**
 * Get all running Appium servers
 */
export function getRunningAppiumServers(): AppiumServerInfo[] {
  const manager = getAppiumManager();
  return manager.getRunningServers();
}

/**
 * Perform a health check on a specific server
 */
export async function checkAppiumServerHealth(serverId: string) {
  const manager = getAppiumManager();
  return manager.healthCheck(serverId);
}
