/**
 * Maintenance service - main entry point
 * Automated maintenance tasks for test artifacts, sessions, and database
 */

import { createModuleLogger } from '../../utils/logger.js';
import { config } from '../../config/env.js';
import { MaintenanceScheduler, getMaintenanceScheduler, resetMaintenanceScheduler } from './scheduler.js';
import { ArtifactCleaner, createArtifactCleaner } from './artifact-cleaner.js';
import { SessionPruner, createSessionPruner } from './session-pruner.js';
import { DBOptimizer, createDBOptimizer } from './db-optimizer.js';
import { QueueCleaner, createQueueCleaner } from './queue-cleaner.js';
import type {
  MaintenanceServiceConfig,
  MaintenanceTaskResult,
  MaintenanceTaskType,
  MaintenanceStatistics,
  MaintenanceEvent,
  MaintenanceEventHandler,
  MaintenanceWindowRecommendation,
  UsagePattern,
} from './types.js';

const logger = createModuleLogger('maintenance');

/**
 * Maintenance service class
 */
export class MaintenanceService {
  private scheduler: MaintenanceScheduler;
  private artifactCleaner: ArtifactCleaner;
  private sessionPruner: SessionPruner;
  private dbOptimizer: DBOptimizer;
  private queueCleaner: QueueCleaner;
  private config: MaintenanceServiceConfig;
  private statistics: MaintenanceStatistics;

  constructor(config: MaintenanceServiceConfig) {
    this.config = config;

    // Create scheduler
    this.scheduler = new MaintenanceScheduler(config);

    // Create maintenance task executors
    this.artifactCleaner = createArtifactCleaner(config.artifactCleanup);
    this.sessionPruner = createSessionPruner(config.sessionPruning);
    this.dbOptimizer = createDBOptimizer(config.dbOptimization);
    this.queueCleaner = createQueueCleaner(config.queueCleanup);

    // Initialize statistics
    this.statistics = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      totalArtifactsCleaned: 0,
      totalSessionsPruned: 0,
      totalSpaceFreed: 0,
      avgExecutionDuration: 0,
    };

    // Register executors with scheduler
    this.registerExecutors();

