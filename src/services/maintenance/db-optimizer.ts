/**
 * Database optimization service
 * Optimizes database indexes and reclaims space
 */

import { createModuleLogger } from '../../utils/logger.js';
import { getPrismaClient, type PrismaClient } from '../../database/client.js';
import { MaintenanceTaskType } from './types.js';
import type { MaintenanceTaskResult, DBOptimizationConfig } from './types.js';

const logger = createModuleLogger('db-optimizer');

/**
 * Database optimizer class
 */
export class DBOptimizer {
  private config: DBOptimizationConfig;

  constructor(config: DBOptimizationConfig) {
    this.config = config;
  }

  /**
   * Run database optimization
   */
  async optimize(): Promise<MaintenanceTaskResult> {
    const startedAt = new Date();
    let itemsProcessed = 0;
    let itemsDeleted = 0;
    let spaceFreed = 0;
    let errorMessage: string | undefined;

    const metadata: Record<string, unknown> = {};

    logger.info('Starting database optimization');

    try {
      const prisma = getPrismaClient();

      // Analyze tables
      if (this.config.analyzeTables) {
        const analyzeResult = await this.analyzeTables(prisma);
        itemsProcessed += analyzeResult.itemsProcessed;
        metadata.analyzeTables = analyzeResult;
      }

      // Vacuum database
      if (this.config.vacuumDatabase) {
        const vacuumResult = await this.vacuumDatabase(prisma);
        metadata.vacuumDatabase = vacuumResult;
      }

      // Reindex
      if (this.config.reindex) {
        const reindexResult = await this.reindexDatabase(prisma);
        itemsProcessed += reindexResult.itemsProcessed;
        metadata.reindex = reindexResult;
      }

      // Check index usage
      const indexStats = await this.getIndexStatistics(prisma);
      metadata.indexStatistics = indexStats;

      const completedAt = new Date();
      const duration = completedAt.getTime() - startedAt.getTime();

      logger.info(
        {
          duration,
          metadata,
        },
        'Database optimization completed'
      );

      return {
        taskType: MaintenanceTaskType.DB_OPTIMIZATION,
        success: true,
        startedAt,
        completedAt,
        duration,
        itemsProcessed,
        itemsDeleted,
        spaceFreed,
        metadata,
      };
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);

      logger.error({ error: errorMessage }, 'Database optimization failed');

      return {
        taskType: MaintenanceTaskType.DB_OPTIMIZATION,
        success: false,
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
        itemsProcessed,
        itemsDeleted,
        spaceFreed,
        error: errorMessage,
        metadata,
      };
    }
  }

  /**
   * Analyze tables for query optimization
   */
  private async analyzeTables(prisma: PrismaClient): Promise<{
    itemsProcessed: number;
    tablesAnalyzed: string[];
  }> {
    const tablesToAnalyze = this.config.tables.length > 0
      ? this.config.tables
      : ['Device', 'TestSuite', 'TestCase', 'TestRun', 'TestResult', 'Artifact', 'FailureAnalysis', 'NotificationLog'];

    const tablesAnalyzed: string[] = [];

    for (const table of tablesToAnalyze) {
      try {
        // Use ANALYZE to update statistics
        await prisma.$executeRawUnsafe(`ANALYZE "${table}"`);
        tablesAnalyzed.push(table);
        logger.debug({ table }, 'Analyzed table');
      } catch (error) {
        logger.warn({ error, table }, 'Failed to analyze table');
      }
    }

    logger.info({ tables: tablesAnalyzed }, 'Table analysis completed');

    return {
      itemsProcessed: tablesAnalyzed.length,
      tablesAnalyzed,
    };
  }

  /**
   * Vacuum the database to reclaim space
   */
  private async vacuumDatabase(prisma: PrismaClient): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      // Use VACUUM ANALYZE to reclaim space and update statistics
      // This is a safe operation that doesn't lock the database
      await prisma.$executeRawUnsafe(`VACUUM ANALYZE`);

      logger.info('Database vacuum completed');

      return {
        success: true,
        message: 'Database vacuumed successfully',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Database vacuum failed');

      return {
        success: false,
        message: `Vacuum failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Reindex database indexes
   */
  private async reindexDatabase(prisma: PrismaClient): Promise<{
    itemsProcessed: number;
    indexesRebuilt: string[];
  }> {
    const indexesRebuilt: string[] = [];

    try {
      // Get list of indexes
      const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
        AND indexname NOT LIKE '%_pkey'
      `;

      for (const indexRow of indexes) {
        const indexName = indexRow.indexname;

        // Check if this index should be rebuilt
        if (
          this.config.indexes.length === 0 ||
          this.config.indexes.includes(indexName)
        ) {
          try {
            await prisma.$executeRawUnsafe(`REINDEX INDEX CONCURRENTLY "${indexName}"`);
            indexesRebuilt.push(indexName);
            logger.debug({ index: indexName }, 'Rebuilt index');
          } catch (error) {
            // CONCURRENTLY might not be supported in all cases, try without it
            try {
              await prisma.$executeRawUnsafe(`REINDEX INDEX "${indexName}"`);
              indexesRebuilt.push(indexName);
              logger.debug({ index: indexName }, 'Rebuilt index (non-concurrent)');
            } catch (retryError) {
              logger.warn({ error: retryError, index: indexName }, 'Failed to reindex');
            }
          }
        }
      }

      logger.info({ indexes: indexesRebuilt }, 'Index reindex completed');

    } catch (error) {
      logger.error({ error }, 'Failed to get index list');
    }

    return {
      itemsProcessed: indexesRebuilt.length,
      indexesRebuilt,
    };
  }

  /**
   * Get index usage statistics
   */
  private async getIndexStatistics(prisma: PrismaClient): Promise<{
    totalIndexes: number;
    unusedIndexes: Array<{ name: string; idxScan: bigint }>;
    indexSize: Array<{ name: string; size: string }>;
  }> {
    try {
      // Get index usage statistics
      const indexUsage = await prisma.$queryRaw<
        Array<{ indexrelname: string; idx_scan: bigint }>
      >`
        SELECT
          s.indexrelname as indexrelname,
          s.idx_scan as idx_scan
        FROM pg_stat_user_indexes s
        ORDER BY s.idx_scan ASC
      `;

      const unusedIndexes = indexUsage
        .filter((idx) => idx.idx_scan === BigInt(0))
        .map((idx) => ({
          name: idx.indexrelname,
          idxScan: idx.idx_scan,
        }));

      // Get index sizes
      const indexSizes = await prisma.$queryRaw<
        Array<{ indexname: string; pg_size_pretty: string }>
      >`
        SELECT
          indexname as indexname,
          pg_size_pretty(pg_relation_size(indexrelid)) as pg_size_pretty
        FROM pg_indexes
        JOIN pg_class ON pg_class.relname = pg_indexes.indexname
        JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
        WHERE pg_namespace.nspname = 'public'
        ORDER BY pg_relation_size(indexrelid) DESC
      `;

      return {
        totalIndexes: indexUsage.length,
        unusedIndexes: unusedIndexes.slice(0, 10), // Top 10 unused
        indexSize: indexSizes.map((s) => ({
          name: s.indexname,
          size: s.pg_size_pretty,
        })),
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get index statistics');

      return {
        totalIndexes: 0,
        unusedIndexes: [],
        indexSize: [],
      };
    }
  }

  /**
   * Get table statistics
   */
  async getTableStatistics(): Promise<{
    totalTables: number;
    tableSizes: Array<{ name: string; rows: bigint; size: string }>;
    totalDatabaseSize: string;
  }> {
    const prisma = getPrismaClient();

    try {
      // Get table sizes
      const tableStats = await prisma.$queryRaw<
        Array<{
          tablename: string;
          n_live_tup: bigint;
          pg_size_pretty: string;
        }>
      >`
        SELECT
          s.tablename as tablename,
          s.n_live_tup as n_live_tup,
          pg_size_pretty(pg_relation_size(c.oid)) as pg_size_pretty
        FROM pg_stat_user_tables s
        JOIN pg_class c ON c.relname = s.tablename
        ORDER BY pg_relation_size(c.oid) DESC
      `;

      // Get total database size
      const dbSizeResult = await prisma.$queryRaw<Array<{ pg_size_pretty: string }>>`
        SELECT pg_size_pretty(pg_database_size(current_database())) as pg_size_pretty
      `;

      return {
        totalTables: tableStats.length,
        tableSizes: tableStats.map((t) => ({
          name: t.tablename,
          rows: t.n_live_tup,
          size: t.pg_size_pretty,
        })),
        totalDatabaseSize: dbSizeResult[0]?.pg_size_pretty || 'Unknown',
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get table statistics');

      return {
        totalTables: 0,
        tableSizes: [],
        totalDatabaseSize: 'Unknown',
      };
    }
  }

  /**
   * Check for indexes that should be added based on query patterns
   */
  async recommendIndexes(): Promise<
    Array<{ table: string; column: string; reason: string; priority: 'high' | 'medium' | 'low' }>
  > {
    const recommendations: Array<{
      table: string;
      column: string;
      reason: string;
      priority: 'high' | 'medium' | 'low';
    }> = [];

    const prisma = getPrismaClient();

    try {
      // Check for sequential scans on large tables
      const seqScanStats = await prisma.$queryRaw<
        Array<{
          relname: string;
          seq_scan: bigint;
          idx_scan: bigint;
          n_tup_ins: bigint;
          n_tup_upd: bigint;
          n_tup_del: bigint;
        }>
      >`
        SELECT
          s.relname as relname,
          s.seq_scan as seq_scan,
          s.idx_scan as idx_scan,
          s.n_tup_ins as n_tup_ins,
          s.n_tup_upd as n_tup_upd,
          s.n_tup_del as n_tup_del
        FROM pg_stat_user_tables s
        WHERE s.seq_scan > 100
        ORDER BY s.seq_scan DESC
      `;

      for (const stat of seqScanStats) {
        const totalOps = Number(stat.n_tup_ins) + Number(stat.n_tup_upd) + Number(stat.n_tup_del);
        const seqScanRatio = Number(stat.seq_scan) / (Number(stat.idx_scan) + Number(stat.seq_scan));

        // If sequential scans are dominant and table is large, recommend index
        if (seqScanRatio > 0.5 && totalOps > 1000) {
          recommendations.push({
            table: stat.relname,
            column: '<unknown>',
            reason: `High sequential scan rate (${Math.round(seqScanRatio * 100)}% of scans)`,
            priority: 'medium',
          });
        }
      }

      // Common index recommendations based on schema
      const knownRecommendations = [
        { table: 'TestRun', column: 'completedAt', reason: 'Frequently queried for completed runs', priority: 'high' as const },
        { table: 'TestResult', column: 'createdAt', reason: 'Timestamp-based queries for cleanup', priority: 'medium' as const },
        { table: 'Artifact', column: 'createdAt', reason: 'Timestamp-based cleanup queries', priority: 'medium' as const },
        { table: 'FailureAnalysis', column: 'analyzedAt', reason: 'Analysis timestamp queries', priority: 'low' as const },
      ];

      recommendations.push(...knownRecommendations);

    } catch (error) {
      logger.error({ error }, 'Failed to generate index recommendations');
    }

    return recommendations;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DBOptimizationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): DBOptimizationConfig {
    return { ...this.config };
  }
}

/**
 * Create a new database optimizer instance
 */
export function createDBOptimizer(config: DBOptimizationConfig): DBOptimizer {
  return new DBOptimizer(config);
}
