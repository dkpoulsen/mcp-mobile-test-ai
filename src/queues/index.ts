/**
 * Queue system exports - main entry point for the Bull queue functionality
 */

// Type definitions
export type {
  TestJobData,
  TestJobResult,
  JobStatusInfo,
  QueueStats,
  TestJob,
  TestJobOptions,
  QueueEventHandler,
} from './types.js';

export { JobPriority, DEFAULT_RETRY_STRATEGY, QueueEventType } from './types.js';

// Redis connection management
export {
  getRedisClient,
  getRedisSubscriber,
  closeRedisConnections,
  testRedisConnection,
  getRedisConnectionInfo,
} from './redis.js';

// Bull queue configuration and utilities
export {
  createTestQueue,
  createTestWorker,
  addTestJob,
  addTestJobsBulk,
  getQueueStats,
  getJobStatus,
  retryJob,
  cancelJob,
  pauseQueue,
  resumeQueue,
  cleanQueue,
  obliterateQueue,
  closeQueue,
  closeWorker,
} from './bull.js';

// Queue manager service
export {
  getQueueManager,
  initializeQueueManager,
  shutdownQueueManager,
  type QueueManager,
} from './manager.js';
