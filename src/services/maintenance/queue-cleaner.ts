/**
 * Queue cleanup service
 * Cleans up old completed and failed jobs from Bull queues
 */

import { createModuleLogger } from '../../utils/logger.js';
import { createTestQueue } from '../../queues/bull.js';
import { MaintenanceTaskType } from './types.js';
import type { MaintenanceTaskResult, QueueCleanupConfig } from './types.js';

const logger = createModuleLogger('queue-cleaner');

/**
 * Queue cleaner class
 */
export class QueueCleaner {
  private config: QueueCleanupConfig;

  constructor(config: QueueCleanupConfig) {
    this.config = config;
  }

  /**
   * Run queue cleanup
   */
  async cleanup(): Promise<MaintenanceTaskResult> {
    const startedAt = new Date();
    let itemsProcessed = 0;
    let itemsDeleted = 0;
    let spaceFreed = 0;
    let errorMessage: string | undefined;

    logger.info('Starting queue cleanup');

    try {
      const queue = createTestQueue();

      // Clean completed jobs
      const completedResult = await this.cleanupCompletedJobs(queue);
      itemsProcessed += completedResult.itemsProcessed;
      itemsDeleted += completedResult.itemsDeleted;

      // Clean failed jobs
      const failedResult = await this.cleanupFailedJobs(queue);
      itemsProcessed += failedResult.itemsProcessed;
      itemsDeleted += failedResult.itemsDeleted;

      // Get queue stats
      const stats = await queue.getJobCounts();
      await queue.close();

      const completedAt = new Date();
      const duration = completedAt.getTime() - startedAt.getTime();

      logger.info(
        {
          itemsProcessed,
          itemsDeleted,
          duration,
          remainingJobs: stats,
        },
        'Queue cleanup completed'
      );

      return {
        taskType: MaintenanceTaskType.QUEUE_CLEANUP,
        success: true,
        startedAt,
        completedAt,
        duration,
        itemsProcessed,
        itemsDeleted,
        spaceFreed,
        metadata: {
          completedJobsRemoved: completedResult.itemsDeleted,
          failedJobsRemoved: failedResult.itemsDeleted,
          remainingJobs: stats,
        },
      };
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);

      logger.error({ error: errorMessage }, 'Queue cleanup failed');

      return {
        taskType: MaintenanceTaskType.QUEUE_CLEANUP,
        success: false,
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
        itemsProcessed,
        itemsDeleted,
        spaceFreed,
        error: errorMessage,
      };
    }
  }

  /**
   * Clean up completed jobs
   */
  private async cleanupCompletedJobs(queue: unknown): Promise<{
    itemsProcessed: number;
    itemsDeleted: number;
  }> {
    try {
      // Calculate grace period - older jobs are cleaned first
      const retentionMs = this.config.completedJobRetentionDays * 24 * 60 * 60 * 1000;
      const grace = retentionMs;

      // Get count before cleanup
      const completedCountBefore = await (queue as any).getCompletedCount();

      // Clean old completed jobs
      // Use the larger of retention days or max count limit
      const limit = Math.max(0, completedCountBefore - this.config.maxCompletedJobs);

      const cleaned = await (queue as any).clean(grace, limit, 'completed');

      const itemsDeleted = cleaned.length;
      const itemsProcessed = completedCountBefore;

      logger.debug(
        {
          before: completedCountBefore,
          deleted: itemsDeleted,
          retentionDays: this.config.completedJobRetentionDays,
          maxJobs: this.config.maxCompletedJobs,
        },
        'Completed jobs cleanup completed'
      );

      return { itemsProcessed, itemsDeleted };
    } catch (error) {
      logger.error({ error }, 'Failed to cleanup completed jobs');
      return { itemsProcessed: 0, itemsDeleted: 0 };
    }
  }

  /**
   * Clean up failed jobs
   */
  private async cleanupFailedJobs(queue: unknown): Promise<{
    itemsProcessed: number;
    itemsDeleted: number;
  }> {
    try {
      // Calculate grace period
      const retentionMs = this.config.failedJobRetentionDays * 24 * 60 * 60 * 1000;
      const grace = retentionMs;

      // Get count before cleanup
      const failedCountBefore = await (queue as any).getFailedCount();

      // Clean old failed jobs
      const limit = Math.max(0, failedCountBefore - this.config.maxFailedJobs);

      const cleaned = await (queue as any).clean(grace, limit, 'failed');

      const itemsDeleted = cleaned.length;
      const itemsProcessed = failedCountBefore;

      logger.debug(
        {
          before: failedCountBefore,
          deleted: itemsDeleted,
          retentionDays: this.config.failedJobRetentionDays,
          maxJobs: this.config.maxFailedJobs,
        },
        'Failed jobs cleanup completed'
      );

      return { itemsProcessed, itemsDeleted };
    } catch (error) {
      logger.error({ error }, 'Failed to cleanup failed jobs');
      return { itemsProcessed: 0, itemsDeleted: 0 };
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    total: number;
  }> {
    const queue = createTestQueue();

    try {
      const counts = await queue.getJobCounts();
      const total = Object.values(counts).reduce((sum: number, count) => sum + Number(count), 0);

      return {
        waiting: Number(counts.waiting || 0),
        active: Number(counts.active || 0),
        completed: Number(counts.completed || 0),
        failed: Number(counts.failed || 0),
        delayed: Number(counts.delayed || 0),
        total,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get queue stats');
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        total: 0,
      };
    } finally {
      await queue.close();
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<QueueCleanupConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): QueueCleanupConfig {
    return { ...this.config };
  }
}

/**
 * Create a new queue cleaner instance
 */
export function createQueueCleaner(config: QueueCleanupConfig): QueueCleaner {
  return new QueueCleaner(config);
}
