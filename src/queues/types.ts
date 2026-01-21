/**
 * Type definitions for the Bull job queue system
 */

import type { Job, JobOptions } from 'bull';

/**
 * Test execution job data structure
 */
export interface TestJobData {
  /** Test run ID from database */
  testRunId: string;
  /** Test suite ID */
  testSuiteId: string;
  /** Device ID to run tests on */
  deviceId: string;
  /** Optional priority override (1-10, higher = more important) */
  priority?: number;
  /** Number of retries already attempted */
  retryCount?: number;
  /** Custom timeout for this job in milliseconds */
  timeout?: number;
  /** Optional scheduled start time (timestamp) */
  scheduledAt?: number;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Test execution job result
 */
export interface TestJobResult {
  /** Whether the job completed successfully */
  success: boolean;
  /** Test run ID */
  testRunId: string;
  /** Number of tests passed */
  passedCount: number;
  /** Number of tests failed */
  failedCount: number;
  /** Number of tests skipped */
  skippedCount: number;
  /** Total execution duration in milliseconds */
  totalDuration: number;
  /** Error message if job failed */
  errorMessage?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Job status information
 */
export interface JobStatusInfo {
  /** Job ID */
  id: string;
  /** Job name/type */
  name: string;
  /** Job data */
  data: TestJobData;
  /** Job progress (0-100) */
  progress: number;
  /** Current attempt number */
  attemptsMade: number;
  /** Whether job is active */
  isActive: boolean;
  /** Whether job is completed */
  isCompleted: boolean;
  /** Whether job is failed */
  isFailed: number | null;
  /** Processing timestamp */
  processedOn?: number;
  /** Completion timestamp */
  finishedOn?: number;
  /** Failure reason if failed */
  failedReason?: string;
  /** Stack trace if failed */
  stacktrace?: string[];
  /** Priority */
  priority: number;
  /** Number of remaining retries */
  retriesLeft: number;
}

/**
 * Queue statistics
 */
export interface QueueStats {
  /** Number of waiting jobs */
  waiting: number;
  /** Number of active jobs */
  active: number;
  /** Number of completed jobs */
  completed: number;
  /** Number of failed jobs */
  failed: number;
  /** Number of delayed jobs */
  delayed: number;
  /** Number of paused jobs */
  paused: number;
}

/**
 * Bull job with our typed data
 * Extended with progress update method
 */
export type TestJob = Job<TestJobData> & {
  updateProgress(progress: number): Promise<void>;
};

/**
 * Bull job options with our typed data
 */
export type TestJobOptions = JobOptions;

/**
 * Queue event types
 */
export enum QueueEventType {
  ERROR = 'error',
  WAITING = 'waiting',
  ACTIVE = 'active',
  STALLED = 'stalled',
  PROGRESS = 'progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused',
  RESUMED = 'resumed',
  CLEANED = 'cleaned',
  REMOVED = 'removed',
}

/**
 * Queue event handler type
 */
export type QueueEventHandler = (job: TestJob | string, result?: unknown) => void | Promise<void>;

/**
 * Job priority levels
 */
export enum JobPriority {
  LOW = 1,
  BELOW_NORMAL = 3,
  NORMAL = 5,
  ABOVE_NORMAL = 7,
  HIGH = 9,
  CRITICAL = 10,
}

/**
 * Job retry strategies
 */
export interface RetryStrategy {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial delay in milliseconds */
  initialDelay: number;
  /** Backoff type */
  backoffType: 'fixed' | 'exponential';
  /** Maximum delay for exponential backoff */
  maxDelay?: number;
}

/**
 * Default retry strategy
 */
export const DEFAULT_RETRY_STRATEGY: RetryStrategy = {
  maxRetries: 3,
  initialDelay: 5000,
  backoffType: 'exponential',
  maxDelay: 60000,
};