    // Set up event handler to update statistics
    this.scheduler.on(this.handleMaintenanceEvent.bind(this));
  }

  /**
   * Start the maintenance service
   */
  start(): void {
    logger.info('Starting maintenance service');
    this.scheduler.start();

    // Schedule daily maintenance
    this.scheduleDailyMaintenance();
  }

  /**
   * Stop the maintenance service
   */
  stop(): void {
    logger.info('Stopping maintenance service');
    this.scheduler.stop();
  }

  /**
   * Run a specific maintenance task
   */
  async runTask(taskType: MaintenanceTaskType): Promise<MaintenanceTaskResult | null> {
    logger.info({ taskType }, 'Running maintenance task');

    switch (taskType) {
      case 'artifact_cleanup':
        return await this.artifactCleaner.cleanup();
      case 'session_pruning':
        return await this.sessionPruner.prune();
      case 'db_optimization':
        return await this.dbOptimizer.optimize();
      case 'queue_cleanup':
        return await this.queueCleaner.cleanup();
      case 'all':
        return await this.runAllTasks();
      default:
        logger.error({ taskType }, 'Unknown maintenance task type');
        return null;
    }
  }

  /**
   * Run all maintenance tasks
   */
  async runAllTasks(): Promise<MaintenanceTaskResult> {
    const startedAt = new Date();
    const results: MaintenanceTaskResult[] = [];

    logger.info('Running all maintenance tasks');

    // Run each task
    const tasks = [
      () => this.artifactCleaner.cleanup(),
      () => this.sessionPruner.prune(),
      () => this.dbOptimizer.optimize(),
      () => this.queueCleaner.cleanup(),
    ];

    for (const task of tasks) {
      try {
        const result = await task();
        results.push(result);
      } catch (error) {
        logger.error({ error }, 'Maintenance task failed');
      }
    }

    // Aggregate results
    const totalItemsProcessed = results.reduce((sum, r) => sum + r.itemsProcessed, 0);
    const totalItemsDeleted = results.reduce((sum, r) => sum + r.itemsDeleted, 0);
    const totalSpaceFreed = results.reduce((sum, r) => sum + r.spaceFreed, 0);
    const allSucceeded = results.every((r) => r.success);

    const completedAt = new Date();
    const duration = completedAt.getTime() - startedAt.getTime();

    return {
      taskType: MaintenanceTaskType.ALL,
      success: allSucceeded,
      startedAt,
      completedAt,
      duration,
      itemsProcessed: totalItemsProcessed,
      itemsDeleted: totalItemsDeleted,
      spaceFreed: totalSpaceFreed,
      metadata: {
        taskResults: results,
      },
    };
  }

  /**
   * Schedule daily maintenance
   */
  private scheduleDailyMaintenance(): void {
    const now = new Date();
    const [hour, minute] = this.config.maintenanceSchedule.split(' ').slice(0, 2).map(Number).reverse();

    const scheduledTime = new Date(now);
    scheduledTime.setHours(hour, minute, 0, 0);

    // If time has passed today, schedule for tomorrow
    if (scheduledTime <= now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    this.scheduler.scheduleTask(MaintenanceTaskType.ALL, scheduledTime);
    logger.info({ nextRun: scheduledTime }, 'Scheduled daily maintenance');
  }

  /**
   * Record usage pattern for analysis
   */
  recordUsage(pattern: UsagePattern): void {
    this.scheduler.recordUsage(pattern);
  }

  /**
   * Analyze usage patterns and get maintenance window recommendation
   */
  getMaintenanceWindowRecommendation(): MaintenanceWindowRecommendation {
    return this.scheduler.analyzeUsagePatterns();
  }

  /**
   * Update maintenance window based on recommendation
   */
  updateMaintenanceWindow(recommendation: MaintenanceWindowRecommendation): void {
    this.scheduler.updateConfig({
      maintenanceWindowStart: recommendation.startHour,
      maintenanceWindowEnd: recommendation.endHour,
    });

    logger.info(
      { start: recommendation.startHour, end: recommendation.endHour },
      'Updated maintenance window'
    );
  }

  /**
   * Get current statistics
   */
  getStatistics(): MaintenanceStatistics {
    return { ...this.statistics };
  }

  /**
   * Get artifact statistics
   */
  async getArtifactStats() {
    return await this.artifactCleaner.getArtifactStats();
  }

  /**
   * Get session statistics
   */
  async getSessionStats() {
    return await this.sessionPruner.getSessionStats();
  }

  /**
   * Get table statistics
   */
  async getTableStatistics() {
    return await this.dbOptimizer.getTableStatistics();
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    return await this.queueCleaner.getQueueStats();
  }

  /**
   * Get index recommendations
   */
  async getIndexRecommendations() {
    return await this.dbOptimizer.recommendIndexes();
  }

  /**
   * Register event handler
   */
  on(eventHandler: MaintenanceEventHandler): void {
    this.scheduler.on(eventHandler);
  }

  /**
   * Unregister event handler
   */
  off(eventHandler: MaintenanceEventHandler): void {
    this.scheduler.off(eventHandler);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MaintenanceServiceConfig>): void {
    this.config = { ...this.config, ...config };

    // Update sub-components
    if (config.artifactCleanup) {
      this.artifactCleaner.updateConfig(config.artifactCleanup);
    }
    if (config.sessionPruning) {
      this.sessionPruner.updateConfig(config.sessionPruning);
    }
    if (config.dbOptimization) {
      this.dbOptimizer.updateConfig(config.dbOptimization);
    }
    if (config.queueCleanup) {
      this.queueCleaner.updateConfig(config.queueCleanup);
    }

    this.scheduler.updateConfig(config);
  }

  /**
   * Get current configuration
   */
  getConfig(): MaintenanceServiceConfig {
    return { ...this.config };
  }

  /**
   * Register task executors with scheduler
   */
  private registerExecutors(): void {
    this.scheduler.registerExecutor('artifact_cleanup' as MaintenanceTaskType, () =>
      this.artifactCleaner.cleanup()
    );
    this.scheduler.registerExecutor('session_pruning' as MaintenanceTaskType, () =>
      this.sessionPruner.prune()
    );
    this.scheduler.registerExecutor('db_optimization' as MaintenanceTaskType, () =>
      this.dbOptimizer.optimize()
    );
    this.scheduler.registerExecutor('queue_cleanup' as MaintenanceTaskType, () =>
      this.queueCleaner.cleanup()
    );
  }

  /**
   * Handle maintenance events and update statistics
   */
  private handleMaintenanceEvent(event: MaintenanceEvent): void {
    if (event.type === 'task_completed' && event.data?.result) {
      const result = event.data.result as MaintenanceTaskResult;

      this.statistics.totalRuns++;
      this.statistics.totalArtifactsCleaned += result.itemsDeleted;
      this.statistics.totalSpaceFreed += result.spaceFreed;

      if (result.taskType === MaintenanceTaskType.SESSION_PRUNING) {
        this.statistics.totalSessionsPruned += result.itemsDeleted;
      }

      if (result.success) {
        this.statistics.successfulRuns++;
      } else {
        this.statistics.failedRuns++;
      }

      // Update average duration
      const totalDuration = this.statistics.avgExecutionDuration * (this.statistics.totalRuns - 1) + result.duration;
      this.statistics.avgExecutionDuration = totalDuration / this.statistics.totalRuns;

      this.statistics.lastRunAt = result.completedAt;
    }
  }

  /**
   * Destroy the maintenance service
   */
  destroy(): void {
    this.stop();
    this.scheduler.destroy();
  }
}

