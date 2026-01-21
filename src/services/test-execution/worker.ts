/**
 * Test execution worker - manages the Bull worker process
 */

import { createTestWorker, closeWorker } from '../../queues/bull.js';
import { processTestExecution } from './processor.js';
import { config } from '../../config/env.js';
import { createModuleLogger } from '../../utils/logger.js';
import type { Queue } from 'bull';
import type { TestJobData } from '../../queues/types.js';

const logger = createModuleLogger('test-worker');

/**
 * Worker instance cache (actually a Queue with processor in Bull)
 */
let workerInstance: Queue<TestJobData> | null = null;

/**
 * Start the test execution worker
 */
export function startTestWorker(): Queue<TestJobData> {
  if (workerInstance) {
    logger.warn('Worker already started, returning existing instance');
    return workerInstance;
  }

  logger.info(
    {
      concurrency: config.QUEUE_CONCURRENCY,
      queueName: config.QUEUE_NAME,
    },
    'Starting test execution worker'
  );

  workerInstance = createTestWorker(processTestExecution, {
    concurrency: config.QUEUE_CONCURRENCY,
  });

  // Set up additional worker event handlers
  workerInstance.on('ready', () => {
    logger.info('Test execution worker is ready');
  });

  workerInstance.on('error', (error: Error) => {
    logger.error({ error }, 'Worker error occurred');
  });

  return workerInstance;
}

/**
 * Stop the test execution worker
 */
export async function stopTestWorker(): Promise<void> {
  if (!workerInstance) {
    logger.warn('No worker instance to stop');
    return;
  }

  logger.info('Stopping test execution worker');

  try {
    await closeWorker(workerInstance);
    workerInstance = null;
    logger.info('Test execution worker stopped');
  } catch (error) {
    logger.error({ error }, 'Error stopping worker');
    throw error;
  }
}

/**
 * Get the current worker instance
 */
export function getTestWorker(): Queue<TestJobData> | null {
  return workerInstance;
}

/**
 * Check if worker is running
 */
export function isWorkerRunning(): boolean {
  return workerInstance !== null;
}

/**
 * Get worker info for debugging
 */
export function getWorkerInfo(): {
  isRunning: boolean;
  concurrency: number;
  queueName: string;
} | null {
  if (!workerInstance) {
    return null;
  }

  return {
    isRunning: true,
    concurrency: config.QUEUE_CONCURRENCY,
    queueName: config.QUEUE_NAME,
  };
}
