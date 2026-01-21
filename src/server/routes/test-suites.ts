/**
 * Test Suite routes
 *
 * REST endpoints for test suite management
 */

import type { Router, Request, Response } from 'express';
import { Router as expressRouter } from 'express';
import { asyncHandler, parsePagination, parseFilters, getParam } from './router-utils.js';
import { getPrismaClient } from '../../database/client.js';
import { HttpError } from '../middleware/error-handler.js';

/**
 * Test Suites router
 */
export const testSuitesRouter: Router = expressRouter();

// Helper to get prisma client lazily
function getPrisma() {
  return getPrismaClient();
}

/**
 * GET /api/test-suites
 * Get all test suites with optional filtering
 */
testSuitesRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { skip, take } = parsePagination(req);
    const filters = parseFilters(req, ['tags']);

    const where: Record<string, unknown> = {};
    if (filters.tags) {
      const tags = Array.isArray(filters.tags)
        ? filters.tags
        : (filters.tags as string).split(',');
      where.tags = { hasSome: tags };
    }

    const [suites, total] = await Promise.all([
      getPrisma().testSuite.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      getPrisma().testSuite.count({ where }),
    ]);

    res.json({
      data: suites,
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
 * GET /api/test-suites/:id
 * Get a single test suite by ID
 */
testSuitesRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = getParam(req, 'id');
    const suite = await getPrisma().testSuite.findUnique({
      where: { id },
      include: {
        testCases: true,
        testRuns: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            device: {
              select: {
                id: true,
                name: true,
                platform: true,
                osVersion: true,
              },
            },
          },
        },
      },
    });

    if (!suite) {
      throw new HttpError(404, 'Test suite not found');
    }

    res.json({ data: suite });
  })
);

/**
 * POST /api/test-suites
 * Create a new test suite
 */
testSuitesRouter.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { name, description, tags } = req.body;

    if (!name) {
      throw new HttpError(400, 'Missing required field: name');
    }

    try {
      const suite = await getPrisma().testSuite.create({
        data: {
          name,
          description: description ?? null,
          tags: tags ?? [],
        },
      });

      res.status(201).json({ data: suite });
    } catch (error: unknown) {
      // Handle unique constraint violation
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new HttpError(409, 'Test suite with this name already exists', 'DUPLICATE_NAME');
      }
      throw error;
    }
  })
);

/**
 * PATCH /api/test-suites/:id
 * Update a test suite
 */
testSuitesRouter.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = getParam(req, 'id');
    const { description, tags } = req.body;

    const suite = await getPrisma().testSuite.update({
      where: { id },
      data: {
        ...(description !== undefined && { description }),
        ...(tags !== undefined && { tags }),
      },
    });

    res.json({ data: suite });
  })
);

/**
 * DELETE /api/test-suites/:id
 * Delete a test suite (cascade deletes test cases and results)
 */
testSuitesRouter.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = getParam(req, 'id');
    await getPrisma().testSuite.delete({
      where: { id },
    });

    res.status(204).send();
  })
);

/**
 * GET /api/test-suites/stats/summary
 * Get test suite statistics
 */
testSuitesRouter.get(
  '/stats/summary',
  asyncHandler(async (_req: Request, res: Response) => {
    const [total, withTags] = await Promise.all([
      getPrisma().testSuite.count(),
      getPrisma().testSuite.count({
        where: {
          tags: {
            isEmpty: false,
          },
        },
      }),
    ]);

    res.json({
      data: {
        total,
        withTags,
      },
    });
  })
);
