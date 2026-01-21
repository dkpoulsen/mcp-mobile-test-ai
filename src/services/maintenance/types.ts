/**
 * Type definitions for the maintenance service
 * Provides automated scheduling and execution of maintenance tasks
 */

/**
 * Maintenance task status
 */
export enum MaintenanceTaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Maintenance task types
 */
export enum MaintenanceTaskType {
  ARTIFACT_CLEANUP = 'artifact_cleanup',
  SESSION_PRUNING = 'session_pruning',
  DB_OPTIMIZATION = 'db_optimization',
  QUEUE_CLEANUP = 'queue_cleanup',
  ALL = 'all',
}

/**
 * Result of a maintenance task execution
 */
export interface MaintenanceTaskResult {
  /** Task type */
  taskType: MaintenanceTaskType;
  /** Whether the task succeeded */
  success: boolean;
  /** Timestamp when task started */
  startedAt: Date;
  /** Timestamp when task completed */
  completedAt: Date;
  /** Duration in milliseconds */
  duration: number;
  /** Number of items processed */
  itemsProcessed: number;
  /** Number of items deleted */
  itemsDeleted: number;
  /** Size of freed space in bytes */
  spaceFreed: number;
  /** Error message if failed */
  error?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Artifact cleanup configuration
 */
export interface ArtifactCleanupConfig {
  /** Age in days after which artifacts are eligible for cleanup */
  retentionDays: number;
  /** Maximum total size of artifacts in bytes (0 = unlimited) */
  maxSizeBytes: number;
  /** Specific artifact types to clean (empty = all types) */
  artifactTypes: string[];
  /** Paths to search for artifacts */
  artifactPaths: string[];
  /** Whether to clean artifacts from completed test runs only */
  completedRunsOnly: boolean;
  /** Dry run - don't actually delete files */
  dryRun: boolean;
}

/**
 * Session pruning configuration
 */
export interface SessionPruningConfig {
  /** Age in minutes after which idle sessions are pruned */
  idleTimeoutMinutes: number;
  /** Age in minutes after which error sessions are pruned */
  errorTimeoutMinutes: number;
  /** Maximum total sessions allowed (0 = unlimited) */
  maxSessions: number;
  /** Whether to also prune driver sessions */
  pruneDriverSessions: boolean;
  /** Dry run - don't actually prune sessions */
  dryRun: boolean;
}

/**
 * Database optimization configuration
 */
export interface DBOptimizationConfig {
  /** Whether to analyze tables for query optimization */
  analyzeTables: boolean;
  /** Whether to vacuum the database to reclaim space */
  vacuumDatabase: boolean;
  /** Whether to reindex specific indexes */
  reindex: boolean;
  /** Specific tables to optimize (empty = all) */
  tables: string[];
  /** Specific indexes to rebuild (empty = all) */
  indexes: string[];
}

/**
 * Queue cleanup configuration
 */
export interface QueueCleanupConfig {
  /** Age in days after which completed jobs are removed */
  completedJobRetentionDays: number;
  /** Age in days after which failed jobs are removed */
  failedJobRetentionDays: number;
  /** Maximum number of completed jobs to keep */
  maxCompletedJobs: number;
  /** Maximum number of failed jobs to keep */
  maxFailedJobs: number;
}

/**
 * Maintenance service configuration
 */
export interface MaintenanceServiceConfig {
  /** Artifact cleanup configuration */
  artifactCleanup: ArtifactCleanupConfig;
  /** Session pruning configuration */
  sessionPruning: SessionPruningConfig;
  /** Database optimization configuration */
  dbOptimization: DBOptimizationConfig;
  /** Queue cleanup configuration */
  queueCleanup: QueueCleanupConfig;
  /** Maintenance window start hour (0-23) */
  maintenanceWindowStart: number;
  /** Maintenance window end hour (0-23) */
  maintenanceWindowEnd: number;
  /** Whether scheduling is enabled */
  schedulingEnabled: boolean;
  /** Cron expression for maintenance execution */
  maintenanceSchedule: string;
}

/**
 * Usage pattern data for determining optimal maintenance windows
 */
export interface UsagePattern {
  /** Hour of day (0-23) */
  hour: number;
  /** Day of week (0-6, 0 = Sunday) */
  dayOfWeek: number;
  /** Number of test runs during this period */
  testRunCount: number;
  /** Average execution time */
  avgExecutionTime: number;
  /** Timestamp of last data point */
  lastUpdated: Date;
}

/**
 * Maintenance window recommendation
 */
export interface MaintenanceWindowRecommendation {
  /** Recommended start hour */
  startHour: number;
  /** Recommended end hour */
  endHour: number;
  /** Confidence score (0-1) */
  confidence: number;
  /** Reasoning for the recommendation */
  reasoning: string;
}

/**
 * Scheduled maintenance task
 */
export interface ScheduledMaintenanceTask {
  /** Unique task ID */
  id: string;
  /** Task type */
  taskType: MaintenanceTaskType;
  /** Scheduled execution time */
  scheduledAt: Date;
  /** Current status */
  status: MaintenanceTaskStatus;
  /** Task configuration */
  config: unknown;
  /** Created at timestamp */
  createdAt: Date;
  /** Last execution result */
  lastResult?: MaintenanceTaskResult;
}

/**
 * Maintenance statistics
 */
export interface MaintenanceStatistics {
  /** Total number of maintenance runs */
  totalRuns: number;
  /** Number of successful runs */
  successfulRuns: number;
  /** Number of failed runs */
  failedRuns: number;
  /** Total artifacts cleaned */
  totalArtifactsCleaned: number;
  /** Total sessions pruned */
  totalSessionsPruned: number;
  /** Total space freed in bytes */
  totalSpaceFreed: number;
  /** Average execution duration in milliseconds */
  avgExecutionDuration: number;
  /** Last maintenance run timestamp */
  lastRunAt?: Date;
  /** Next scheduled maintenance run timestamp */
  nextRunAt?: Date;
}

/**
 * Maintenance event types
 */
export enum MaintenanceEventType {
  TASK_SCHEDULED = 'task_scheduled',
  TASK_STARTED = 'task_started',
  TASK_COMPLETED = 'task_completed',
  TASK_FAILED = 'task_failed',
  TASK_CANCELLED = 'task_cancelled',
  MAINTENANCE_WINDOW_ENTERED = 'maintenance_window_entered',
  MAINTENANCE_WINDOW_EXITED = 'maintenance_window_exited',
}

/**
 * Maintenance event
 */
export interface MaintenanceEvent {
  /** Event type */
  type: MaintenanceEventType;
  /** Timestamp */
  timestamp: Date;
  /** Task type if applicable */
  taskType?: MaintenanceTaskType;
  /** Event data */
  data?: Record<string, unknown>;
}

/**
 * Maintenance event handler
 */
export type MaintenanceEventHandler = (event: MaintenanceEvent) => void | Promise<void>;
