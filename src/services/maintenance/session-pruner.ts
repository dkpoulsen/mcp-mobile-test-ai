/**
 * Session pruning service
 * Prunes stale device and driver sessions
 */

import { createModuleLogger } from '../../utils/logger.js';
import { getPrismaClient } from '../../database/client.js';
import { getGlobalSessionManager } from '../test-execution/session-manager.js';
import { MaintenanceTaskType } from './types.js';
import type {
  MaintenanceTaskResult,
  SessionPruningConfig,
} from './types.js';

const logger = createModuleLogger('session-pruner');

/**
 * Session pruning result details
 */
interface SessionPruningDetails extends Record<string, unknown> {
  deviceSessionsPruned: number;
  driverSessionsPruned: number;
  devicesReset: number;
}

/**
 * Session pruner class
 */
export class SessionPruner {
  private config: SessionPruningConfig;

  constructor(config: SessionPruningConfig) {
    this.config = config;
  }

  /**
   * Run session pruning
   */
  async prune(): Promise<MaintenanceTaskResult> {
    const startedAt = new Date();
    let itemsProcessed = 0;
    let itemsDeleted = 0;
    let spaceFreed = 0;
    let errorMessage: string | undefined;

    const details: SessionPruningDetails = {
      deviceSessionsPruned: 0,
      driverSessionsPruned: 0,
      devicesReset: 0,
    };

    logger.info('Starting session pruning');

    try {
      // Prune in-memory device sessions
      const deviceSessionResult = await this.pruneDeviceSessions();
      itemsProcessed += deviceSessionResult.itemsProcessed;
      itemsDeleted += deviceSessionResult.itemsDeleted;
      details.deviceSessionsPruned = deviceSessionResult.itemsDeleted;

      // Reset stale device statuses in database
      const deviceResetResult = await this.resetStaleDevices();
      itemsProcessed += deviceResetResult.itemsProcessed;
      details.devicesReset = deviceResetResult.itemsDeleted;

      // Prune driver sessions if enabled
      if (this.config.pruneDriverSessions) {
        const driverSessionResult = await this.pruneDriverSessions();
        itemsProcessed += driverSessionResult.itemsProcessed;
        itemsDeleted += driverSessionResult.itemsDeleted;
        details.driverSessionsPruned = driverSessionResult.itemsDeleted;
      }

      const completedAt = new Date();
      const duration = completedAt.getTime() - startedAt.getTime();

      logger.info(
        {
          itemsProcessed,
          itemsDeleted,
          details,
          duration,
        },
        'Session pruning completed'
      );

      return {
        taskType: MaintenanceTaskType.SESSION_PRUNING,
        success: true,
        startedAt,
        completedAt,
        duration,
        itemsProcessed,
        itemsDeleted,
        spaceFreed,
        metadata: {
          ...details,
          dryRun: this.config.dryRun,
          idleTimeoutMinutes: this.config.idleTimeoutMinutes,
          errorTimeoutMinutes: this.config.errorTimeoutMinutes,
        },
      };
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);

      logger.error({ error: errorMessage }, 'Session pruning failed');

      return {
        taskType: MaintenanceTaskType.SESSION_PRUNING,
        success: false,
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
        itemsProcessed,
        itemsDeleted,
        spaceFreed,
        error: errorMessage,
        metadata: details,
      };
    }
  }

  /**
   * Prune in-memory device sessions
   */
  private async pruneDeviceSessions(): Promise<{
    itemsProcessed: number;
    itemsDeleted: number;
  }> {
    const sessionManager = getGlobalSessionManager();
    const stats = sessionManager.getSessionStats();

    let itemsProcessed = stats.total;
    let itemsDeleted = 0;

    const now = Date.now();
    const sessions = sessionManager.getActiveSessions();

    for (const session of sessions) {
      const idleTime = now - session.lastActivityAt.getTime();
      const idleTimeoutMs = this.config.idleTimeoutMinutes * 60 * 1000;
      const errorTimeoutMs = this.config.errorTimeoutMinutes * 60 * 1000;

      let shouldPrune = false;

      if (session.status === 'error' && idleTime > errorTimeoutMs) {
        shouldPrune = true;
        logger.debug(
          { sessionId: session.sessionId, deviceId: session.deviceId, status: 'error' },
          'Pruning error session'
        );
      } else if (session.status === 'idle' && idleTime > idleTimeoutMs) {
        shouldPrune = true;
        logger.debug(
          { sessionId: session.sessionId, deviceId: session.deviceId, status: 'idle' },
          'Pruning idle session'
        );
      } else if (session.status === 'initializing') {
        // Sessions stuck in initializing state for too long
        const initTimeoutMs = 10 * 60 * 1000; // 10 minutes
        const sessionAge = now - session.createdAt.getTime();
        if (sessionAge > initTimeoutMs) {
          shouldPrune = true;
          logger.debug(
            { sessionId: session.sessionId, deviceId: session.deviceId, status: 'initializing' },
            'Pruning stale initializing session'
          );
        }
      }

      if (shouldPrune && !this.config.dryRun) {
        await sessionManager.terminateSession(session.deviceId);
        itemsDeleted++;
      }
    }

    // Also check total session count
    if (this.config.maxSessions > 0 && stats.total > this.config.maxSessions) {
      const availableSessions = sessionManager.getAvailableSessions();
      const excessCount = stats.total - this.config.maxSessions;

      // Remove oldest available sessions first
      const sortedSessions = availableSessions.sort(
        (a, b) => a.lastActivityAt.getTime() - b.lastActivityAt.getTime()
      );

      for (let i = 0; i < Math.min(excessCount, sortedSessions.length); i++) {
        const session = sortedSessions[i];

        if (!this.config.dryRun) {
          await sessionManager.terminateSession(session.deviceId);
          itemsDeleted++;
        }
      }
    }

    logger.debug(
      {
        itemsProcessed,
        itemsDeleted,
        dryRun: this.config.dryRun,
      },
      'Device session pruning completed'
    );

    return { itemsProcessed, itemsDeleted };
  }

  /**
   * Reset stale device statuses in database
   */
  private async resetStaleDevices(): Promise<{
    itemsProcessed: number;
    itemsDeleted: number;
  }> {
    const prisma = getPrismaClient();
    let itemsProcessed = 0;
    let itemsDeleted = 0;

    const staleThreshold = new Date();
    staleThreshold.setMinutes(staleThreshold.getMinutes() - this.config.idleTimeoutMinutes);

    try {
      // Find devices that have been BUSY for too long
      const staleDevices = await prisma.device.findMany({
        where: {
          status: 'BUSY',
          updatedAt: { lt: staleThreshold },
        },
        select: { id: true, name: true, platform: true },
      });

      itemsProcessed = staleDevices.length;

      if (staleDevices.length > 0) {
        logger.debug(
          {
            count: staleDevices.length,
            devices: staleDevices.map((d) => `${d.platform}:${d.name}`),
          },
          'Found stale devices'
        );

        if (!this.config.dryRun) {
          // Reset devices to AVAILABLE
          const result = await prisma.device.updateMany({
            where: {
              id: { in: staleDevices.map((d) => d.id) },
            },
            data: { status: 'AVAILABLE' },
          });

          itemsDeleted = result.count;

          logger.info(
            { count: itemsDeleted },
            'Reset stale devices to AVAILABLE'
          );
        }
      }

      // Also reset devices that have been OFFLINE but might be available
      // (this is a heuristic - devices might come back online)
      const offlineDevices = await prisma.device.findMany({
        where: {
          status: 'OFFLINE',
          updatedAt: { lt: staleThreshold },
        },
        select: { id: true },
      });

      itemsProcessed += offlineDevices.length;

    } catch (error) {
      logger.error({ error }, 'Error resetting stale devices');
    }

    return { itemsProcessed, itemsDeleted };
  }

  /**
   * Prune driver sessions
   */
  private async pruneDriverSessions(): Promise<{
    itemsProcessed: number;
    itemsDeleted: number;
  }> {
    // This is a placeholder for driver session pruning
    // The actual implementation would depend on the driver-session service
    // which has its own session management

    let itemsProcessed = 0;
    let itemsDeleted = 0;

    try {
      // Import dynamically to avoid circular dependencies
      const { getSessionManager } = await import('../driver-session/index.js');

      const sessionManager = getSessionManager();
      const allSessions = sessionManager.getAllSessions();

      itemsProcessed = allSessions.length;

      const now = Date.now();
      const idleTimeoutMs = this.config.idleTimeoutMinutes * 60 * 1000;
      const errorTimeoutMs = this.config.errorTimeoutMinutes * 60 * 1000;

      for (const sessionInfo of allSessions) {
        const lastActivity = new Date(sessionInfo.createdAt || Date.now());
        const idleTime = now - lastActivity.getTime();

        let shouldPrune = false;

        if (
          (sessionInfo.status === 'idle' && idleTime > idleTimeoutMs) ||
          (sessionInfo.status === 'error' && idleTime > errorTimeoutMs)
        ) {
          shouldPrune = true;
        }

        if (shouldPrune && !this.config.dryRun) {
          try {
            await sessionManager.deleteSession(sessionInfo.sessionId);
            itemsDeleted++;
          } catch (error) {
            logger.warn(
              { error, sessionId: sessionInfo.sessionId },
              'Failed to delete driver session'
            );
          }
        }
      }

      logger.debug(
        {
          itemsProcessed,
          itemsDeleted,
          dryRun: this.config.dryRun,
        },
        'Driver session pruning completed'
      );
    } catch (error) {
      logger.error({ error }, 'Error pruning driver sessions');
    }

    return { itemsProcessed, itemsDeleted };
  }

  /**
   * Get current session statistics
   */
  async getSessionStats(): Promise<{
    deviceSessions: { total: number; active: number; available: number; error: number };
    staleDevices: number;
    estimatedMemoryUsage: number;
  }> {
    const sessionManager = getGlobalSessionManager();
    const deviceSessionStats = sessionManager.getSessionStats();

    const prisma = getPrismaClient();
    const staleThreshold = new Date();
    staleThreshold.setMinutes(staleThreshold.getMinutes() - this.config.idleTimeoutMinutes);

    const staleDevices = await prisma.device.count({
      where: {
        status: 'BUSY',
        updatedAt: { lt: staleThreshold },
      },
    });

    // Rough estimate of memory usage per session
    const avgSessionMemory = 1024 * 1024; // 1 MB per session estimate
    const estimatedMemoryUsage = deviceSessionStats.total * avgSessionMemory;

    return {
      deviceSessions: {
        total: deviceSessionStats.total,
        active: deviceSessionStats.active,
        available: deviceSessionStats.available,
        error: deviceSessionStats.error,
      },
      staleDevices,
      estimatedMemoryUsage,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SessionPruningConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): SessionPruningConfig {
    return { ...this.config };
  }
}

/**
 * Create a new session pruner instance
 */
export function createSessionPruner(config: SessionPruningConfig): SessionPruner {
  return new SessionPruner(config);
}
