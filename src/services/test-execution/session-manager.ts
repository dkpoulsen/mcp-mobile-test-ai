/**
 * Device session manager - handles device session lifecycle for test execution
 * Provides device reservation, session pooling, and cleanup functionality
 */

import { randomUUID } from 'node:crypto';
import { createModuleLogger } from '../../utils/logger.js';
import { getPrismaClient } from '../../database/client.js';
import type {
  DeviceSession,
  TestRunnerEventHandler,
  TestRunnerEvent,
} from './types.js';
import { TestRunnerEventType as EventType } from './types.js';

const logger = createModuleLogger('session-manager');

/**
 * Device session manager class
 */
export class DeviceSessionManager {
  /** Active device sessions by device ID */
  private sessions: Map<string, DeviceSession> = new Map();

  /** Sessions by session ID */
  private sessionsById: Map<string, DeviceSession> = new Map();

  /** Event handlers */
  private eventHandlers: Set<TestRunnerEventHandler> = new Set();

  /** Session idle timeout check interval */
  private idleCheckInterval?: NodeJS.Timeout;

  /** Maximum sessions allowed */
  private maxSessions: number;

  /** Session idle timeout in milliseconds */
  private sessionIdleTimeout: number;

  constructor(config?: { maxSessions?: number; sessionIdleTimeout?: number }) {
    this.maxSessions = config?.maxSessions ?? 10;
    this.sessionIdleTimeout = config?.sessionIdleTimeout ?? 300000; // 5 minutes default

    // Start idle session check interval
    this.startIdleCheck();
  }

