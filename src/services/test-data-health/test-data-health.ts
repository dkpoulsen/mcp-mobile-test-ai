/**
 * Test Data Health Service
 * Detects stale, corrupted, or orphaned test data and triggers regeneration
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unused-vars */

import type { PrismaClient } from '@prisma/client';
import type {
  DataHealthStatus,
  DataHealthResult,
  DataIssue,
  DatabaseHealthResult,
  HealthCheckConfig,
  RegenerationConfig,
  RegenerationResult,
  RegenerationProgress,
} from './types.js';
import { DataHealthStatus as HealthStatus, IssueType } from './types.js';
import { PrismaSchemaAnalyzer } from './prisma-schema-analyzer.js';
import { TestDataGenerator } from '../test-data-generator/test-data-generator.js';
import { createModuleLogger } from '../../utils/logger.js';
import type { Logger } from '../../utils/logger.js';
import { randomUUID } from 'node:crypto';

/**
 * Default configuration for health checks
 */
const DEFAULT_CONFIG: Required<Omit<HealthCheckConfig, 'customChecks'>> = {
  maxDataAge: 24 * 60 * 60 * 1000, // 24 hours
  checkForeignKeys: true,
  checkOrphans: true,
  validateConstraints: true,
  skipModels: [],
};

/**
 * Test Data Health Service
 *
 * Automatically detects when test data becomes stale or corrupted,
 * generates fresh test data matching required schemas, and resets
 * test databases to known good states.
 */
export class TestDataHealthService {
  private readonly logger: Logger;
  private readonly analyzer: PrismaSchemaAnalyzer;
  private readonly generator: TestDataGenerator;
  private readonly config: Required<HealthCheckConfig>;

  constructor(
    prisma: PrismaClient,
    config?: HealthCheckConfig
  ) {
    this.logger = createModuleLogger('services:test-data-health');
    this.analyzer = new PrismaSchemaAnalyzer(prisma);
    this.generator = new TestDataGenerator();
    this.config = {
      maxDataAge: config?.maxDataAge ?? DEFAULT_CONFIG.maxDataAge,
      checkForeignKeys: config?.checkForeignKeys ?? DEFAULT_CONFIG.checkForeignKeys,
      checkOrphans: config?.checkOrphans ?? DEFAULT_CONFIG.checkOrphans,
      validateConstraints: config?.validateConstraints ?? DEFAULT_CONFIG.validateConstraints,
      skipModels: config?.skipModels ?? DEFAULT_CONFIG.skipModels,
      customChecks: config?.customChecks ?? {},
    };
  }

  /**
   * Perform a full health check on the test database
   */
  async checkHealth(): Promise<DatabaseHealthResult> {
    const startTime = Date.now();
    const modelResults = new Map<string, DataHealthResult>();
    let totalIssues = 0;
    let needsRegeneration = false;

    this.logger.info('Starting test data health check');

    const models = this.analyzer.getModelNames();
    const modelsToCheck = models.filter((m) => !this.config.skipModels.includes(m));

    for (const model of modelsToCheck) {
      try {
        const result = await this.checkModelHealth(model);
        modelResults.set(model, result);
        totalIssues += result.unhealthyCount;
        if (result.needsRegeneration) {
          needsRegeneration = true;
        }
      } catch (error) {
        this.logger.error('Health check failed for model', {
          model,
          error: error instanceof Error ? error.message : String(error),
        });
        // Create a failed health result
        modelResults.set(model, {
          model,
          status: HealthStatus.CORRUPTED,
          recordCount: 0,
          unhealthyCount: 1,
          issues: [{
            type: IssueType.DB_ERROR,
            description: `Health check failed: ${String(error)}`,
          }],
          needsRegeneration: true,
        });
        needsRegeneration = true;
        totalIssues++;
      }
    }

    // Determine overall status
    let overallStatus: DataHealthStatus = HealthStatus.HEALTHY;
    if (totalIssues > 0) {
      overallStatus = needsRegeneration ? HealthStatus.CORRUPTED : HealthStatus.STALE;
    }

    const duration = Date.now() - startTime;

    this.logger.info('Health check completed', {
      overallStatus,
      totalIssues,
      duration,
    });

    return {
      overallStatus,
      modelResults,
      totalIssues,
      checkedAt: new Date(),
      duration,
      needsRegeneration,
    };
  }

