/**
 * MCP Mobile Test AI
 *
 * An intelligent mobile testing framework that leverages Large Language Models (LLMs)
 * and the Model Context Protocol (MCP) to automate and enhance mobile application testing.
 */

export { createMcpMobileTest } from './core/index.js';
export type { McpMobileTestOptions, TestResult } from './types/index.js';

// Database module exports
export {
  getPrismaClient,
  disconnectDatabase,
  resetDatabaseConnection,
  healthCheck,
  executeTransaction,
} from './database/client.js';

export {
  DeviceRepository,
  TestSuiteRepository,
  TestCaseRepository,
  TestRunRepository,
  TestResultRepository,
  ArtifactRepository,
} from './database/repositories/index.js';

// Services module exports
export {
  DeviceDiscoveryService,
  getDeviceDiscoveryService,
  discoverDevices,
} from './services/index.js';

export type {
  DiscoveredDevice,
  DeviceDiscoveryOptions,
  DeviceDiscoveryResult,
  DevicePlatform,
  DeviceType,
} from './services/device-discovery/index.js';
