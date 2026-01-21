/**
 * Test Suite repository for database operations on TestSuite entities
 */

import type {
  TestSuite,
  Prisma,
} from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { Logger } from '../../utils/logger.js';

/**
 * Extended TestSuite type with relations
 */
export type TestSuiteWithRelations = TestSuite & {
  testCases?: unknown[];
  testRuns?: unknown[];
};

/**
 * Input type for creating a test suite
 */
export type CreateTestSuiteInput = {
  name: string;
  description?: string | null;
  tags?: string[];
};

/**
 * Input type for updating a test suite
 */
export type UpdateTestSuiteInput = Partial<Omit<CreateTestSuiteInput, 'name'>>;

/**
 * Test Suite repository class
 */
export class TestSuiteRepository {
  constructor(
    private prisma: PrismaClient,
    private logger?: Logger
  ) {}

  /**
   * Find a test suite by ID
   */
  async findById(id: string): Promise<TestSuite | null> {
    this.logger?.debug(`Finding test suite by ID: ${id}`);
    return this.prisma.testSuite.findUnique({
      where: { id },
    });
  }

  /**
   * Find a test suite by ID with relations
   */
  async findByIdWithRelations(id: string): Promise<TestSuiteWithRelations | null> {
    return this.prisma.testSuite.findUnique({
      where: { id },
      include: {
        testCases: true,
        testRuns: {
          include: {
            device: true,
          },
        },
      },
    });
  }

  /**
   * Find a test suite by name
   */
  async findByName(name: string): Promise<TestSuite | null> {
    return this.prisma.testSuite.findUnique({
      where: { name },
    });
  }

  /**
   * Find all test suites
   */
  async findMany(params?: {
    skip?: number;
    take?: number;
    tags?: string[];
  }): Promise<TestSuite[]> {
    const where: Prisma.TestSuiteWhereInput = {};

    if (params?.tags && params.tags.length > 0) {
      where.tags = {
        hasSome: params.tags,
      };
    }

    return this.prisma.testSuite.findMany({
      where,
      skip: params?.skip,
      take: params?.take,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Create a new test suite
   */
  async create(input: CreateTestSuiteInput): Promise<TestSuite> {
    this.logger?.info(`Creating test suite: ${input.name}`);

    return this.prisma.testSuite.create({
      data: input,
    });
  }

  /**
   * Update a test suite
   */
  async update(id: string, input: UpdateTestSuiteInput): Promise<TestSuite> {
    this.logger?.info(`Updating test suite: ${id}`);

    return this.prisma.testSuite.update({
      where: { id },
      data: input,
    });
  }

  /**
   * Delete a test suite
   */
  async delete(id: string): Promise<TestSuite> {
    this.logger?.info(`Deleting test suite: ${id}`);

    return this.prisma.testSuite.delete({
      where: { id },
    });
  }

  /**
   * Count test suites
   */
  async count(params?: {
    tags?: string[];
  }): Promise<number> {
    const where: Prisma.TestSuiteWhereInput = {};

    if (params?.tags && params.tags.length > 0) {
      where.tags = {
        hasSome: params.tags,
      };
    }

    return this.prisma.testSuite.count({ where });
  }
}
