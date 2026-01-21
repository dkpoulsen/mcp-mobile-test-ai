/**
 * Test Result repository for database operations on TestResult entities
 */

import type {
  TestResult as DbTestResult,
  ResultStatus,
  Prisma,
} from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { Logger } from '../../utils/logger.js';

/**
 * Extended TestResult type with relations
 */
export type TestResultWithRelations = DbTestResult & {
  testRun: {
    id: string;
    status: string;
  };
  testCase: {
    id: string;
    name: string;
  };
};

/**
 * Input type for creating a test result
 */
export type CreateTestResultInput = {
  testRunId: string;
  testCaseId: string;
  status: ResultStatus;
  duration: number;
  errorMessage?: string | null;
  stackTrace?: string | null;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Input type for updating a test result
 */
export type UpdateTestResultInput = Partial<Omit<CreateTestResultInput, 'testRunId' | 'testCaseId'>>;

/**
 * Input type for querying test results
 */
export type TestResultQueryInput = {
  testRunId?: string;
  testCaseId?: string;
  status?: ResultStatus;
  startDate?: Date;
  endDate?: Date;
};

/**
 * Test Result statistics
 */
export type TestResultStats = {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  timeout: number;
  averageDuration: number;
};

/**
 * Test Result repository class
 */
export class TestResultRepository {
  constructor(
    private prisma: PrismaClient,
    private logger?: Logger
  ) {}

  /**
   * Find a test result by ID
   */
  async findById(id: string): Promise<DbTestResult | null> {
    this.logger?.debug(`Finding test result by ID: ${id}`);
    return this.prisma.testResult.findUnique({
      where: { id },
    });
  }

  /**
   * Find a test result by test run ID and test case ID
   */
  async findByTestRunAndTestCase(testRunId: string, testCaseId: string): Promise<DbTestResult | null> {
    return this.prisma.testResult.findUnique({
      where: {
        testRunId_testCaseId: {
          testRunId,
          testCaseId,
        },
      },
    });
  }

  /**
   * Find all test results with optional filtering
   */
  async findMany(query?: TestResultQueryInput): Promise<DbTestResult[]> {
    const where: Prisma.TestResultWhereInput = this.buildWhereClause(query);

    return this.prisma.testResult.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Find test results with relations
   */
  async findManyWithRelations(query?: TestResultQueryInput): Promise<TestResultWithRelations[]> {
    const where: Prisma.TestResultWhereInput = this.buildWhereClause(query);

    return this.prisma.testResult.findMany({
      where,
      include: {
        testRun: {
          select: {
            id: true,
            status: true,
          },
        },
        testCase: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Find test results by test run ID
   */
  async findByTestRunId(testRunId: string): Promise<DbTestResult[]> {
    return this.findMany({ testRunId });
  }

  /**
   * Find test results by test case ID
   */
  async findByTestCaseId(testCaseId: string): Promise<DbTestResult[]> {
    return this.findMany({ testCaseId });
  }

  /**
   * Find failed test results
   */
  async findFailed(testRunId?: string): Promise<DbTestResult[]> {
    return this.findMany({
      ...(testRunId && { testRunId }),
      status: 'FAILED',
    });
  }

  /**
   * Build Prisma where clause from query input
   */
  private buildWhereClause(query?: TestResultQueryInput): Prisma.TestResultWhereInput {
    const where: Prisma.TestResultWhereInput = {};

    if (query?.testRunId) {
      where.testRunId = query.testRunId;
    }
    if (query?.testCaseId) {
      where.testCaseId = query.testCaseId;
    }
    if (query?.status) {
      where.status = query.status;
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
   * Create a new test result
   */
  async create(input: CreateTestResultInput): Promise<DbTestResult> {
    return this.prisma.testResult.create({
      data: input,
    });
  }

  /**
   * Create multiple test results in a batch
   */
  async createMany(input: CreateTestResultInput[]): Promise<{ count: number }> {
    this.logger?.info(`Creating ${input.length} test results`);

    return this.prisma.testResult.createMany({
      data: input,
      skipDuplicates: true,
    });
  }

  /**
   * Update a test result
   */
  async update(id: string, input: UpdateTestResultInput): Promise<DbTestResult> {
    this.logger?.debug(`Updating test result: ${id}`);

    return this.prisma.testResult.update({
      where: { id },
      data: input,
    });
  }

  /**
   * Upsert a test result (create or update)
   */
  async upsert(testRunId: string, testCaseId: string, input: Omit<CreateTestResultInput, 'testRunId' | 'testCaseId'>): Promise<DbTestResult> {
    return this.prisma.testResult.upsert({
      where: {
        testRunId_testCaseId: {
          testRunId,
          testCaseId,
        },
      },
      update: input,
      create: {
        testRunId,
        testCaseId,
        ...input,
      },
    });
  }

  /**
   * Delete a test result
   */
  async delete(id: string): Promise<DbTestResult> {
    this.logger?.info(`Deleting test result: ${id}`);

    return this.prisma.testResult.delete({
      where: { id },
    });
  }

  /**
   * Count test results with optional filtering
   */
  async count(query?: TestResultQueryInput): Promise<number> {
    const where = this.buildWhereClause(query);
    return this.prisma.testResult.count({ where });
  }

  /**
   * Get test result statistics
   */
  async getStats(query?: TestResultQueryInput): Promise<TestResultStats> {
    const where = this.buildWhereClause(query);

    const [total, passed, failed, skipped, timeout, avgDuration] = await Promise.all([
      this.prisma.testResult.count({ where }),
      this.prisma.testResult.count({ where: { ...where, status: 'PASSED' } }),
      this.prisma.testResult.count({ where: { ...where, status: 'FAILED' } }),
      this.prisma.testResult.count({ where: { ...where, status: 'SKIPPED' } }),
      this.prisma.testResult.count({ where: { ...where, status: 'TIMEOUT' } }),
      this.prisma.testResult.aggregate({
        where,
        _avg: { duration: true },
      }),
    ]);

    return {
      total,
      passed,
      failed,
      skipped,
      timeout,
      averageDuration: avgDuration._avg.duration ?? 0,
    };
  }

  /**
   * Get historical pass rate for a test case
   */
  async getTestCasePassRate(testCaseId: string, days: number = 30): Promise<{
    total: number;
    passed: number;
    passRate: number;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const where: Prisma.TestResultWhereInput = {
      testCaseId,
      createdAt: { gte: startDate },
    };

    const [total, passed] = await Promise.all([
      this.prisma.testResult.count({ where }),
      this.prisma.testResult.count({ where: { ...where, status: 'PASSED' } }),
    ]);

    return {
      total,
      passed,
      passRate: total > 0 ? (passed / total) * 100 : 0,
    };
  }
}