  /**
   * Check health of a specific model
   */
  async checkModelHealth(modelName: string): Promise<DataHealthResult> {
    const issues: DataIssue[] = [];
    const metadata = this.analyzer.getModelMetadata(modelName);

    // Get records from the database
    const prisma = this.analyzer['prisma'];
    const modelKey = modelName.charAt(0).toLowerCase() + modelName.slice(1) as keyof PrismaClient;
    const modelAccessor = (prisma[modelKey] as any);

    if (!modelAccessor || typeof modelAccessor.findMany !== 'function') {
      throw new Error(`Cannot access model: ${modelName}`);
    }

    const records = await modelAccessor.findMany({
      take: 1000, // Limit for health check
      orderBy: metadata.hasCreatedAt ? { createdAt: 'desc' as const } : undefined,
    });

    if (records.length === 0) {
      // Empty table is considered stale (needs data)
      return {
        model: modelName,
        status: HealthStatus.STALE,
        recordCount: 0,
        unhealthyCount: 1,
        issues: [{
          type: IssueType.STALE,
          description: 'No test data found',
        }],
        needsRegeneration: true,
      };
    }

    // Check for stale data
    if (metadata.hasCreatedAt && this.config.maxDataAge) {
      const maxAge = this.config.maxDataAge;
      const now = new Date();
      const oldestRecord = records[records.length - 1]?.createdAt;
      const newestRecord = records[0]?.createdAt;

      if (oldestRecord) {
        const age = now.getTime() - new Date(oldestRecord).getTime();
        if (age > maxAge) {
          issues.push({
            type: IssueType.STALE,
            description: `Test data is older than ${Math.round(maxAge / (60 * 60 * 1000))} hours`,
            recordId: String(records[records.length - 1].id ?? 'unknown'),
          });
        }
      }
    }

    // Validate constraints if enabled
    if (this.config.validateConstraints) {
      for (const record of records) {
        const validation = this.analyzer.validateRecord(modelName, record as Record<string, unknown>);
        issues.push(...validation.issues);
      }
    }

    // Check for orphaned records if enabled
    if (this.config.checkOrphans) {
      const orphanIssues = await this.checkForOrphans(modelName, records);
      issues.push(...orphanIssues);
    }

    // Check for inconsistent states
    const inconsistentIssues = await this.checkForInconsistentState(modelName, records, metadata);
    issues.push(...inconsistentIssues);

    // Run custom checks if defined
    const customCheck = this.config.customChecks[modelName];
    if (customCheck && !customCheck.skipDefault) {
      const customIssues = customCheck.check(records);
      issues.push(...customIssues);
    }

    // Determine status
    let status: DataHealthStatus = HealthStatus.HEALTHY;
    let needsRegeneration = false;

    if (issues.length > 0) {
      const hasStaleOnly = issues.every((i) => i.type === IssueType.STALE);
      const hasOrphans = issues.some((i) => i.type === IssueType.ORPHAN);
      const hasDbError = issues.some((i) => i.type === IssueType.DB_ERROR);

      if (hasDbError) {
        status = HealthStatus.CORRUPTED;
        needsRegeneration = true;
      } else if (hasOrphans) {
        status = HealthStatus.ORPHANED;
        needsRegeneration = true;
      } else if (hasStaleOnly) {
        status = HealthStatus.STALE;
        needsRegeneration = true;
      } else {
        status = HealthStatus.CONSTRAINT_VIOLATED;
        needsRegeneration = true;
      }
    }

    return {
      model: modelName,
      status,
      recordCount: records.length,
      unhealthyCount: issues.length,
      issues,
      oldestRecord: records[records.length - 1]?.createdAt,
      newestRecord: records[0]?.createdAt,
      needsRegeneration,
    };
  }

  /**
   * Check for orphaned records (broken foreign keys)
   */
  private async checkForOrphans(
    modelName: string,
    records: unknown[]
  ): Promise<DataIssue[]> {
    const issues: DataIssue[] = [];
    const fkRelations = this.analyzer.getForeignKeyRelations(modelName);
    const prisma = this.analyzer['prisma'];

    for (const relation of fkRelations) {
      const relatedModelKey = relation.relatedModel.charAt(0).toLowerCase() + relation.relatedModel.slice(1) as keyof PrismaClient;
      const relatedModelAccessor = (prisma[relatedModelKey] as any);

      if (!relatedModelAccessor) continue;

      // Get all valid IDs from the related model
      const relatedRecords = await relatedModelAccessor.findMany({
        select: { id: true },
        take: 10000,
      });

      const validIds = new Set(relatedRecords.map((r: any) => r.id));

      // Check each record for orphaned references
      for (const record of records as any[]) {
        const fkValue = record[relation.field];
        if (fkValue && !validIds.has(fkValue)) {
          issues.push({
            type: IssueType.ORPHAN,
            description: `Orphaned record: ${relation.field} references non-existent ${relation.relatedModel}`,
            field: relation.field,
            recordId: String(record.id ?? 'unknown'),
            actual: fkValue,
          });
        }
      }
    }

    return issues;
  }