  /**
   * Get or create a session for a device
   */
  async acquireSession(deviceId: string, testRunId: string): Promise<DeviceSession> {
    const prisma = getPrismaClient();

    // Verify device exists and is available
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
    });

    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    if (device.status === 'OFFLINE' || device.status === 'MAINTENANCE') {
      throw new Error(`Device is not available: ${device.status}`);
    }

    // Check if we already have an active session for this device
    let session = this.sessions.get(deviceId);

    if (session) {
      // Check if session is healthy
      if (session.status === 'error' || session.status === 'terminating') {
        // Clean up unhealthy session and create a new one
        await this.releaseSession(deviceId);
        session = null;
      } else if (session.status === 'busy') {
        // Session is busy, wait for it to become available or create new session if under limit
        const activeCount = this.getActiveSessionCount();
        if (activeCount >= this.maxSessions) {
          throw new Error(
            `Maximum session limit reached (${this.maxSessions}). Device ${deviceId} is busy.`
          );
        }
      }
    }

    // Create new session if needed
    if (!session) {
      session = this.createSession(deviceId, device);
    }

    // Mark session as busy
    session.status = 'busy';
    session.currentTestRunId = testRunId;
    session.lastActivityAt = new Date();
    session.testCount++;

    // Mark device as busy in database
    await prisma.device.update({
      where: { id: deviceId },
      data: { status: 'BUSY' },
    });

    logger.debug(
      {
        sessionId: session.sessionId,
        deviceId,
        testRunId,
        testCount: session.testCount,
      },
      'Session acquired'
    );

    this.emitEvent({
      type: EventType.SESSION_CREATED,
      testRunId,
      deviceId,
      sessionId: session.sessionId,
      timestamp: new Date(),
      data: { sessionStatus: session.status },
    });

    return session;
  }

  /**
   * Release a session back to the pool
   */
  async releaseSession(deviceId: string, error?: Error): Promise<void> {
    const session = this.sessions.get(deviceId);

    if (!session) {
      logger.warn({ deviceId }, 'No session found for device during release');
      return;
    }

    const prisma = getPrismaClient();

    if (error) {
      // Mark session as error state
      session.status = 'error';
      session.metadata.lastError = {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      };

      logger.error(
        {
          sessionId: session.sessionId,
          deviceId,
          error: error.message,
        },
        'Session error during release'
      );

      this.emitEvent({
        type: EventType.SESSION_ERROR,
        testRunId: session.currentTestRunId || '',
        deviceId,
        sessionId: session.sessionId,
        timestamp: new Date(),
        data: { error: error.message },
      });
    } else {
      // Mark session as idle
      session.status = 'idle';
      session.currentTestRunId = undefined;
      session.currentTestCaseId = undefined;
      session.lastActivityAt = new Date();

      logger.debug(
        {
          sessionId: session.sessionId,
          deviceId,
          testCount: session.testCount,
        },
        'Session released'
      );
    }

    // Release device in database
    await prisma.device.update({
      where: { id: deviceId },
      data: { status: 'AVAILABLE' },
    }).catch((err) => {
      logger.error({ error: err, deviceId }, 'Failed to update device status');
    });

    this.emitEvent({
      type: EventType.SESSION_RELEASED,
      testRunId: session.currentTestRunId || '',
      deviceId,
      sessionId: session.sessionId,
      timestamp: new Date(),
      data: { sessionStatus: session.status },
    });
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): DeviceSession | undefined {
    return this.sessionsById.get(sessionId);
  }

  /**
   * Get a session by device ID
   */
  getSessionByDevice(deviceId: string): DeviceSession | undefined {
    return this.sessions.get(deviceId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): DeviceSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status === 'busy' || s.status === 'initializing'
    );
  }

  /**
   * Get all available sessions
   */
  getAvailableSessions(): DeviceSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.status === 'idle');
  }

  /**
   * Get session statistics
   */
  getSessionStats(): {
    total: number;
    active: number;
    available: number;
    error: number;
  } {
    const sessions = Array.from(this.sessions.values());
    return {
      total: sessions.length,
      active: sessions.filter((s) => s.status === 'busy' || s.status === 'initializing').length,
      available: sessions.filter((s) => s.status === 'idle').length,
      error: sessions.filter((s) => s.status === 'error').length,
    };
  }

  /**
   * Terminate all sessions
   */
  async terminateAllSessions(): Promise<void> {
    logger.info('Terminating all sessions');

    const deviceIds = Array.from(this.sessions.keys());

    for (const deviceId of deviceIds) {
      await this.terminateSession(deviceId);
    }
  }

  /**
   * Terminate a specific session
   */
  async terminateSession(deviceId: string): Promise<void> {
    const session = this.sessions.get(deviceId);

    if (!session) {
      return;
    }

    session.status = 'terminating';

    // Release device in database
    const prisma = getPrismaClient();
    await prisma.device
      .update({
        where: { id: deviceId },
        data: { status: 'AVAILABLE' },
      })
      .catch((err) => {
        logger.error({ error: err, deviceId }, 'Failed to update device status during termination');
      });

    // Remove session from maps
    this.sessions.delete(deviceId);
    this.sessionsById.delete(session.sessionId);

    logger.debug(
      {
        sessionId: session.sessionId,
        deviceId,
        testCount: session.testCount,
      },
      'Session terminated'
    );
  }

  /**
   * Register an event handler
   */
  on(eventHandler: TestRunnerEventHandler): void {
    this.eventHandlers.add(eventHandler);
  }

  /**
   * Unregister an event handler
   */
  off(eventHandler: TestRunnerEventHandler): void {
    this.eventHandlers.delete(eventHandler);
  }

  /**
   * Create a new session
   */
  private createSession(
    deviceId: string,
    device: { id: string; platform: 'IOS' | 'ANDROID'; name: string; osVersion: string; isEmulator: boolean }
  ): DeviceSession {
    const sessionId = randomUUID();

    const session: DeviceSession = {
      sessionId,
      deviceId,
      status: 'idle',
      createdAt: new Date(),
      lastActivityAt: new Date(),
      testCount: 0,
      metadata: {
        platform: device.platform.toLowerCase(),
        deviceName: device.name,
        osVersion: device.osVersion,
        isEmulator: device.isEmulator,
      },
    };

    this.sessions.set(deviceId, session);
    this.sessionsById.set(sessionId, session);

    logger.debug(
      {
        sessionId,
        deviceId,
        platform: device.platform,
        deviceName: device.name,
      },
      'New session created'
    );

    return session;
  }

  /**
   * Get count of active sessions
   */
  private getActiveSessionCount(): number {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status === 'busy' || s.status === 'initializing' || s.status === 'idle'
    ).length;
  }

  /**
   * Start idle session check interval
   */
  private startIdleCheck(): void {
    this.idleCheckInterval = setInterval(() => {
      this.checkIdleSessions();
    }, 60000); // Check every minute
  }

  /**
   * Check for idle sessions and terminate old ones
   */
  private checkIdleSessions(): void {
    const now = Date.now();
    const sessionsToTerminate: string[] = [];

    for (const [deviceId, session] of this.sessions.entries()) {
      if (session.status === 'idle') {
        const idleTime = now - session.lastActivityAt.getTime();
        if (idleTime > this.sessionIdleTimeout) {
          sessionsToTerminate.push(deviceId);
        }
      }
    }

    if (sessionsToTerminate.length > 0) {
      logger.info(
        {
          count: sessionsToTerminate.length,
          deviceIds: sessionsToTerminate,
        },
        'Terminating idle sessions'
      );

      for (const deviceId of sessionsToTerminate) {
        this.terminateSession(deviceId).catch((err) => {
          logger.error({ error: err, deviceId }, 'Failed to terminate idle session');
        });
      }
    }
  }

  /**
   * Emit an event to all registered handlers
   */
  private emitEvent(event: TestRunnerEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        void Promise.resolve(handler(event));
      } catch (error) {
        logger.error({ error }, 'Error in event handler');
      }
    }
  }

  /**
   * Cleanup and stop the session manager
   */
  async destroy(): Promise<void> {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = undefined;
    }

    await this.terminateAllSessions();
    this.eventHandlers.clear();

    logger.info('Session manager destroyed');
  }
}

/**
 * Global session manager instance
 */
let globalSessionManager: DeviceSessionManager | null = null;

/**
 * Get the global session manager instance
 */
export function getGlobalSessionManager(config?: {
  maxSessions?: number;
  sessionIdleTimeout?: number;
}): DeviceSessionManager {
  if (!globalSessionManager) {
    globalSessionManager = new DeviceSessionManager(config);
  }
  return globalSessionManager;
}

/**
 * Reset the global session manager (useful for testing)
 */
export async function resetGlobalSessionManager(): Promise<void> {
  if (globalSessionManager) {
    await globalSessionManager.destroy();
    globalSessionManager = null;
  }
}
