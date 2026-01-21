/**
 * Bull queue configuration and setup
 */

import Bull, { type Job, type Queue } from 'bull';
import { config } from '../config/env.js';
import { closeRedisConnections } from './redis.js';
import type { TestJobData, TestJobResult, TestJob, QueueStats, JobStatusInfo } from './types.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('bull-queue');

/**
 * Create a configured Bull queue
 */
export function createTestQueue(options?: {
  name?: string;
  redisOpts?: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    tls?: Record<string, unknown>;
  };
}): Queue<TestJobData> {
  const queueName = options?.name ?? config.QUEUE_NAME;

  const queue: Queue<TestJobData> = new Bull(queueName, {
    defaultJobOptions: {
      removeOnComplete: config.QUEUE_REMOVE_ON_COMPLETE,
      removeOnFail: config.QUEUE_REMOVE_ON_FAIL,
      attempts: config.QUEUE_MAX_RETRIES,
      backoff: {
        type: config.QUEUE_BACKOFF_TYPE,
        delay: config.QUEUE_RETRY_DELAY,
      },
      timeout: config.QUEUE_JOB_TIMEOUT,
    },
    settings: {
      stalledInterval: 30000,
      maxStalledCount: 1,
    },
    redis: options?.redisOpts ?? {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD,
      db: config.REDIS_DB,
      tls: config.REDIS_TLS ? {} : undefined,
    },
  });

  // Set up queue event logging
  setupQueueEventListeners(queue);

  return queue;
}

/**
 * Set up queue event listeners for logging
 */
function setupQueueEventListeners(queue: Queue<TestJobData>): void {
  queue.on('error', (error: Error) => {
    logger.error({ error }, 'Queue error');
  });

  queue.on('waiting', (jobId: Bull.JobId) => {
    logger.debug({ jobId }, 'Job waiting in queue');
  });

  queue.on('active', (job: Job<TestJobData>) => {
    logger.info(
      {
        jobId: job.id,
        testRunId: job.data.testRunId,
        attempt: job.attemptsMade,
      },
      'Job started processing'
    );
  });

  queue.on('stalled', (job: Job<TestJobData>) => {
    logger.warn({ jobId: job?.id }, 'Job stalled');
  });

  queue.on('completed', (job: Job<TestJobData>) => {
    logger.info(
      {
        jobId: job.id,
        testRunId: job.data.testRunId,
        duration: job.finishedOn ? job.finishedOn - (job.processedOn ?? 0) : null,
      },
      'Job completed successfully'
    );
  });

  queue.on('failed', (job: Job<TestJobData>, error: Error) => {
    logger.error(
      {
        jobId: job?.id,
        testRunId: job?.data.testRunId,
        error: error.message,
        attempt: job?.attemptsMade,
      },
      'Job failed'
    );
  });

  queue.on('paused', () => {
    logger.info('Queue paused');
  });

  queue.on('resumed', () => {
    logger.info('Queue resumed');
  });

  queue.on('cleaned', (jobs: Job<TestJobData>[], type: string) => {
    logger.info({ count: jobs.length, type }, 'Jobs cleaned from queue');
  });
}

/**
 * Create a Bull worker with test execution processor
 * In Bull, workers are queues with processors
 */
export function createTestWorker(
  processor: (job: TestJob) => Promise<TestJobResult>,
  options?: {
    concurrency?: number;
    queueName?: string;
    redisOpts?: {
      host?: string;
      port?: number;
      password?: string;
      db?: number;
      tls?: Record<string, unknown>;
    };
  }
): Queue<TestJobData> {
  const workerQueue = new Bull<TestJobData>(options?.queueName ?? config.QUEUE_NAME, {
    redis: options?.redisOpts ?? {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD,
      db: config.REDIS_DB,
      tls: config.REDIS_TLS ? {} : undefined,
    },
  });

  // Set up the processor with concurrency
  workerQueue.process(options?.concurrency ?? config.QUEUE_CONCURRENCY, processor as (job: Job<TestJobData>) => Promise<unknown>);

  // Set up worker event listeners
  setupWorkerEventListeners(workerQueue);

  return workerQueue;
}

/**
 * Set up worker event listeners for logging
 */
function setupWorkerEventListeners(worker: Queue<TestJobData>): void {
  worker.on('error', (error: Error) => {
    logger.error({ error }, 'Worker error');
  });

  worker.on('active', (job: Job<TestJobData>) => {
    logger.debug(
      {
        jobId: job.id,
        testRunId: job.data.testRunId,
      },
      'Worker processing job'
    );
  });

  worker.on('completed', (job: Job<TestJobData>, result: TestJobResult) => {
    logger.debug(
      {
        jobId: job.id,
        testRunId: job.data.testRunId,
        success: result.success,
      },
      'Worker completed job'
    );
  });

  worker.on('failed', (job: Job<TestJobData>, error: Error) => {
    logger.error(
      {
        jobId: job?.id,
        testRunId: job?.data.testRunId,
        error: error.message,
      },
      'Worker failed to process job'
    );
  });

  worker.on('stalled', (jobId: Bull.JobId) => {
    logger.warn({ jobId }, 'Worker stalled on job');
  });
}

/**
 * Add a test job to the queue
 */