  /**
   * Check for inconsistent state
   */
  private async checkForInconsistentState(
    modelName: string,
    records: unknown[],
    metadata: ReturnType<PrismaSchemaAnalyzer['getModelMetadata']>
  ): Promise<DataIssue[]> {
    const issues: DataIssue[] = [];

    // Check TestRun status consistency
    if (modelName === 'TestRun') {
      for (const record of records as any[]) {
        if (record.status === 'COMPLETED' && (!record.startedAt || !record.completedAt)) {
          issues.push({
            type: IssueType.INCONSISTENT_STATE,
            description: 'Completed test run missing timestamps',
            recordId: String(record.id),
          });
        }
        if (record.status === 'RUNNING' && record.completedAt) {
          issues.push({
            type: IssueType.INCONSISTENT_STATE,
            description: 'Running test run has completedAt timestamp',
            recordId: String(record.id),
          });
        }
      }
    }

    // Check TestCase has expectedOutcome
    if (modelName === 'TestCase') {
      for (const record of records as any[]) {
        if (!record.expectedOutcome || record.expectedOutcome.trim() === '') {
          issues.push({
            type: IssueType.INCONSISTENT_STATE,
            description: 'Test case missing expected outcome',
            recordId: String(record.id),
          });
        }
      }
    }

    return issues;
  }

  /**
   * Automatically regenerate test data if needed
   */
  async autoRegenerateIfNeeded(): Promise<RegenerationResult | null> {
    const health = await this.checkHealth();

    if (!health.needsRegeneration) {
      this.logger.info('Test data is healthy, no regeneration needed');
      return null;
    }

    this.logger.warn('Test data needs regeneration', {
      status: health.overallStatus,
      issues: health.totalIssues,
    });

    return this.regenerateData({
      validate: true,
    });
  }

  /**
   * Regenerate test data from scratch
   */
  async regenerateData(config?: RegenerationConfig): Promise<RegenerationResult> {
    const startTime = Date.now();
    const recordsCreated: Record<string, number> = {};
    const errors: Array<{ model: string; error: string }> = [];
    const prisma = this.analyzer['prisma'];

    this.logger.info('Starting test data regeneration');

    // Get models in dependency order (delete in reverse, insert in order)
    const dependencyOrder = this.analyzer.getModelsInDependencyOrder();
    const modelsToRegenerate = config?.models
      ? dependencyOrder.filter((m) => config.models!.includes(m))
      : dependencyOrder.filter((m) => !this.config.skipModels.includes(m));

    const reportProgress = config?.onProgress ?? (() => {});

    // Delete existing data in reverse dependency order
    const deleteOrder = [...modelsToRegenerate].reverse();
    for (const model of deleteOrder) {
      reportProgress({
        currentModel: model,
        completed: 0,
        total: modelsToRegenerate.length * 2,
        operation: 'deleting',
      });

      try {
        const modelKey = model.charAt(0).toLowerCase() + model.slice(1) as keyof PrismaClient;
        const modelAccessor = (prisma[modelKey] as any);

        // Skip preserved records if specified
        let whereClause = {};
        if (config?.preserveRecords?.[model]) {
          whereClause = {
            id: { notIn: config.preserveRecords[model] },
          };
        }

        await modelAccessor.deleteMany({ where: whereClause });
        this.logger.debug(`Deleted existing data from ${model}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to delete from ${model}`, { error: errorMsg });
        errors.push({ model, error: errorMsg });
      }
    }

    // Generate and insert new data in dependency order
    let completed = modelsToRegenerate.length;
    for (const model of modelsToRegenerate) {
      reportProgress({
        currentModel: model,
        completed,
        total: modelsToRegenerate.length * 2,
        operation: 'generating',
      });

      try {
        const count = config?.recordCounts?.[model] ?? this.getDefaultRecordCount(model);
        const created = await this.generateModelData(model, count);
        recordsCreated[model] = created.length;

        this.logger.debug(`Generated ${created.length} records for ${model}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to generate data for ${model}`, { error: errorMsg });
        errors.push({ model, error: errorMsg });
      }

      completed++;
    }

    const duration = Date.now() - startTime;

    this.logger.info('Test data regeneration completed', {
      recordsCreated,
      duration,
      errors: errors.length,
    });

    return {
      success: errors.length === 0,
      recordsCreated,
      errors,
      duration,
      regeneratedAt: new Date(),
    };
  }

