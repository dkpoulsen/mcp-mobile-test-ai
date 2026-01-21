/**
 * Flaky Test Repository
 * Database operations for FlakyTest entities
 */

import type {
  FlakyTest,
  TestQuarantine,
  FlakyTestHistory,
  FlakyStatus,
  QuarantineStatus,
  Prisma,
} from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { Logger } from '../../utils/logger.js';

/**
 * Extended types with relations
 */
export type FlakyTestWithRelations = FlakyTest & {
  testCase: {
    id: string;
    name: string;
  };
  testSuite: {
    id: string;
    name: string;
  };
  quarantine?: TestQuarantine | null;
};

export type TestQuarantineWithRelations = TestQuarantine & {
  testCase: {
    id: string;
    name: string;
  };
  testSuite: {
    id: string;
    name: string;
  };
  flakyTests?: FlakyTest[];
};

/**
 * Input for creating flaky test
 */
export type CreateFlakyTestInput = {
  testCaseId: string;
  testSuiteId: string;
  flakinessScore: number;
  totalRuns: number;
  passCount: number;
  failCount: number;
  recentPattern: string;
  failureThreshold?: number;
  passThreshold?: number;
  assignedTeam?: string;
};

/**
 * Input for creating quarantine
 */
export type CreateQuarantineInput = {
  testCaseId: string;
  testSuiteId: string;
  reason: string;
  category: 'FLAKY' | 'TIMEOUT' | 'ENVIRONMENT' | 'DEPRECATED' | 'UNDER_REVIEW';
  detectionMethod: string;
  suggestedFixes?: string[];
  assignedTeam?: string;
  requiredPasses?: number;
};

/**
 * Query options for flaky tests
 */
export type FlakyTestQuery = {
  testSuiteId?: string;
  status?: FlakyStatus | FlakyStatus[];
  minFlakinessScore?: number;
  assignedTeam?: string;
  includeQuarantine?: boolean;
};

/**
 * Query options for quarantined tests
 */
export type QuarantineQuery = {
  testSuiteId?: string;
  status?: QuarantineStatus | QuarantineStatus[];
  assignedTeam?: string;
  includeFlakyTests?: boolean;
};

/**
 * Statistics for flaky tests
 */
export type FlakyTestRepoStats = {
  total: number;
  byStatus: Record<FlakyStatus, number>;
  avgFlakinessScore: number;
  quarantined: number;
};

/**
 * Flaky Test Repository class
 */
export class FlakyTestRepository {
  constructor(
    private prisma: PrismaClient,
    private logger?: Logger
  ) {}

  /**
   * Find flaky test by test case ID
   */
  async findByTestCaseId(testCaseId: string): Promise<FlakyTestWithRelations | null> {
    return this.prisma.flakyTest.findUnique({
      where: { testCaseId },
      include: {
        testCase: { select: { id: true, name: true } },
        testSuite: { select: { id: true, name: true } },
        quarantine: true,
      },
    }) as Promise<FlakyTestWithRelations | null>;
  }

  /**
   * Find flaky tests with filters
   */
  async findMany(query?: FlakyTestQuery): Promise<FlakyTestWithRelations[]> {
    const where: Prisma.FlakyTestWhereInput = this.buildWhereClause(query);

    return this.prisma.flakyTest.findMany({
      where,
      include: {
        testCase: { select: { id: true, name: true } },
        testSuite: { select: { id: true, name: true } },
        quarantine: query?.includeQuarantine ? true : false,
      },
      orderBy: [{ flakinessScore: 'desc' }, { updatedAt: 'desc' }],
    }) as Promise<FlakyTestWithRelations[]>;
  }

  /**
   * Find quarantined tests with filters
   */
  async findQuarantined(query?: QuarantineQuery): Promise<TestQuarantineWithRelations[]> {
    const where: Prisma.TestQuarantineWhereInput = {};

    if (query?.testSuiteId) {
      where.testSuiteId = query.testSuiteId;
    }

    if (query?.status) {
      where.status = Array.isArray(query.status) ? { in: query.status } : query.status;
    }

    if (query?.assignedTeam) {
      where.assignedTeam = query.assignedTeam;
    }

    return this.prisma.testQuarantine.findMany({
      where,
      include: {
        testCase: { select: { id: true, name: true } },
        testSuite: { select: { id: true, name: true } },
        flakyTests: query?.includeFlakyTests ? true : false,
      },
      orderBy: { createdAt: 'desc' },
    }) as Promise<TestQuarantineWithRelations[]>;
  }

  /**
   * Create flaky test record
   */
  async create(input: CreateFlakyTestInput): Promise<FlakyTest> {
    this.logger?.info(`Creating flaky test record for testCase: ${input.testCaseId}`);

    return this.prisma.flakyTest.create({
      data: {
        testCaseId: input.testCaseId,
        testSuiteId: input.testSuiteId,
        flakinessScore: input.flakinessScore,
        totalRuns: input.totalRuns,
        passCount: input.passCount,
        failCount: input.failCount,
        recentPattern: input.recentPattern,
        failureThreshold: input.failureThreshold ?? 3,
        passThreshold: input.passThreshold ?? 5,
        assignedTeam: input.assignedTeam,
        status: 'DETECTED',
        lastAnalyzedAt: new Date(),
      },
    });
  }

