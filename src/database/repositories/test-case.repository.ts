/**
 * Test Case repository for database operations on TestCase entities
 */

import type {
  TestCase,
  Prisma,
} from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { Logger } from '../../utils/logger.js';

/**
 * Extended TestCase type with relations
 */
export type TestCaseWithSuite = TestCase & {
  testSuite: {
    id: string;
    name: string;
  };
};

export type TestCaseWithResults = TestCase & {
  testResults?: unknown[];
};

/**
 * Input type for creating a test case
 */
export type CreateTestCaseInput = {
  testSuiteId: string;
  name: string;
  description: string;
  expectedOutcome: string;
  timeout?: number | null;
  tags?: string[];
};

/**
 * Input type for updating a test case
 */
export type UpdateTestCaseInput = Partial<Omit<CreateTestCaseInput, 'testSuiteId' | 'name'>>;

/**
 * Input type for querying test cases
 */
export type TestCaseQueryInput = {
  testSuiteId?: string;
  tags?: string[];
};

/**
 * Test Case repository class
 */
export class TestCaseRepository {
  constructor(
    private prisma: PrismaClient,
    private logger?: Logger
  ) {}

  /**
   * Find a test case by ID
   */
  async findById(id: string): Promise<TestCase | null> {
    this.logger?.debug(`Finding test case by ID: ${id}`);
    return this.prisma.testCase.findUnique({
      where: { id },
    });
  }

  /**
   * Find a test case by ID with test suite
   */
  async findByIdWithSuite(id: string): Promise<TestCaseWithSuite | null> {
    return this.prisma.testCase.findUnique({
      where: { id },
      include: {
        testSuite: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Find all test cases with optional filtering
   */
  async findMany(query?: TestCaseQueryInput): Promise<TestCase[]> {
    const where: Prisma.TestCaseWhereInput = {};

    if (query?.testSuiteId) {
      where.testSuiteId = query.testSuiteId;
    }
    if (query?.tags && query.tags.length > 0) {
      where.tags = {
        hasSome: query.tags,
      };
    }

    return this.prisma.testCase.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Find test cases by test suite ID
   */
  async findByTestSuiteId(testSuiteId: string): Promise<TestCase[]> {
    return this.findMany({ testSuiteId });
  }

  /**
   * Create a new test case
   */
  async create(input: CreateTestCaseInput): Promise<TestCase> {
    this.logger?.info(`Creating test case: ${input.name}`);

    return this.prisma.testCase.create({
      data: input,
    });
  }

  /**
   * Create multiple test cases in a batch
   */
  async createMany(input: CreateTestCaseInput[]): Promise<{ count: number }> {
    this.logger?.info(`Creating ${input.length} test cases`);

    return this.prisma.testCase.createMany({
      data: input,
      skipDuplicates: true,
    });
  }

  /**
   * Update a test case
   */
  async update(id: string, input: UpdateTestCaseInput): Promise<TestCase> {
    this.logger?.info(`Updating test case: ${id}`);

    return this.prisma.testCase.update({
      where: { id },
      data: input,
    });
  }

  /**
   * Delete a test case
   */
  async delete(id: string): Promise<TestCase> {
    this.logger?.info(`Deleting test case: ${id}`);

    return this.prisma.testCase.delete({
      where: { id },
    });
  }

  /**
   * Count test cases with optional filtering
   */
  async count(query?: TestCaseQueryInput): Promise<number> {
    const where: Prisma.TestCaseWhereInput = {};

    if (query?.testSuiteId) {
      where.testSuiteId = query.testSuiteId;
    }
    if (query?.tags && query.tags.length > 0) {
      where.tags = {
        hasSome: query.tags,
      };
    }

    return this.prisma.testCase.count({ where });
  }
}
