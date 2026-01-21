/**
 * Artifact cleanup service
 * Cleans up old test artifacts including logs, screenshots, videos, and reports
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { createModuleLogger } from '../../utils/logger.js';
import { getPrismaClient } from '../../database/client.js';
import { MaintenanceTaskType } from './types.js';
import type { MaintenanceTaskResult, ArtifactCleanupConfig } from './types.js';

const logger = createModuleLogger('artifact-cleaner');

/**
 * Artifact cleaner class
 */
export class ArtifactCleaner {
  private config: ArtifactCleanupConfig;

  constructor(config: ArtifactCleanupConfig) {
    this.config = config;
  }

  /**
   * Run artifact cleanup
   */
  async cleanup(): Promise<MaintenanceTaskResult> {
    const startedAt = new Date();
    let itemsProcessed = 0;
    let itemsDeleted = 0;
    let spaceFreed = 0;
    let errorMessage: string | undefined;

    logger.info('Starting artifact cleanup');

    try {
      // Clean database records first
      const dbResult = await this.cleanupDatabaseArtifacts();
      itemsProcessed += dbResult.itemsProcessed;
      itemsDeleted += dbResult.itemsDeleted;
      spaceFreed += dbResult.spaceFreed;

      // Clean filesystem artifacts
      for (const artifactPath of this.config.artifactPaths) {
        try {
          const fsResult = await this.cleanupFilesystemArtifacts(artifactPath);
          itemsProcessed += fsResult.itemsProcessed;
          itemsDeleted += fsResult.itemsDeleted;
          spaceFreed += fsResult.spaceFreed;
        } catch (error) {
          logger.error({ error, path: artifactPath }, 'Failed to cleanup artifacts path');
        }
      }

      const completedAt = new Date();
      const duration = completedAt.getTime() - startedAt.getTime();

      logger.info(
        {
          itemsProcessed,
          itemsDeleted,
          spaceFreed,
          duration,
        },
        'Artifact cleanup completed'
      );

      return {
        taskType: MaintenanceTaskType.ARTIFACT_CLEANUP,
        success: true,
        startedAt,
        completedAt,
        duration,
        itemsProcessed,
        itemsDeleted,
        spaceFreed,
        metadata: {
          dryRun: this.config.dryRun,
          retentionDays: this.config.retentionDays,
          maxSizeBytes: this.config.maxSizeBytes,
        },
      };
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);

      logger.error({ error: errorMessage }, 'Artifact cleanup failed');

      return {
        taskType: MaintenanceTaskType.ARTIFACT_CLEANUP,
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
   * Clean up artifact records from the database
   */
  private async cleanupDatabaseArtifacts(): Promise<{
    itemsProcessed: number;
    itemsDeleted: number;
    spaceFreed: number;
  }> {
    const prisma = getPrismaClient();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    let itemsProcessed = 0;
    let itemsDeleted = 0;
    let spaceFreed = 0;

    try {
      // Build where clause for artifact cleanup
      const where: Record<string, unknown> = {
        createdAt: { lt: cutoffDate },
      };

      // Filter by artifact types if specified
      if (this.config.artifactTypes.length > 0) {
        where.type = { in: this.config.artifactTypes };
      }

      // If only completed runs, filter by test run status
      if (this.config.completedRunsOnly) {
        const completedTestRuns = await prisma.testRun.findMany({
          where: {
            status: { in: ['COMPLETED', 'FAILED', 'CANCELLED'] },
            completedAt: { lt: cutoffDate },
          },
          select: { id: true },
        });

        where.testRunId = {
          in: completedTestRuns.map((tr) => tr.id),
        };
      }

      // Count artifacts to be deleted
      const artifactsToDelete = await prisma.artifact.findMany({
        where,
        select: {
          id: true,
          size: true,
          path: true,
        },
      });

      itemsProcessed = artifactsToDelete.length;

      // Calculate space to be freed
      for (const artifact of artifactsToDelete) {
        if (artifact.size) {
          spaceFreed += Number(artifact.size);
        }
      }

      // Delete artifacts (or simulate if dry run)
      if (!this.config.dryRun && itemsProcessed > 0) {
        await prisma.artifact.deleteMany({ where });
        itemsDeleted = itemsProcessed;

        logger.debug(
          {
            count: itemsDeleted,
            spaceFreed,
          },
          'Deleted artifact records from database'
        );
      } else if (this.config.dryRun) {
        logger.debug(
          {
            count: itemsProcessed,
            spaceFreed,
          },
          'Dry run: would delete artifact records'
        );
      }

      // Also clean up old test runs and related data
      const testRunsWhere = {
        createdAt: { lt: cutoffDate },
        status: { in: ['COMPLETED', 'FAILED', 'CANCELLED'] as const },
      };

      const oldTestRuns = await prisma.testRun.findMany({
        where: testRunsWhere,
        select: { id: true },
      });

      // Clean up old test results
      const testResultsDeleted = await prisma.testResult.deleteMany({
        where: {
          testRunId: { in: oldTestRuns.map((tr) => tr.id) },
          createdAt: { lt: cutoffDate },
        },
      });

      // Clean up old notification logs
      const notificationLogsDeleted = await prisma.notificationLog.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
          status: { in: ['SENT', 'FAILED'] as const },
        },
      });

      logger.debug({
        testResultsDeleted: testResultsDeleted.count,
        notificationLogsDeleted: notificationLogsDeleted.count,
      }, 'Cleaned up old test results and notification logs');

    } catch (error) {
      logger.error({ error }, 'Error cleaning database artifacts');
    }

