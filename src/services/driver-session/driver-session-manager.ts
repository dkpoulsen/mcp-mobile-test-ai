/**
 * Driver Session Manager - Manages multiple WebDriverIO/Appium driver sessions
 * Handles session creation, maintenance, and cleanup for multiple devices in parallel
 */

import type { Logger } from '../../utils/logger.js';
import { createModuleLogger } from '../../utils/logger.js';
import { DriverSession } from './driver-session.js';
import type {
  DriverSessionConfig,
  DriverSessionInfo,
  DriverSessionStatus,
  DriverPlatform,
  SessionFilterOptions,
  SessionStatistics,
  BatchSessionOptions,
  BatchSessionResult,
  SessionEvent,
  SessionEventListener,
  SessionHealthCheckResult,
} from './types.js';
import {
  SessionNotFoundError,
  SessionStateError,
} from './errors.js';

/**
 * Manager for multiple WebDriverIO/Appium driver sessions
 */
export class DriverSessionManager {
  private sessions: Map<string, DriverSession> = new Map();
  private logger: Logger;
  private globalEventListeners: Set<SessionEventListener> = new Set();
  private isShuttingDown: boolean = false;

  // Statistics tracking
  private stats = {
    totalCreated: 0,
    totalDestroyed: 0,
    totalReconnectAttempts: 0,
    successfulReconnections: 0,
    sessionLifetimes: [] as number[],
  };

  constructor(logger?: Logger) {
    this.logger = logger?.child({ component: 'session-manager' }) || createModuleLogger('session-manager');
  }

  /**
   * Create a new driver session
   */
  async createSession(config: DriverSessionConfig, autoStart = true): Promise<DriverSessionInfo> {
    if (this.isShuttingDown) {
      throw new SessionStateError('Cannot create session while manager is shutting down', 'manager', 'shutting');
    }

    const session = new DriverSession(config, this.logger);

    // Forward session events to global listeners
    session.addEventListener((event) => this.forwardSessionEvent(event));

    this.sessions.set(session.getId(), session);

    if (autoStart) {
      try {
        const info = await session.start();
        this.stats.totalCreated++;
        return info;
      } catch (error) {
        // Clean up failed session
        this.sessions.delete(session.getId());
        await session.cleanup().catch(() => {
          // Ignore cleanup errors
        });
        throw error;
      }
    }

    return session.getInfo();
  }

  /**
   * Create multiple sessions in batch
   */
  async createBatchSessions(
    configs: DriverSessionConfig[],
    options: BatchSessionOptions = {}
  ): Promise<BatchSessionResult> {
    const {
      parallelism = 3,
      continueOnError = true,
      batchDelay = 1000,
    } = options;

    this.logger.info('Creating batch sessions', {
      count: configs.length,
      parallelism,
    });

    const successful: DriverSessionInfo[] = [];
    const failed: Array<{ config: DriverSessionConfig; error: string }> = [];

    // Process configs in chunks of parallelism
    for (let i = 0; i < configs.length; i += parallelism) {
      if (this.isShuttingDown) {
        this.logger.warn('Batch creation interrupted by shutdown');
        break;
      }

      const chunk = configs.slice(i, i + parallelism);

      const results = await Promise.allSettled(
        chunk.map(async (config) => {
          try {
            return await this.createSession(config);
          } catch (error) {
            if (!continueOnError) {
              throw error;
            }
            throw { config, error: error instanceof Error ? error.message : String(error) };
          }
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          successful.push(result.value);
        } else if (result.reason instanceof Error && !continueOnError) {
          // Re-throw if not continuing on error
          throw result.reason;
        } else if (result.reason) {
          failed.push({
            config: result.reason.config || chunk[results.indexOf(result)],
            error: result.reason.error || result.reason,
          });
        }
      }

      // Add delay between batches (except for last batch)
      if (i + parallelism < configs.length && batchDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, batchDelay));
      }
    }

    this.logger.info('Batch sessions created', {
      successful: successful.length,
      failed: failed.length,
      total: configs.length,
    });

