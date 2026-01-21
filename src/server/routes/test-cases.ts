/**
 * Test Case routes
 *
 * REST endpoints for test case management
 */

import type { Router, Request, Response } from 'express';
import { Router as expressRouter } from 'express';
import { asyncHandler, parsePagination, parseFilters, getParam } from './router-utils.js';
import { getPrismaClient } from '../../database/client.js';
import { HttpError } from '../middleware/error-handler.js';

/**
 * Test Cases router
 */
export const testCasesRouter: Router = expressRouter();

// Helper to get prisma client lazily
function getPrisma() {
  return getPrismaClient();
}

/**
 * GET /api/test-cases
 * Get all test cases with optional filtering
 */
testCasesRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { skip, take } = parsePagination(req);
    const filters = parseFilters(req, ['testSuiteId', 'tags']);

    const where: Record<string, unknown> = {};
    if (filters.testSuiteId) {
      where.testSuiteId = filters.testSuiteId as string;
    }
    if (filters.tags) {
      const tags = Array.isArray(filters.tags)
        ? filters.tags
        : (filters.tags as string).split(',');
      where.tags = { hasSome: tags };
    }

    const [testCases, total] = await Promise.all([
      getPrisma().testCase.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          testSuite: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      getPrisma().testCase.count({ where }),
    ]);

    res.json({
      data: testCases,
      pagination: {
        skip,
        take,
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  })
);

/**
 * GET /api/test-cases/:id
 * Get a single test case by ID
 */
testCasesRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = getParam(req, 'id');
    const testCase = await getPrisma().testCase.findUnique({
      where: { id },
      include: {
        testSuite: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        testResults: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            duration: true,
            testRunId: true,
            createdAt: true,
          },
        },
      },
    });

    if (!testCase) {
      throw new HttpError(404, 'Test case not found');
    }

    res.json({ data: testCase });
  })
);

/**
 * POST /api/test-cases
 * Create a new test case
 */
testCasesRouter.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { testSuiteId, name, description, expectedOutcome, timeout, tags } = req.body;

    if (!testSuiteId || !name || !description || !expectedOutcome) {
      throw new HttpError(
        400,
        'Missing required fields: testSuiteId, name, description, expectedOutcome'
      );
    }

    // Verify test suite exists
    const testSuite = await getPrisma().testSuite.findUnique({
      where: { id: testSuiteId },
    });

    if (!testSuite) {
      throw new HttpError(404, 'Test suite not found');
    }

    try {
      const testCase = await getPrisma().testCase.create({
        data: {
          testSuiteId,
          name,
          description,
          expectedOutcome,
          timeout: timeout ?? null,
          tags: tags ?? [],
        },
      });

      res.status(201).json({ data: testCase });
    } catch (error: unknown) {
      // Handle unique constraint violation
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new HttpError(409, 'Test case with this name already exists in this suite', 'DUPLICATE_NAME');
      }
      throw error;
    }
  })
);

/**
 * PATCH /api/test-cases/:id
 * Update a test case
 */
testCasesRouter.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = getParam(req, 'id');
    const { name, description, expectedOutcome, timeout, tags } = req.body;

    const testCase = await getPrisma().testCase.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(expectedOutcome !== undefined && { expectedOutcome }),
        ...(timeout !== undefined && { timeout }),
        ...(tags !== undefined && { tags }),
      },
    });

    res.json({ data: testCase });
  })
);

/**
 * DELETE /api/test-cases/:id
 * Delete a test case
 */
testCasesRouter.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = getParam(req, 'id');
    await getPrisma().testCase.delete({
      where: { id },
    });

    res.status(204).send();
  })
);

/**
 * GET /api/test-cases/stats/summary
 * Get test case statistics
 */
testCasesRouter.get(
  '/stats/summary',
  asyncHandler(async (_req: Request, res: Response) => {
    const [total] = await Promise.all([
      getPrisma().testCase.count(),
    ]);

    res.json({
      data: {
        total,
      },
    });
  })
);
