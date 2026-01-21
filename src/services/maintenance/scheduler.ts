/**
 * Maintenance task scheduler
 * Schedules and executes maintenance tasks during off-peak hours
 */

import { randomUUID } from 'node:crypto';
import { createModuleLogger } from '../../utils/logger.js';
import type {
  MaintenanceTaskType,
  MaintenanceTaskStatus,
  MaintenanceTaskResult,
  ScheduledMaintenanceTask,
  MaintenanceServiceConfig,
  MaintenanceEvent,
  MaintenanceEventType,
  MaintenanceEventHandler,
  UsagePattern,
  MaintenanceWindowRecommendation,
} from './types.js';

const logger = createModuleLogger('maintenance-scheduler');

/**
 * Maintenance scheduler class
 */
export class MaintenanceScheduler {
  /** Scheduled tasks */
  private scheduledTasks: Map<string, ScheduledMaintenanceTask> = new Map();

  /** Task execution functions */
  private taskExecutors: Map<MaintenanceTaskType, () => Promise<MaintenanceTaskResult>> = new Map();

  /** Event handlers */
  private eventHandlers: Set<MaintenanceEventHandler> = new Set();

  /** Interval timer for scheduled tasks */
  private scheduleTimer?: NodeJS.Timeout;

  /** Configuration */
  private config: MaintenanceServiceConfig;

  /** Currently running tasks */
  private runningTasks: Set<string> = new Set();

  /** Usage pattern data */
  private usagePatterns: UsagePattern[] = [];

  constructor(config: MaintenanceServiceConfig) {
    this.config = config;
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.scheduleTimer) {
      logger.warn('Scheduler already started');
      return;
    }

    if (!this.config.schedulingEnabled) {
      logger.info('Maintenance scheduling is disabled');
      return;
    }

    // Check every minute for tasks to run
    this.scheduleTimer = setInterval(() => {
      void this.checkAndExecuteTasks();
    }, 60000);