  /**
   * Update flaky test
   */
  async update(
    id: string,
    data: Partial<Omit<CreateFlakyTestInput, 'testCaseId' | 'testSuiteId'> & {
      status?: FlakyStatus;
      quarantineId?: string | null;
      failurePattern?: unknown;
      suggestedFixes?: unknown;
      lastAnalyzedAt?: Date;
    }>
  ): Promise<FlakyTest> {
    this.logger?.debug(`Updating flaky test: ${id}`);

    return this.prisma.flakyTest.update({
      where: { id },
      data: {
        ...data,
        lastAnalyzedAt: data.lastAnalyzedAt ?? new Date(),
      },
    });
  }

  /**
   * Upsert flaky test
   */
  async upsert(testCaseId: string, input: Omit<CreateFlakyTestInput, 'testCaseId'>): Promise<FlakyTest> {
    return this.prisma.flakyTest.upsert({
      where: { testCaseId },
      update: {
        ...input,
        lastAnalyzedAt: new Date(),
      },
      create: {
        testCaseId,
        ...input,
        status: 'DETECTED',
        lastAnalyzedAt: new Date(),
      },
    });
  }

  /**
   * Create quarantine record
   */
  async createQuarantine(input: CreateQuarantineInput): Promise<TestQuarantine> {
    this.logger?.info(`Creating quarantine for testCase: ${input.testCaseId}`);

    return this.prisma.testQuarantine.create({
      data: {
        testCaseId: input.testCaseId,
        testSuiteId: input.testSuiteId,
        reason: input.reason,
        category: input.category,
        detectionMethod: input.detectionMethod,
        suggestedFixes: input.suggestedFixes ?? [],
        requiredPasses: input.requiredPasses ?? 5,
        assignedTeam: input.assignedTeam,
        status: 'ACTIVE',
      },
    });
  }

  /**
   * Update quarantine
   */
  async updateQuarantine(
    id: string,
    data: Partial<Omit<CreateQuarantineInput, 'testCaseId' | 'testSuiteId'> & {
      status?: QuarantineStatus;
      consecutivePasses?: number;
      reviewedAt?: Date;
      reviewedBy?: string;
    }>
  ): Promise<TestQuarantine> {
    this.logger?.debug(`Updating quarantine: ${id}`);

    return this.prisma.testQuarantine.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete flaky test
   */
  async delete(id: string): Promise<FlakyTest> {
    this.logger?.info(`Deleting flaky test: ${id}`);

    return this.prisma.flakyTest.delete({
      where: { id },
    });
  }

  /**
   * Delete quarantine
   */
  async deleteQuarantine(id: string): Promise<TestQuarantine> {
    this.logger?.info(`Deleting quarantine: ${id}`);

    return this.prisma.testQuarantine.delete({
      where: { id },
    });
  }

  /**
   * Get flaky test statistics
   */
  async getStats(testSuiteId?: string): Promise<FlakyTestRepoStats> {
    const where = testSuiteId ? { testSuiteId } : {};

    const [total, byStatusRaw, avgScore, quarantinedCount] = await Promise.all([
      this.prisma.flakyTest.count({ where }),
      this.prisma.flakyTest.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),
      this.prisma.flakyTest.aggregate({
        where,
        _avg: { flakinessScore: true },
      }),
      this.prisma.testQuarantine.count({
        where: {
          ...where,
          status: 'ACTIVE',
        },
      }),
    ]);

    const byStatus: Record<FlakyStatus, number> = {
      DETECTED: 0,
      MONITORING: 0,
      QUARANTINED: 0,
      STABILIZING: 0,
      STABLE: 0,
      IGNORED: 0,
    };

    for (const item of byStatusRaw) {
      byStatus[item.status as FlakyStatus] = item._count;
    }

    return {
      total,
      byStatus,
      avgFlakinessScore: avgScore._avg.flakinessScore ?? 0,
      quarantined: quarantinedCount,
    };
  }

  /**
   * Create history entry
   */
  async createHistory(data: {
    flakyTestId: string;
    testCaseId: string;
    flakinessScore: number;
    totalRuns: number;
    passCount: number;
    failCount: number;
    recentPattern: string;
    status: FlakyStatus;
    analysisType: string;
    metadata?: unknown;
  }): Promise<FlakyTestHistory> {
    return this.prisma.flakyTestHistory.create({ data });
  }

  /**
   * Get history for a flaky test
   */
  async getHistory(flakyTestId: string, limit = 50): Promise<FlakyTestHistory[]> {
    return this.prisma.flakyTestHistory.findMany({
      where: { flakyTestId },
      orderBy: { analyzedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Build Prisma where clause from query
   */
  private buildWhereClause(query?: FlakyTestQuery): Prisma.FlakyTestWhereInput {
    const where: Prisma.FlakyTestWhereInput = {};

    if (query?.testSuiteId) {
      where.testSuiteId = query.testSuiteId;
    }

    if (query?.status) {
      where.status = Array.isArray(query.status) ? { in: query.status } : query.status;
    }

    if (query?.minFlakinessScore) {
      where.flakinessScore = { gte: query.minFlakinessScore };
    }

    if (query?.assignedTeam) {
      where.assignedTeam = query.assignedTeam;
    }

    return where;
  }
}