    return {
      successful,
      failed,
      total: configs.length,
    };
  }

  /**
   * Start an existing idle session
   */
  async startSession(sessionId: string): Promise<DriverSessionInfo> {
    const session = this.getSession(sessionId);

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    try {
      const info = await session.start();
      this.stats.totalCreated++;
      return info;
    } catch (error) {
      this.logger.error('Failed to start session', { sessionId, error });
      throw error;
    }
  }

  /**
   * Stop a specific session
   */
  async stopSession(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    try {
      await session.stop();
      this.recordSessionLifetime(sessionId);
      this.stats.totalDestroyed++;
    } catch (error) {
      this.logger.error('Failed to stop session', { sessionId, error });
      throw error;
    }
  }

  /**
   * Delete a session and remove it from the manager
   */
  async deleteSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    try {
      if (session.canStop()) {
        await session.stop();
        this.recordSessionLifetime(sessionId);
        this.stats.totalDestroyed++;
      }
    } catch (error) {
      this.logger.warn('Error stopping session during deletion', { sessionId, error });
    }

    await session.cleanup();
    this.sessions.delete(sessionId);

    this.logger.info('Session deleted', { sessionId });
  }

  /**
   * Stop all active sessions
   */
  async stopAllSessions(): Promise<void> {
    this.logger.info('Stopping all sessions', { count: this.sessions.size });

    const activeSessions = this.getSessionsByStatus('active');

    const stopPromises = activeSessions.map(async (session) => {
      try {
        await this.stopSession(session.getId());
      } catch (error) {
        this.logger.error('Failed to stop session', {
          sessionId: session.getId(),
          error,
        });
      }
    });

    await Promise.allSettled(stopPromises);

    this.logger.info('All sessions stopped');
  }

  /**
   * Delete all sessions
   */
  async deleteAllSessions(): Promise<void> {
    this.logger.info('Deleting all sessions', { count: this.sessions.size });

    const sessionIds = Array.from(this.sessions.keys());

    await Promise.allSettled(
      sessionIds.map((id) => this.deleteSession(id).catch((error) => {
        this.logger.error('Failed to delete session', { sessionId: id, error });
      }))
    );

    this.sessions.clear();
    this.logger.info('All sessions deleted');
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): DriverSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get session info by ID
   */
  getSessionInfo(sessionId: string): DriverSessionInfo | undefined {
    return this.sessions.get(sessionId)?.getInfo();
  }

  /**
   * Get all session info
   */
  getAllSessions(): DriverSessionInfo[] {
    return Array.from(this.sessions.values()).map((session) => session.getInfo());
  }

  /**
   * Get sessions filtered by status
   */
  getSessionsByStatus(status: DriverSessionStatus): DriverSession[] {
    return Array.from(this.sessions.values()).filter(
      (session) => session.getStatus() === status
    );
  }

  /**
   * Get session info filtered by status
   */
  getSessionInfosByStatus(status: DriverSessionStatus): DriverSessionInfo[] {
    return this.getSessionsByStatus(status).map((session) => session.getInfo());
  }

  /**
   * Get sessions filtered by platform
   */
  getSessionsByPlatform(platform: DriverPlatform): DriverSession[] {
    return Array.from(this.sessions.values()).filter(
      (session) => session.getInfo().capabilities.platformName === platform
    );
  }

  /**
   * Filter sessions based on multiple criteria
   */
  filterSessions(options: SessionFilterOptions): DriverSession[] {
    let sessions = Array.from(this.sessions.values());

    if (options.status) {
      sessions = sessions.filter((s) => s.getStatus() === options.status);
    }

    if (options.platform) {
      sessions = sessions.filter(
        (s) => s.getInfo().capabilities.platformName === options.platform
      );
    }

    if (options.tags && options.tags.length > 0) {
      sessions = sessions.filter((s) => {
        const sessionTags = s.getInfo().tags;
        return options.tags!.every((tag) => sessionTags.includes(tag));
      });
    }

    if (options.serverUrl) {
      sessions = sessions.filter((s) => s.getInfo().serverUrl === options.serverUrl);
    }

    if (options.udid) {
      sessions = sessions.filter(
        (s) => s.getInfo().capabilities.udid === options.udid
      );
    }

    return sessions;
  }

  /**
   * Get active sessions count
   */
  getActiveSessionCount(): number {
    return this.getSessionsByStatus('active').length;
  }

  /**
   * Get total session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Perform health check on a specific session
   */
  async healthCheck(sessionId: string): Promise<SessionHealthCheckResult> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    return session.healthCheck();
  }

  /**
   * Perform health check on all active sessions
   */
  async healthCheckAll(): Promise<Map<string, SessionHealthCheckResult>> {
    const results = new Map<string, SessionHealthCheckResult>();

    const activeSessions = this.getSessionsByStatus('active');

    for (const session of activeSessions) {
      try {
        const result = await session.healthCheck();
        results.set(session.getId(), result);
      } catch (error) {
        results.set(session.getId(), {
          healthy: false,
          sessionId: session.getId(),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Reconnect a specific session
   */
  async reconnectSession(sessionId: string): Promise<DriverSessionInfo> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    this.stats.totalReconnectAttempts++;
    const info = await session.reconnect();
    this.stats.successfulReconnections++;
    return info;
  }

  /**
   * Get session statistics
   */
  getStatistics(): SessionStatistics {
    const activeSessions = this.getSessionsByStatus('active');
    const errorSessions = this.getSessionsByStatus('error');

    return {
      totalCreated: this.stats.totalCreated,
      totalDestroyed: this.stats.totalDestroyed,
      activeSessions: activeSessions.length,
      errorSessions: errorSessions.length,
      totalReconnectAttempts: this.stats.totalReconnectAttempts,
      successfulReconnections: this.stats.successfulReconnections,
      averageSessionLifetime: this.calculateAverageLifetime(),
    };
  }

  /**
   * Add a global event listener for all session events
   */
  addEventListener(listener: SessionEventListener): () => void {
    this.globalEventListeners.add(listener);
    return () => this.globalEventListeners.delete(listener);
  }

  /**
   * Remove all global event listeners
   */
  removeAllEventListeners(): void {
    this.globalEventListeners.clear();
  }

  /**
   * Forward session event to global listeners
   */
  private forwardSessionEvent(event: SessionEvent): void {
    for (const listener of this.globalEventListeners) {
      try {
        listener(event);
      } catch (error) {
        this.logger.error('Global event listener error', {
          error,
          eventType: event.type,
          sessionId: event.sessionId,
        });
      }
    }
  }

  /**
   * Record session lifetime for statistics
   */
  private recordSessionLifetime(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      const info = session.getInfo();
      const lifetime = Date.now() - info.createdAt.getTime();
      this.stats.sessionLifetimes.push(lifetime);

      // Keep only last 100 session lifetimes
      if (this.stats.sessionLifetimes.length > 100) {
        this.stats.sessionLifetimes.shift();
      }
    }
  }

  /**
   * Calculate average session lifetime
   */
  private calculateAverageLifetime(): number {
    if (this.stats.sessionLifetimes.length === 0) {
      return 0;
    }

    const sum = this.stats.sessionLifetimes.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.stats.sessionLifetimes.length);
  }

  /**
   * Shutdown the manager and clean up all sessions
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('Shutting down driver session manager');

    await this.deleteAllSessions();
    this.removeAllEventListeners();

    this.logger.info('Driver session manager shutdown complete');
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  setupSignalHandlers(): void {
    const shutdownHandler = async (signal: string) => {
      this.logger.info(`Received ${signal}, shutting down...`);
      await this.shutdown();
      // Don't call process.exit here - let the caller decide
    };

    process.once('SIGINT', () => shutdownHandler('SIGINT'));
    process.once('SIGTERM', () => shutdownHandler('SIGTERM'));
  }
}

/**
 * Default singleton instance
 */
let defaultManager: DriverSessionManager | null = null;

/**
 * Get the default manager instance
 */
export function getSessionManager(logger?: Logger): DriverSessionManager {
  if (!defaultManager) {
    defaultManager = new DriverSessionManager(logger);
    defaultManager.setupSignalHandlers();
  }
  return defaultManager;
}

/**
 * Reset the default manager (useful for testing)
 */
export function resetSessionManager(): void {
  if (defaultManager) {
    defaultManager.shutdown().catch(() => {
      // Ignore errors during reset
    });
    defaultManager = null;
  }
}
