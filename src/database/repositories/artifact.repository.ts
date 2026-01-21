/**
 * Artifact repository for database operations on Artifact entities
 */

import type {
  Artifact,
  ArtifactType,
  Prisma,
} from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { Logger } from '../../utils/logger.js';

/**
 * Extended Artifact type with relations
 */
export type ArtifactWithRun = Artifact & {
  testRun: {
    id: string;
  };
};

/**
 * Input type for creating an artifact
 */
export type CreateArtifactInput = {
  testRunId: string;
  type: ArtifactType;
  path: string;
  size?: bigint | null;
  mimeType?: string | null;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Input type for querying artifacts
 */
export type ArtifactQueryInput = {
  testRunId?: string;
  type?: ArtifactType;
  startDate?: Date;
  endDate?: Date;
};

/**
 * Artifact repository class
 */
export class ArtifactRepository {
  constructor(
    private prisma: PrismaClient,
    private logger?: Logger
  ) {}

  /**
   * Find an artifact by ID
   */
  async findById(id: string): Promise<Artifact | null> {
    this.logger?.debug(`Finding artifact by ID: ${id}`);
    return this.prisma.artifact.findUnique({
      where: { id },
    });
  }

  /**
   * Find all artifacts with optional filtering
   */
  async findMany(query?: ArtifactQueryInput): Promise<Artifact[]> {
    const where: Prisma.ArtifactWhereInput = this.buildWhereClause(query);

    return this.prisma.artifact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find artifacts by test run ID
   */
  async findByTestRunId(testRunId: string): Promise<Artifact[]> {
    return this.findMany({ testRunId });
  }

  /**
   * Find artifacts by type
   */
  async findByType(type: ArtifactType, testRunId?: string): Promise<Artifact[]> {
    return this.findMany({
      ...(testRunId && { testRunId }),
      type,
    });
  }

  /**
   * Find log artifacts
   */
  async findLogs(testRunId?: string): Promise<Artifact[]> {
    return this.findByType('LOG', testRunId);
  }

  /**
   * Find screenshot artifacts
   */
  async findScreenshots(testRunId?: string): Promise<Artifact[]> {
    return this.findByType('SCREENSHOT', testRunId);
  }

  /**
   * Find video artifacts
   */
  async findVideos(testRunId?: string): Promise<Artifact[]> {
    return this.findByType('VIDEO', testRunId);
  }

  /**
   * Build Prisma where clause from query input
   */
  private buildWhereClause(query?: ArtifactQueryInput): Prisma.ArtifactWhereInput {
    const where: Prisma.ArtifactWhereInput = {};

    if (query?.testRunId) {
      where.testRunId = query.testRunId;
    }
    if (query?.type) {
      where.type = query.type;
    }
    if (query?.startDate || query?.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = query.startDate;
      }
      if (query.endDate) {
        where.createdAt.lte = query.endDate;
      }
    }

    return where;
  }

  /**
   * Create a new artifact
   */
  async create(input: CreateArtifactInput): Promise<Artifact> {
    this.logger?.debug(`Creating artifact: ${input.type} for run: ${input.testRunId}`);

    return this.prisma.artifact.create({
      data: input,
    });
  }

  /**
   * Create multiple artifacts in a batch
   */
  async createMany(input: CreateArtifactInput[]): Promise<{ count: number }> {
    this.logger?.info(`Creating ${input.length} artifacts`);

    return this.prisma.artifact.createMany({
      data: input,
      skipDuplicates: true,
    });
  }

  /**
   * Delete an artifact
   */
  async delete(id: string): Promise<Artifact> {
    this.logger?.info(`Deleting artifact: ${id}`);

    return this.prisma.artifact.delete({
      where: { id },
    });
  }

  /**
   * Delete all artifacts for a test run
   */
  async deleteByTestRunId(testRunId: string): Promise<{ count: number }> {
    this.logger?.info(`Deleting all artifacts for test run: ${testRunId}`);

    return this.prisma.artifact.deleteMany({
      where: { testRunId },
    });
  }

  /**
   * Count artifacts with optional filtering
   */
  async count(query?: ArtifactQueryInput): Promise<number> {
    const where = this.buildWhereClause(query);
    return this.prisma.artifact.count({ where });
  }

  /**
   * Get total artifact size for a test run
   */
  async getTotalSize(testRunId: string): Promise<bigint> {
    const result = await this.prisma.artifact.aggregate({
      where: { testRunId },
      _sum: { size: true },
    });

    return result._sum.size ?? 0n;
  }

  /**
   * Get total artifact size across all test runs
   */
  async getGlobalSize(): Promise<bigint> {
    const result = await this.prisma.artifact.aggregate({
      _sum: { size: true },
    });

    return result._sum.size ?? 0n;
  }

  /**
   * Delete old artifacts
   */
  async deleteOlderThan(date: Date): Promise<{ count: number }> {
    this.logger?.info(`Deleting artifacts older than: ${date.toISOString()}`);

    return this.prisma.artifact.deleteMany({
      where: {
        createdAt: {
          lt: date,
        },
      },
    });
  }
}