    logger.info('Maintenance scheduler started');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.scheduleTimer) {
      clearInterval(this.scheduleTimer);
      this.scheduleTimer = undefined;
      logger.info('Maintenance scheduler stopped');
    }
  }

  /**
   * Register a task executor function
   */
  registerExecutor(
    taskType: MaintenanceTaskType,
    executor: () => Promise<MaintenanceTaskResult>
  ): void {
    this.taskExecutors.set(taskType, executor);
    logger.debug({ taskType }, 'Task executor registered');
  }

  /**
   * Schedule a maintenance task
   */
  scheduleTask(
    taskType: MaintenanceTaskType,
    scheduledAt: Date,
    config?: unknown
  ): ScheduledMaintenanceTask {
    const task: ScheduledMaintenanceTask = {
      id: randomUUID(),
      taskType,
      scheduledAt,
      status: 'pending' as MaintenanceTaskStatus,
      config: config ?? {},
      createdAt: new Date(),
    };

    this.scheduledTasks.set(task.id, task);

    this.emitEvent({
      type: 'task_scheduled' as MaintenanceEventType,
      timestamp: new Date(),
      taskType,
      data: { taskId: task.id, scheduledAt: task.scheduledAt },
    });

    logger.info(
      { taskId: task.id, taskType, scheduledAt: task.scheduledAt },
      'Maintenance task scheduled'
    );

    return task;
  }

  /**
   * Get a scheduled task by ID
   */
  getTask(taskId: string): ScheduledMaintenanceTask | undefined {
    return this.scheduledTasks.get(taskId);
  }

  /**
   * Get all scheduled tasks
   */
  getAllTasks(): ScheduledMaintenanceTask[] {
    return Array.from(this.scheduledTasks.values());
  }

  /**
   * Get tasks by status
   */
  getTasksByStatus(status: MaintenanceTaskStatus): ScheduledMaintenanceTask[] {
    return Array.from(this.scheduledTasks.values()).filter((t) => t.status === status);
  }

  /**
   * Cancel a scheduled task
   */
  cancelTask(taskId: string): boolean {
    const task = this.scheduledTasks.get(taskId);

    if (!task) {
      return false;
    }

    if (task.status === 'running') {
      logger.warn({ taskId }, 'Cannot cancel running task');
      return false;
    }

    task.status = 'cancelled' as MaintenanceTaskStatus;

    this.emitEvent({
      type: 'task_cancelled' as MaintenanceEventType,
      timestamp: new Date(),
      taskType: task.taskType,
      data: { taskId },
    });

    logger.info({ taskId, taskType: task.taskType }, 'Maintenance task cancelled');

    return true;
  }

  /**
   * Check for and execute pending tasks
   */
  private async checkAndExecuteTasks(): Promise<void> {
    const now = new Date();
    const inMaintenanceWindow = this.isInMaintenanceWindow(now);

    if (inMaintenanceWindow) {
      logger.debug('In maintenance window, checking for tasks to execute');
    }

    for (const [taskId, task] of this.scheduledTasks.entries()) {
      // Skip if not in maintenance window (for auto-scheduled tasks)
      const isAutoScheduled = task.createdAt.getTime() === task.scheduledAt.getTime();
      if (isAutoScheduled && !inMaintenanceWindow) {
        continue;
      }

      // Check if it's time to run the task
      if (task.status === 'pending' && task.scheduledAt <= now) {
        if (this.runningTasks.has(taskId)) {
          continue; // Already running
        }

        // Execute the task
        void this.executeTask(taskId);
      }
    }
  }

  /**
   * Execute a maintenance task
   */
  async executeTask(taskId: string): Promise<MaintenanceTaskResult | null> {
    const task = this.scheduledTasks.get(taskId);

    if (!task) {
      logger.error({ taskId }, 'Task not found');
      return null;
    }

    if (task.status === 'running') {
      logger.warn({ taskId }, 'Task is already running');
      return null;
    }

    const executor = this.taskExecutors.get(task.taskType);

    if (!executor) {
      logger.error({ taskId, taskType: task.taskType }, 'No executor registered for task type');
      return null;
    }

    this.runningTasks.add(taskId);
    task.status = 'running' as MaintenanceTaskStatus;

    this.emitEvent({
      type: 'task_started' as MaintenanceEventType,
      timestamp: new Date(),
      taskType: task.taskType,
      data: { taskId },
    });

    logger.info({ taskId, taskType: task.taskType }, 'Executing maintenance task');

    const startedAt = new Date();

    try {
      const result = await executor();

      task.status = 'completed' as MaintenanceTaskStatus;
      task.lastResult = result;

      this.emitEvent({
        type: 'task_completed' as MaintenanceEventType,
        timestamp: new Date(),
        taskType: task.taskType,
        data: { taskId, result },
      });

      logger.info(
        { taskId, taskType: task.taskType, duration: result.duration, itemsProcessed: result.itemsProcessed },
        'Maintenance task completed'
      );

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      task.status = 'failed' as MaintenanceTaskStatus;
      task.lastResult = {
        taskType: task.taskType,
        success: false,
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
        itemsProcessed: 0,
        itemsDeleted: 0,
        spaceFreed: 0,
        error: errorMessage,
      };

      this.emitEvent({
        type: 'task_failed' as MaintenanceEventType,
        timestamp: new Date(),
        taskType: task.taskType,
        data: { taskId, error: errorMessage },
      });

      logger.error({ taskId, taskType: task.taskType, error: errorMessage }, 'Maintenance task failed');

      return task.lastResult;
    } finally {
      this.runningTasks.delete(taskId);
    }
  }

  /**
   * Check if current time is within maintenance window
   */
  isInMaintenanceWindow(date: Date = new Date()): boolean {
    const hour = date.getHours();
    const { maintenanceWindowStart, maintenanceWindowEnd } = this.config;

    // Handle windows that cross midnight
    if (maintenanceWindowStart <= maintenanceWindowEnd) {
      return hour >= maintenanceWindowStart && hour < maintenanceWindowEnd;
    } else {
      // Window crosses midnight (e.g., 22:00 to 06:00)
      return hour >= maintenanceWindowStart || hour < maintenanceWindowEnd;
    }
  }

  /**
   * Record usage pattern data
   */
  recordUsage(pattern: UsagePattern): void {
    // Update existing pattern or add new one
    const existingIndex = this.usagePatterns.findIndex(
      (p) => p.hour === pattern.hour && p.dayOfWeek === pattern.dayOfWeek
    );

    if (existingIndex >= 0) {
      // Weighted average with new data
      const existing = this.usagePatterns[existingIndex];
      const alpha = 0.3; // Smoothing factor

      this.usagePatterns[existingIndex] = {
        ...existing,
        testRunCount: Math.round(existing.testRunCount * (1 - alpha) + pattern.testRunCount * alpha),
        avgExecutionTime:
          existing.avgExecutionTime * (1 - alpha) + pattern.avgExecutionTime * alpha,
        lastUpdated: pattern.lastUpdated,
      };
    } else {
      this.usagePatterns.push(pattern);
    }

    // Keep only last 7 days of patterns
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);
    this.usagePatterns = this.usagePatterns.filter((p) => p.lastUpdated >= cutoffDate);
  }

  /**
   * Analyze usage patterns and recommend optimal maintenance window
   */
  analyzeUsagePatterns(): MaintenanceWindowRecommendation {
    if (this.usagePatterns.length === 0) {
      // Default recommendation: 2 AM - 6 AM
      return {
        startHour: 2,
        endHour: 6,
        confidence: 0.5,
        reasoning: 'No usage data available, using default off-peak hours',
      };
    }

    // Group by hour and sum test runs
    const hourlyActivity = new Array(24).fill(0);

    for (const pattern of this.usagePatterns) {
      hourlyActivity[pattern.hour] += pattern.testRunCount;
    }

    // Find the window with lowest activity (at least 4 hours)
    let bestStartHour = 0;
    let bestActivity = Infinity;
    let bestWindowDuration = 0;

    for (let start = 0; start < 24; start++) {
      for (let duration = 4; duration <= 8; duration++) {
        let windowActivity = 0;

        for (let h = 0; h < duration; h++) {
          windowActivity += hourlyActivity[(start + h) % 24];
        }

        // Prefer longer windows with lower activity
        const score = windowActivity / duration;

        if (score < bestActivity || (score === bestActivity && duration > bestWindowDuration)) {
          bestActivity = score;
          bestStartHour = start;
          bestWindowDuration = duration;
        }
      }
    }

    // Calculate confidence based on data completeness
    const dataCompleteness = this.usagePatterns.length / (24 * 7); // 24 hours * 7 days
    const confidence = Math.min(0.95, 0.5 + dataCompleteness * 0.45);

    const endHour = (bestStartHour + bestWindowDuration) % 24;

    return {
      startHour: bestStartHour,
      endHour: endHour,
      confidence,
      reasoning: `Based on analysis of ${this.usagePatterns.length} usage patterns. ` +
        `Lowest activity period found from ${bestStartHour}:00 to ${endHour}:00.`,
    };
  }

  /**
   * Register an event handler
   */
  on(eventHandler: MaintenanceEventHandler): void {
    this.eventHandlers.add(eventHandler);
  }

  /**
   * Unregister an event handler
   */
  off(eventHandler: MaintenanceEventHandler): void {
    this.eventHandlers.delete(eventHandler);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MaintenanceServiceConfig>): void {
    this.config = { ...this.config, ...config };
    logger.debug({ config: this.config }, 'Scheduler configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): MaintenanceServiceConfig {
    return { ...this.config };
  }

  /**
   * Emit an event to all registered handlers
   */
  private emitEvent(event: MaintenanceEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        void Promise.resolve(handler(event));
      } catch (error) {
        logger.error({ error }, 'Error in maintenance event handler');
      }
    }
  }

  /**
   * Clean up old completed tasks
   */
  cleanupOldTasks(maxAge: number = 7 * 24 * 60 * 60 * 1000): void {
    const cutoff = new Date(Date.now() - maxAge);

    for (const [taskId, task] of this.scheduledTasks.entries()) {
      if (
        (task.status === 'completed' || task.status === 'cancelled' || task.status === 'failed') &&
        task.lastResult &&
        task.lastResult.completedAt < cutoff
      ) {
        this.scheduledTasks.delete(taskId);
      }
    }

    logger.debug('Cleaned up old maintenance tasks');
  }

  /**
   * Destroy the scheduler
   */
  destroy(): void {
    this.stop();
    this.scheduledTasks.clear();
    this.runningTasks.clear();
    this.eventHandlers.clear();
    this.taskExecutors.clear();
    this.usagePatterns = [];
  }
}

/**
 * Global scheduler instance
 */
let globalScheduler: MaintenanceScheduler | null = null;

/**
 * Get or create the global maintenance scheduler
 */
export function getMaintenanceScheduler(
  config?: MaintenanceServiceConfig
): MaintenanceScheduler {
  if (!globalScheduler && config) {
    globalScheduler = new MaintenanceScheduler(config);
  }

  if (!globalScheduler) {
    throw new Error('MaintenanceScheduler not initialized. Provide config on first call.');
  }

  return globalScheduler;
}

/**
 * Reset the global scheduler
 */
export function resetMaintenanceScheduler(): void {
  if (globalScheduler) {
    globalScheduler.destroy();
    globalScheduler = null;
  }
}
