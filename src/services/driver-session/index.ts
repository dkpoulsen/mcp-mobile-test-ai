/**
 * Driver Session Management Service
 *
 * Provides comprehensive session lifecycle management for WebDriverIO/Appium drivers
 * - Session creation, maintenance, and cleanup
 * - Multiple device support in parallel
 * - Health monitoring and auto-reconnect
 * - Batch session operations
 */

export { DriverSession } from './driver-session.js';
export { DriverSessionManager, getSessionManager, resetSessionManager } from './driver-session-manager.js';

// Export all types
export type {
  DriverSessionConfig,
  DriverSessionInfo,
  DriverSessionStatus,
  DriverPlatform,
  AutomationName,
  BaseDriverCapabilities,
  SessionHealthCheckResult,
  SessionStatistics,
  SessionFilterOptions,
  BatchSessionOptions,
  BatchSessionResult,
  SessionEvent,
  SessionEventType,
  SessionEventListener,
} from './types.js';

// Export all errors
export {
  DriverSessionError,
  SessionCreationError,
  SessionTerminationError,
  SessionConnectionError,
  SessionReconnectError,
  SessionHealthCheckError,
  SessionNotFoundError,
  SessionStateError,
  DeviceUnavailableError,
  ServerUnavailableError,
  BatchSessionError,
  InvalidCapabilitiesError,
} from './errors.js';

// Convenience functions
import { getSessionManager } from './driver-session-manager.js';
import type {
  DriverSessionConfig,
  DriverSessionInfo,
  SessionFilterOptions,
  BatchSessionOptions,
  BatchSessionResult,
  SessionHealthCheckResult,
  SessionStatistics,
  SessionEventListener,
} from './types.js';

/**
 * Create a new driver session
 */
export async function createDriverSession(
  config: DriverSessionConfig,
  autoStart = true
): Promise<DriverSessionInfo> {
  const manager = getSessionManager();
  return manager.createSession(config, autoStart);
}

/**
 * Create multiple driver sessions in batch
 */
export async function createBatchDriverSessions(
  configs: DriverSessionConfig[],
  options?: BatchSessionOptions
): Promise<BatchSessionResult> {
  const manager = getSessionManager();
  return manager.createBatchSessions(configs, options);
}

/**
 * Get a session by ID
 */
export function getDriverSession(sessionId: string) {
  const manager = getSessionManager();
  return manager.getSession(sessionId);
}

/**
 * Get session info by ID
 */
export function getDriverSessionInfo(sessionId: string): DriverSessionInfo | undefined {
  const manager = getSessionManager();
  return manager.getSessionInfo(sessionId);
}

/**
 * Get all sessions
 */
export function getAllDriverSessions(): DriverSessionInfo[] {
  const manager = getSessionManager();
  return manager.getAllSessions();
}

/**
 * Filter sessions
 */
export function filterDriverSessions(options: SessionFilterOptions): DriverSessionInfo[] {
  const manager = getSessionManager();
  return manager.filterSessions(options).map((s) => s.getInfo());
}

/**
 * Stop a specific session
 */
export async function stopDriverSession(sessionId: string): Promise<void> {
  const manager = getSessionManager();
  return manager.stopSession(sessionId);
}

/**
 * Delete a specific session
 */
export async function deleteDriverSession(sessionId: string): Promise<void> {
  const manager = getSessionManager();
  return manager.deleteSession(sessionId);
}

/**
 * Stop all active sessions
 */
export async function stopAllDriverSessions(): Promise<void> {
  const manager = getSessionManager();
  return manager.stopAllSessions();
}

/**
 * Delete all sessions
 */
export async function deleteAllDriverSessions(): Promise<void> {
  const manager = getSessionManager();
  return manager.deleteAllSessions();
}

/**
 * Perform health check on a session
 */
export async function healthCheckDriverSession(sessionId: string): Promise<SessionHealthCheckResult> {
  const manager = getSessionManager();
  return manager.healthCheck(sessionId);
}

/**
 * Perform health check on all active sessions
 */
export async function healthCheckAllDriverSessions(): Promise<Map<string, SessionHealthCheckResult>> {
  const manager = getSessionManager();
  return manager.healthCheckAll();
}

/**
 * Reconnect a session
 */
export async function reconnectDriverSession(sessionId: string): Promise<DriverSessionInfo> {
  const manager = getSessionManager();
  return manager.reconnectSession(sessionId);
}

/**
 * Get session statistics
 */
export function getDriverSessionStatistics(): SessionStatistics {
  const manager = getSessionManager();
  return manager.getStatistics();
}

/**
 * Add event listener for all session events
 */
export function addDriverSessionEventListener(listener: SessionEventListener): () => void {
  const manager = getSessionManager();
  return manager.addEventListener(listener);
}

/**
 * Get active session count
 */
export function getActiveDriverSessionCount(): number {
  const manager = getSessionManager();
  return manager.getActiveSessionCount();
}

/**
 * Get total session count
 */
export function getTotalDriverSessionCount(): number {
  const manager = getSessionManager();
  return manager.getSessionCount();
}