  /**
   * Generate data for a specific model based on its schema
   */
  private async generateModelData(modelName: string, count: number): Promise<any[]> {
    const prisma = this.analyzer['prisma'];
    const modelKey = modelName.charAt(0).toLowerCase() + modelName.slice(1) as keyof PrismaClient;
    const modelAccessor = (prisma[modelKey] as any);
    const metadata = this.analyzer.getModelMetadata(modelName);

    const records: any[] = [];

    for (let i = 0; i < count; i++) {
      const data: Record<string, unknown> = {};

      for (const field of metadata.fields) {
        if (field.isId || field.isRelation) continue;
        if (field.hasDefault) continue;
        if (field.name === 'id' && metadata.primaryKeys.includes('id')) continue;

        // Generate value based on field type
        data[field.name] = this.generateFieldValue(field, i);
      }

      // Handle relations by fetching existing related records
      for (const relation of metadata.relations) {
        const relatedModelKey = relation.relatedModel.charAt(0).toLowerCase() + relation.relatedModel.slice(1) as keyof PrismaClient;
        const relatedAccessor = (prisma[relatedModelKey] as any);

        if (!relatedAccessor) continue;

        // Get existing related record or create one
        const relatedRecords = await relatedAccessor.findMany({ take: 1 });
        if (relatedRecords.length > 0) {
          // Find the foreign key field
          const fkField = metadata.fields.find((f) =>
            f.name.toLowerCase() === `${relation.name.toLowerCase()}id` ||
            (relation.relatedModel.toLowerCase() + 'id') === f.name.toLowerCase()
          );
          if (fkField) {
            data[fkField.name] = relatedRecords[0].id;
          }
        }
      }

      try {
        const created = await modelAccessor.create({ data });
        records.push(created);
      } catch (error) {
        this.logger.warn(`Failed to create record for ${modelName}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with next record
      }
    }

    return records;
  }

  /**
   * Generate a value for a field based on its type
   */
  private generateFieldValue(field: ReturnType<PrismaSchemaAnalyzer['getModelMetadata']>['fields'][number], index: number): unknown {
    const type = field.type.toLowerCase();
    const suffix = `_${index}`;

    switch (type) {
      case 'string':
        if (field.name === 'email') return `test${suffix}@example.com`;
        if (field.name === 'name') return `Test Name ${suffix}`;
        if (field.name === 'description') return `Test description ${suffix}`;
        if (field.name === 'reason') return `Test reason ${suffix}`;
        if (field.enumName) return field.enumName; // Will be set below
        return `test_value${suffix}`;

      case 'int':
      case 'integer':
        return index + 1;

      case 'float':
      case 'decimal':
        return (index + 1) * 1.5;

      case 'boolean':
        return index % 2 === 0;

      case 'datetime':
      case 'date':
      case 'time':
        return new Date();

      case 'json':
        return { test: `value${suffix}`, index };

      case 'enum': {
        // For enums, we need to check the specific enum values
        if (field.name === 'platform') return 'ANDROID';
        if (field.name === 'status') {
          if (field.enumName?.includes('Device')) return 'AVAILABLE';
          if (field.enumName?.includes('Run')) return 'COMPLETED';
          if (field.enumName?.includes('Result')) return 'PASSED';
          if (field.enumName?.includes('Flaky')) return 'DETECTED';
          if (field.enumName?.includes('Quarantine')) return 'ACTIVE';
          if (field.enumName?.includes('Notification')) return 'SENT';
          return 'AVAILABLE';
        }
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        return (field.enumName?.split('')?.[0] ?? 'UNKNOWN');
      }

      case 'uuid':
        return randomUUID();

      default:
        return null;
    }
  }

  /**
   * Get default record count for a model
   */
  private getDefaultRecordCount(modelName: string): number {
    const defaults: Record<string, number> = {
      Device: 5,
      TestSuite: 3,
      TestCase: 15,
      TestRun: 10,
      TestResult: 50,
      NotificationRule: 2,
    };

    return defaults[modelName] ?? 5;
  }

  /**
   * Reset database to clean state (no data)
   */
  async resetToClean(): Promise<void> {
    const prisma = this.analyzer['prisma'];
    const models = this.analyzer.getModelsInDependencyOrder();

    this.logger.info('Resetting database to clean state');

    // Delete in reverse dependency order
    for (const model of [...models].reverse()) {
      if (this.config.skipModels.includes(model)) continue;

      const modelKey = model.charAt(0).toLowerCase() + model.slice(1) as keyof PrismaClient;
      const modelAccessor = (prisma[modelKey] as any);

      try {
        await modelAccessor.deleteMany({});
        this.logger.debug(`Cleared ${model}`);
      } catch (error) {
        this.logger.warn(`Failed to clear ${model}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.info('Database reset to clean state');
  }

  /**
   * Get the Prisma schema analyzer
   */
  getAnalyzer(): PrismaSchemaAnalyzer {
    return this.analyzer;
  }
}
