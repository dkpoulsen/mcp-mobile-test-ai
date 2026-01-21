/**
 * API Tests Entry Point
 *
 * Exports all API test utilities and re-exports test modules for easier imports.
 */

export * from './test-server.js';
export * from './test-helpers.js';

// Export network capture types and utilities
export {
  createNetworkCapture,
  HttpMethod,
  NetworkCapture,
  type NetworkRequest,
  type NetworkResponse,
  type NetworkCaptureOptions,
  type NetworkValidationRule,
  type NetworkValidationResult,
  type NetworkStatistics,
  type RequestFilter,
} from '../../src/services/network-capture/index.js';

// Re-export types for TypeScript users
export type { TestServerInstance, TestServerOptions } from './test-server.js';