/**
 * Global maintenance service instance
 */
let globalMaintenanceService: MaintenanceService | null = null;

/**
 * Create maintenance service configuration from environment
 */
function createConfigFromEnv(): MaintenanceServiceConfig {
  return {
    artifactCleanup: {
      retentionDays: config.ARTIFACT_RETENTION_DAYS,
      maxSizeBytes: config.ARTIFACT_MAX_SIZE_MB * 1024 * 1024,
      artifactTypes: [],
      artifactPaths: config.ARTIFACT_PATHS,
      completedRunsOnly: true,
      dryRun: false,
    },
    sessionPruning: {
      idleTimeoutMinutes: config.SESSION_IDLE_TIMEOUT_MINUTES,
      errorTimeoutMinutes: config.SESSION_ERROR_TIMEOUT_MINUTES,
      maxSessions: config.SESSION_MAX_COUNT,
      pruneDriverSessions: true,
      dryRun: false,
    },
    dbOptimization: {
      analyzeTables: config.DB_ANALYZE_ENABLED,
      vacuumDatabase: config.DB_VACUUM_ENABLED,
      reindex: config.DB_REINDEX_ENABLED,
      tables: [],
      indexes: [],
    },
    queueCleanup: {
      completedJobRetentionDays: config.QUEUE_COMPLETED_RETENTION_DAYS,
      failedJobRetentionDays: config.QUEUE_FAILED_RETENTION_DAYS,
      maxCompletedJobs: config.QUEUE_MAX_COMPLETED_JOBS,
      maxFailedJobs: config.QUEUE_MAX_FAILED_JOBS,
    },
    maintenanceWindowStart: config.MAINTENANCE_WINDOW_START,
    maintenanceWindowEnd: config.MAINTENANCE_WINDOW_END,
    schedulingEnabled: config.MAINTENANCE_ENABLED,
    maintenanceSchedule: config.MAINTENANCE_SCHEDULE,
  };
}

/**
 * Get or create the global maintenance service
 */
export function getMaintenanceService(): MaintenanceService {
  if (!globalMaintenanceService) {
    const serviceConfig = createConfigFromEnv();
    globalMaintenanceService = new MaintenanceService(serviceConfig);
  }

  return globalMaintenanceService;
}

/**
 * Reset the global maintenance service
 */
export function resetMaintenanceService(): void {
  if (globalMaintenanceService) {
    globalMaintenanceService.destroy();
    globalMaintenanceService = null;
  }
  resetMaintenanceScheduler();
}

/**
 * Start the maintenance service
 */
export function startMaintenanceService(): MaintenanceService {
  const service = getMaintenanceService();
  service.start();
  return service;
}

/**
 * Stop the maintenance service
 */
export function stopMaintenanceService(): void {
  if (globalMaintenanceService) {
    globalMaintenanceService.stop();
  }
}

// Export types
export type {
  MaintenanceTaskResult,
  MaintenanceServiceConfig,
  MaintenanceStatistics,
  UsagePattern,
  MaintenanceWindowRecommendation,
  MaintenanceEvent,
  MaintenanceEventHandler,
};

// Re-export types from types.ts
export type { ArtifactCleanupConfig } from './types.js';
export type { SessionPruningConfig } from './types.js';
export type { DBOptimizationConfig } from './types.js';
export type { QueueCleanupConfig } from './types.js';

// Export scheduler
export { MaintenanceScheduler, getMaintenanceScheduler };

// Export components
export { ArtifactCleaner, createArtifactCleaner };
export { SessionPruner, createSessionPruner };
export { DBOptimizer, createDBOptimizer };
export { QueueCleaner, createQueueCleaner };

// Export enums from types.ts
export { MaintenanceTaskStatus, MaintenanceTaskType, MaintenanceEventType } from './types.js';