    return { itemsProcessed, itemsDeleted, spaceFreed };
  }

  /**
   * Clean up artifacts from the filesystem
   */
  private async cleanupFilesystemArtifacts(basePath: string): Promise<{
    itemsProcessed: number;
    itemsDeleted: number;
    spaceFreed: number;
  }> {
    let itemsProcessed = 0;
    let itemsDeleted = 0;
    let spaceFreed = 0;

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

      // Check if path exists
      try {
        await fs.access(basePath);
      } catch {
        logger.debug({ path: basePath }, 'Artifact path does not exist, skipping');
        return { itemsProcessed, itemsDeleted, spaceFreed };
      }

      const entries = await fs.readdir(basePath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(basePath, entry.name);

        if (entry.isDirectory()) {
          // Recursively process subdirectories
          const subResult = await this.cleanupFilesystemArtifacts(fullPath);
          itemsProcessed += subResult.itemsProcessed;
          itemsDeleted += subResult.itemsDeleted;
          spaceFreed += subResult.spaceFreed;

          // Try to remove empty directory
          try {
            const remainingEntries = await fs.readdir(fullPath);
            if (remainingEntries.length === 0 && !this.config.dryRun) {
              await fs.rmdir(fullPath);
            }
          } catch {
            // Directory not empty or error accessing
          }
        } else if (entry.isFile()) {
          itemsProcessed++;

          try {
            const stats = await fs.stat(fullPath);
            const fileDate = stats.mtime;

            // Check if file meets deletion criteria
            const shouldDelete = fileDate < cutoffDate;

            if (shouldDelete) {
              spaceFreed += stats.size;

              if (!this.config.dryRun) {
                await fs.unlink(fullPath);
                itemsDeleted++;
                logger.debug({ path: fullPath, size: stats.size }, 'Deleted artifact file');
              } else {
                logger.debug({ path: fullPath, size: stats.size }, 'Would delete artifact file (dry run)');
              }
            }
          } catch (error) {
            logger.warn({ error, path: fullPath }, 'Error processing artifact file');
          }
        }
      }

      logger.debug(
        {
          path: basePath,
          itemsProcessed,
          itemsDeleted,
          spaceFreed,
        },
        'Filesystem artifact cleanup completed'
      );
    } catch (error) {
      logger.error({ error, path: basePath }, 'Error cleaning filesystem artifacts');
    }

    return { itemsProcessed, itemsDeleted, spaceFreed };
  }

  /**
   * Get current artifact storage statistics
   */
  async getArtifactStats(): Promise<{
    totalCount: number;
    totalSize: number;
    oldestArtifact: Date | null;
    newestArtifact: Date | null;
    byType: Record<string, { count: number; size: number }>;
  }> {
    const prisma = getPrismaClient();

    const artifacts = await prisma.artifact.findMany({
      select: {
        type: true,
        size: true,
        createdAt: true,
      },
    });

    const byType: Record<string, { count: number; size: number }> = {};
    let totalSize = 0;
    let oldestArtifact: Date | null = null;
    let newestArtifact: Date | null = null;

    for (const artifact of artifacts) {
      const size = Number(artifact.size) || 0;
      totalSize += size;

      if (!byType[artifact.type]) {
        byType[artifact.type] = { count: 0, size: 0 };
      }
      byType[artifact.type].count++;
      byType[artifact.type].size += size;

      if (!oldestArtifact || artifact.createdAt < oldestArtifact) {
        oldestArtifact = artifact.createdAt;
      }
      if (!newestArtifact || artifact.createdAt > newestArtifact) {
        newestArtifact = artifact.createdAt;
      }
    }

    return {
      totalCount: artifacts.length,
      totalSize,
      oldestArtifact,
      newestArtifact,
      byType,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ArtifactCleanupConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): ArtifactCleanupConfig {
    return { ...this.config };
  }
}

/**
 * Create a new artifact cleaner instance
 */
export function createArtifactCleaner(config: ArtifactCleanupConfig): ArtifactCleaner {
  return new ArtifactCleaner(config);
}
