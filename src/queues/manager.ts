/**
 * Queue Manager - central service for managing test execution queues
 */

import type { Queue, Job } from 'bull';
import { createModuleLogger } from '../utils/logger.js';
import { config } from '../config/env.js';
import {
  createTestQueue,
  addTestJob,
  addTestJobsBulk,
  getQueueStats,
  getJobStatus,
  retryJob,
  cancelJob,
  pauseQueue,
  resumeQueue,
  cleanQueue,
  closeQueue,
} from './bull.js';
import { testRedisConnection, getRedisConnectionInfo } from './redis.js';
import type { TestJobData, QueueStats, JobStatusInfo } from './types.js';

const logger = createModuleLogger('queue-manager');

/**
 * Queue Manager class - singleton pattern for managing the test queue
 */
class QueueManager {
  private queue: Queue<TestJobData> | null = null;
  private isInitialized = false;

  /**
   * Initialize the queue manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('QueueManager already initialized');
      return;
    }

    logger.info(
      {
        queueName: config.QUEUE_NAME,
        redisHost: config.REDIS_HOST,
        redisPort: config.REDIS_PORT,
      },
      'Initializing QueueManager'
    );

    try {
      // Test Redis connection
      const redisConnected = await testRedisConnection();
      if (!redisConnected) {
        throw new Error('Failed to connect to Redis');
      }

      // Create the queue
      this.queue = createTestQueue();
      this.isInitialized = true;

      logger.info('QueueManager initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize QueueManager');
      throw error;
    }
  }

  /**
   * Check if the manager is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.queue !== null;
  }

  /**
   * Get the underlying queue instance
   */
  getQueue(): Queue<TestJobData> {
    if (!this.queue) {
      throw new Error('Queue not initialized. Call initialize() first.');
    }
    return this.queue;
  }

  /**
   * Add a test job to the queue
   */
  async addJob(
    data: TestJobData,
    options?: {
      priority?: number;
      delay?: number;
      jobId?: string;
    }
  ): Promise<Job<TestJobData>> {
    this.ensureInitialized();
    return addTestJob(this.queue!, data, options);
  }

  /**
   * Add multiple test jobs to the queue
   */
  async addJobsBulk(
    jobs: Array<{ data: TestJobData; options?: { priority?: number; delay?: number } }>
  ): Promise<Job<TestJobData>[]> {
    this.ensureInitialized();
    return addTestJobsBulk(this.queue!, jobs);
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<QueueStats> {
    this.ensureInitialized();
    return getQueueStats(this.queue!);
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<JobStatusInfo | null> {
    return getJobStatus(jobId);
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId: string): Promise<Job<TestJobData> | null> {
    return retryJob(jobId);
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    return cancelJob(jobId);
  }

  /**
   * Pause the queue
   */
  async pause(): Promise<void> {
    this.ensureInitialized();
    await pauseQueue(this.queue!);
  }

  /**
   * Resume the queue
   */
  async resume(): Promise<void> {
    this.ensureInitialized();
    await resumeQueue(this.queue!);
  }

  /**
   * Clean old completed/failed jobs
   */
  async cleanOldJobs(
    grace: number,
    limit?: number,
    type: 'completed' | 'failed' | 'wait' = 'completed'
  ): Promise<Job<TestJobData>[]> {
    this.ensureInitialized();
    return cleanQueue(this.queue!, grace, limit, type);
  }

  /**
   * Check Redis connection status
   */
  async checkConnection(): Promise<boolean> {
    return testRedisConnection();
  }

  /**
   * Get Redis connection info
   */
  getConnectionInfo(): ReturnType<typeof getRedisConnectionInfo> {
    return getRedisConnectionInfo();
  }

  /**
   * Close the queue and cleanup resources
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized || !this.queue) {
      logger.warn('QueueManager not initialized, nothing to shutdown');
      return;
    }

    logger.info('Shutting down QueueManager');

    try {
      await closeQueue(this.queue);
      this.queue = null;
      this.isInitialized = false;
      logger.info('QueueManager shutdown complete');
    } catch (error) {
      logger.error({ error }, 'Error during QueueManager shutdown');
      throw error;
    }
  }

  /**
   * Ensure the queue is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.queue) {
      throw new Error('QueueManager not initialized. Call initialize() first.');
    }
  }
}

/**
 * Global queue manager instance
 */
let queueManagerInstance: QueueManager | null = null;

/**
 * Get or create the singleton QueueManager instance
 */
export function getQueueManager(): QueueManager {
  if (!queueManagerInstance) {
    queueManagerInstance = new QueueManager();
  }
  return queueManagerInstance;
}

/**
 * Initialize the queue manager (convenience function)
 */
export async function initializeQueueManager(): Promise<QueueManager> {
  const manager = getQueueManager();
  await manager.initialize();
  return manager;
}

/**
 * Shutdown the queue manager (convenience function)
 */
export async function shutdownQueueManager(): Promise<void> {
  if (queueManagerInstance) {
    await queueManagerInstance.shutdown();
    queueManagerInstance = null;
  }
}

// Export types
export type { QueueManager };
export { QueueManager as default };