export async function addTestJob(
  queue: Queue<TestJobData>,
  data: TestJobData,
  options?: {
    priority?: number;
    delay?: number;
    jobId?: string;
  }
): Promise<Job<TestJobData>> {
  const jobOptions = {
    priority: data.priority ?? config.QUEUE_DEFAULT_PRIORITY,
    delay: data.scheduledAt ? Math.max(0, data.scheduledAt - Date.now()) : options?.delay,
    jobId: options?.jobId,
    timeout: data.timeout ?? config.QUEUE_JOB_TIMEOUT,
    attempts: config.QUEUE_MAX_RETRIES,
    backoff: {
      type: config.QUEUE_BACKOFF_TYPE,
      delay: config.QUEUE_RETRY_DELAY,
    } as const,
  };

  return queue.add(data, jobOptions);
}

/**
 * Add multiple test jobs to the queue
 */
export async function addTestJobsBulk(
  queue: Queue<TestJobData>,
  jobs: Array<{ data: TestJobData; options?: { priority?: number; delay?: number } }>
): Promise<Job<TestJobData>[]> {
  const bulkJobs = jobs.map((job) => ({
    name: 'test-execution',
    data: job.data,
    opts: {
      priority: job.data.priority ?? config.QUEUE_DEFAULT_PRIORITY,
      delay: job.options?.delay,
      timeout: job.data.timeout ?? config.QUEUE_JOB_TIMEOUT,
      attempts: config.QUEUE_MAX_RETRIES,
      backoff: {
        type: config.QUEUE_BACKOFF_TYPE,
        delay: config.QUEUE_RETRY_DELAY,
      } as const,
    },
  }));

  return queue.addBulk(bulkJobs);
}

/**
 * Get queue statistics
 */
export async function getQueueStats(queue: Queue<TestJobData>): Promise<QueueStats> {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  const isPaused = await queue.isPaused();

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    paused: isPaused ? 1 : 0,
  };
}

/**
 * Get job status information
 */
export async function getJobStatus(jobId: string): Promise<JobStatusInfo | null> {
  const queue = createTestQueue();

  try {
    const job = await queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();

    return {
      id: job.id!.toString(),
      name: job.name,
      data: job.data,
      progress: 0,
      attemptsMade: job.attemptsMade,
      isActive: state === 'active',
      isCompleted: state === 'completed',
      isFailed: state === 'failed' ? 1 : null,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
      priority: job.opts.priority ?? config.QUEUE_DEFAULT_PRIORITY,
      retriesLeft: (job.opts.attempts ?? config.QUEUE_MAX_RETRIES) - job.attemptsMade,
    };
  } finally {
    await queue.close();
  }
}

/**
 * Retry a failed job
 */
export async function retryJob(jobId: string): Promise<Job<TestJobData> | null> {
  const queue = createTestQueue();

  try {
    const job = await queue.getJob(jobId);
    if (!job) return null;

    await job.retry();
    return job;
  } finally {
    await queue.close();
  }
}

/**
 * Cancel a job
 */
export async function cancelJob(jobId: string): Promise<boolean> {
  const queue = createTestQueue();

  try {
    const job = await queue.getJob(jobId);
    if (!job) return false;

    await job.remove();
    return true;
  } finally {
    await queue.close();
  }
}

/**
 * Pause the queue
 */
export async function pauseQueue(queue: Queue<TestJobData>): Promise<void> {
  await queue.pause();
  logger.info('Queue paused');
}

/**
 * Resume the queue
 */
export async function resumeQueue(queue: Queue<TestJobData>): Promise<void> {
  await queue.resume();
  logger.info('Queue resumed');
}

/**
 * Clean old jobs from the queue
 */
export async function cleanQueue(
  queue: Queue<TestJobData>,
  grace: number,
  limit?: number,
  type: 'completed' | 'failed' | 'wait' = 'completed'
): Promise<Job<TestJobData>[]> {
  // Use Bull's clean method with unknown cast to handle parameter order differences
  const cleanFn = queue.clean as unknown as (
    grace: number,
    limit: number,
    type: 'completed' | 'failed' | 'wait'
  ) => Promise<Job<TestJobData>[]>;
  const jobs = await cleanFn(grace, limit ? Math.floor(limit) : 0, type);
  logger.info({ count: jobs.length, type }, 'Cleaned jobs from queue');
  return jobs;
}

/**
 * Obliterate the queue (remove all jobs)
 */
export async function obliterateQueue(queue: Queue<TestJobData>): Promise<void> {
  const cleanFn = queue.clean as unknown as (
    grace: number,
    limit: number,
    type: 'completed' | 'failed' | 'wait'
  ) => Promise<Job<TestJobData>[]>;
  await cleanFn(0, 0, 'completed');
  await cleanFn(0, 0, 'failed');
  await cleanFn(0, 0, 'wait');
  logger.warn('Queue obliterated');
}

/**
 * Close queue and worker connections
 */
export async function closeQueue(queue: Queue<TestJobData>): Promise<void> {
  await queue.close();
  await closeRedisConnections();
  logger.info('Queue connections closed');
}

/**
 * Close worker connection
 */
export async function closeWorker(worker: Queue<TestJobData>): Promise<void> {
  await worker.close();
  logger.info('Worker connection closed');
}
