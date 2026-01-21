/**
 * Test Run repository for database operations on TestRun entities
 */

import type {
  TestRun,
  RunStatus,
  Prisma,
} from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { Logger } from '../../utils/logger.js';

/**
 * Extended TestRun type with relations
 */
export type TestRunWithRelations = TestRun & {
  testSuite: {
    id: string;
    name: string;
  };
  device: {
    id: string;
    name: string;
    platform: string;
    osVersion: string;
  };
  testResults?: unknown[];
  artifacts?: unknown[];
};

/**
 * Input type for creating a test run
 */
export type CreateTestRunInput = {
  testSuiteId: string;
  deviceId: string;
  status?: RunStatus;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Input type for updating a test run
 */
export type UpdateTestRunInput = {
  status?: RunStatus;
  startedAt?: Date | null;
  completedAt?: Date | null;
  totalDuration?: number | null;
  passedCount?: number;
  failedCount?: number;
  skippedCount?: number;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Input type for querying test runs
 */
export type TestRunQueryInput = {
  testSuiteId?: string;
  deviceId?: string;
  status?: RunStatus;
  startDate?: Date;
  endDate?: Date;
};

/**
 * Summary statistics for test runs
 */
export type TestRunSummary = {
  total: number;
  passed: number;
  failed: number;
  pending: number;
  running: number;
  cancelled: number;
};

/**
 * Test Run repository class
 */
export class TestRunRepository {
  constructor(
    private prisma: PrismaClient,
    private logger?: Logger
  ) {}

  /**
   * Find a test run by ID
   */
  async findById(id: string): Promise<TestRun | null> {
    this.logger?.debug(`Finding test run by ID: ${id}`);
    return this.prisma.testRun.findUnique({
      where: { id },
    });
  }

  /**
   * Find a test run by ID with relations
   */
  async findByIdWithRelations(id: string): Promise<TestRunWithRelations | null> {
    return this.prisma.testRun.findUnique({
      where: { id },
      include: {
        testSuite: {
          select: {
            id: true,
            name: true,
          },
        },
        device: {
          select: {
            id: true,
            name: true,
            platform: true,
            osVersion: true,
          },
        },
        testResults: true,
        artifacts: true,
      },
    });
  }

  /**
   * Find all test runs with optional filtering
   */
  async findMany(query?: TestRunQueryInput, params?: {
    skip?: number;
    take?: number;
  }): Promise<TestRun[]> {
    const where: Prisma.TestRunWhereInput = this.buildWhereClause(query);

    return this.prisma.testRun.findMany({
      where,
      skip: params?.skip,
      take: params?.take,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find test runs with relations
   */
  async findManyWithRelations(query?: TestRunQueryInput, params?: {
    skip?: number;
    take?: number;
  }): Promise<TestRunWithRelations[]> {
    const where: Prisma.TestRunWhereInput = this.buildWhereClause(query);

    return this.prisma.testRun.findMany({
      where,
      skip: params?.skip,
      take: params?.take,
      include: {
        testSuite: {
          select: {
            id: true,
            name: true,
          },
        },
        device: {
          select: {
            id: true,
            name: true,
            platform: true,
            osVersion: true,
          },
        },
        testResults: true,
        artifacts: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Build Prisma where clause from query input
   */
  private buildWhereClause(query?: TestRunQueryInput): Prisma.TestRunWhereInput {
    const where: Prisma.TestRunWhereInput = {};

    if (query?.testSuiteId) {
      where.testSuiteId = query.testSuiteId;
    }
    if (query?.deviceId) {
      where.deviceId = query.deviceId;
    }
    if (query?.status) {
      where.status = query.status;
    }
    if (query?.startDate || query?.endDate) {
      where.startedAt = {};
      if (query.startDate) {
        where.startedAt.gte = query.startDate;
      }
      if (query.endDate) {
        where.startedAt.lte = query.endDate;
      }
    }

    return where;
  }

  /**
   * Find running test runs
   */
  async findRunning(): Promise<TestRun[]> {
    return this.findMany({ status: 'RUNNING' });
  }

  /**
   * Create a new test run
   */
  async create(input: CreateTestRunInput): Promise<TestRun> {
    this.logger?.info(`Creating test run for suite: ${input.testSuiteId}`);

    return this.prisma.testRun.create({
      data: input,
    });
  }

  /**
   * Update a test run
   */
  async update(id: string, input: UpdateTestRunInput): Promise<TestRun> {
    this.logger?.debug(`Updating test run: ${id}`);

    return this.prisma.testRun.update({
      where: { id },
      data: input,
    });
  }

  /**
   * Start a test run
   */
  async start(id: string): Promise<TestRun> {
    return this.update(id, {
      status: 'RUNNING',
      startedAt: new Date(),
    });
  }

  /**
   * Complete a test run
   */
  async complete(id: string, totalDuration: number, passedCount: number, failedCount: number, skippedCount: number): Promise<TestRun> {
    return this.update(id, {
      status: 'COMPLETED',
      completedAt: new Date(),
      totalDuration,
      passedCount,
      failedCount,
      skippedCount,
    });
  }

  /**
   * Fail a test run
   */
  async fail(id: string, errorMessage?: string): Promise<TestRun> {
    return this.update(id, {
      status: 'FAILED',
      completedAt: new Date(),
      metadata: errorMessage ? { error: errorMessage } : undefined,
    });
  }

  /**
   * Cancel a test run
   */
  async cancel(id: string): Promise<TestRun> {
    return this.update(id, {
      status: 'CANCELLED',
      completedAt: new Date(),
    });
  }

  /**
   * Delete a test run
   */
  async delete(id: string): Promise<TestRun> {
    this.logger?.info(`Deleting test run: ${id}`);

    return this.prisma.testRun.delete({
      where: { id },
    });
  }

  /**
   * Count test runs with optional filtering
   */
  async count(query?: TestRunQueryInput): Promise<number> {
    const where = this.buildWhereClause(query);
    return this.prisma.testRun.count({ where });
  }

  /**
   * Get test run summary statistics
   */
  async getSummary(query?: TestRunQueryInput): Promise<TestRunSummary> {
    const where = this.buildWhereClause(query);

    const [total, passed, failed, pending, running, cancelled] = await Promise.all([
      this.prisma.testRun.count({ where }),
      this.prisma.testRun.count({ where: { ...where, status: 'COMPLETED' } }),
      this.prisma.testRun.count({ where: { ...where, status: 'FAILED' } }),
      this.prisma.testRun.count({ where: { ...where, status: 'PENDING' } }),
      this.prisma.testRun.count({ where: { ...where, status: 'RUNNING' } }),
      this.prisma.testRun.count({ where: { ...where, status: 'CANCELLED' } }),
    ]);

    return {
      total,
      passed,
      failed,
      pending,
      running,
      cancelled,
    };
  }

  /**
   * Get historical test run data for trends
   */
  async getHistoricalData(days: number = 30, query?: Omit<TestRunQueryInput, 'startDate' | 'endDate'>): Promise<{
    date: string;
    total: number;
    passed: number;
    failed: number;
  }[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const baseWhere = this.buildWhereClause({ ...query, startDate });

    const runs = await this.prisma.testRun.findMany({
      where: {
        ...baseWhere,
        startedAt: { not: null },
      },
      select: {
        startedAt: true,
        status: true,
      },
    });

    // Group by date
    const grouped = new Map<string, { total: number; passed: number; failed: number }>();

    for (const run of runs) {
      if (!run.startedAt) continue;
      const dateKey = run.startedAt.toISOString().split('T')[0] ?? '';
      const current = grouped.get(dateKey) ?? { total: 0, passed: 0, failed: 0 };
      current.total++;
      if (run.status === 'COMPLETED') current.passed++;
      if (run.status === 'FAILED') current.failed++;
      grouped.set(dateKey, current);
    }

    return Array.from(grouped.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}
