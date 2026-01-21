/**
 * Test Optimization routes
 *
 * REST endpoints for test grouping optimization and history tracking
 */

import type { Router, Request, Response } from 'express';
import { Router as expressRouter } from 'express';
import { asyncHandler, getParam } from './router-utils.js';
import { getPrismaClient } from '../../database/client.js';
import { HttpError } from '../middleware/error-handler.js';
import {
  getTestOptimizationService,
  getGlobalHistoryTracker,
  getGlobalOptimizer,
} from '../../services/test-optimization/index.js';
import { GroupingStrategy } from '../../services/test-optimization/types.js';
import { createModuleLogger } from '../../utils/logger.js';

const logger = createModuleLogger('test-optimization-routes');

/**
 * Test Optimization router
 */
export const testOptimizationRouter: Router = expressRouter();

/**
 * GET /api/test-optimization/stats
 * Get test execution history statistics
 */
testOptimizationRouter.get(
  '/stats',
  asyncHandler(async (_req: Request, res: Response) => {
    const service = getTestOptimizationService();
    const stats = service.getStatistics();

    res.json({ data: stats });
  })
);

/**
 * POST /api/test-optimization/optimize
 * Get optimal test batches for parallel execution
 */
testOptimizationRouter.post(
  '/optimize',
  asyncHandler(async (req: Request, res: Response) => {
    const { testCaseIds, targetWorkers, strategy } = req.body;

    if (!testCaseIds || !Array.isArray(testCaseIds) || testCaseIds.length === 0) {
      throw new HttpError(400, 'testCaseIds must be a non-empty array');
    }

    // Validate test case IDs exist
    const prisma = getPrismaClient();
    const existingTests = await prisma.testCase.findMany({
      where: { id: { in: testCaseIds } },
      select: { id: true },
    });

    if (existingTests.length !== testCaseIds.length) {
      const foundIds = new Set(existingTests.map((t) => t.id));
      const missingIds = testCaseIds.filter((id: string) => !foundIds.has(id));
      throw new HttpError(
        400,
        `Invalid test case IDs: ${missingIds.join(', ')}`
      );
    }

    const service = getTestOptimizationService();
    const result = await service.getOptimalBatches(testCaseIds, {
      targetWorkers,
      strategy,
    });

    res.json({ data: result });
  })
);

/**
 * POST /api/test-optimization/optimize-suite/:suiteId
 * Get optimal batches for all tests in a suite
 */
testOptimizationRouter.post(
  '/optimize-suite/:suiteId',
  asyncHandler(async (req: Request, res: Response) => {
    const suiteId = getParam(req, 'suiteId');
    const { targetWorkers, strategy } = req.body;

    const prisma = getPrismaClient();
    const suite = await prisma.testSuite.findUnique({
      where: { id: suiteId },
      include: { testCases: true },
    });

    if (!suite) {
      throw new HttpError(404, 'Test suite not found');
    }

    const testCaseIds = suite.testCases.map((tc) => tc.id);

    const service = getTestOptimizationService();
    const result = await service.getOptimalBatches(testCaseIds, {
      targetWorkers,
      strategy,
    });

    res.json({
      data: {
        ...result,
        suiteName: suite.name,
        suiteId: suite.id,
      },
    });
  })
);

/**
 * POST /api/test-optimization/record/:testRunId
 * Record test execution data for learning
 */
testOptimizationRouter.post(
  '/record/:testRunId',
  asyncHandler(async (req: Request, res: Response) => {
    const testRunId = getParam(req, 'testRunId');

    const prisma = getPrismaClient();
    const testRun = await prisma.testRun.findUnique({
      where: { id: testRunId },
    });

    if (!testRun) {
      throw new HttpError(404, 'Test run not found');
    }

    if (testRun.status !== 'COMPLETED' && testRun.status !== 'FAILED') {
      throw new HttpError(
        400,
        'Can only record completed or failed test runs'
      );
    }

    const service = getTestOptimizationService();
    await service.recordTestRun(testRunId);

    logger.info({ testRunId }, 'Recorded test run for optimization');

    res.json({
      data: {
        message: 'Test run recorded successfully',
        testRunId,
      },
    });
  })
);

/**
 * GET /api/test-optimization/estimate/:testCaseId
 * Get estimated duration for a test case
 */
testOptimizationRouter.get(
  '/estimate/:testCaseId',
  asyncHandler(async (req: Request, res: Response) => {
    const testCaseId = getParam(req, 'testCaseId');
    const defaultDuration = req.query.default
      ? parseInt(req.query.default as string, 10)
      : undefined;

    // Validate test case exists
    const prisma = getPrismaClient();
    const testCase = await prisma.testCase.findUnique({
      where: { id: testCaseId },
    });

    if (!testCase) {
      throw new HttpError(404, 'Test case not found');
    }

    const historyTracker = getGlobalHistoryTracker();
    const duration = historyTracker.getEstimatedDuration(
      testCaseId,
      defaultDuration
    );
    const isFlaky = historyTracker.isTestFlaky(testCaseId);
    const history = historyTracker.getHistory(testCaseId);

    res.json({
      data: {
        testCaseId,
        testName: testCase.name,
        estimatedDuration: duration,
        isFlaky,
        sampleCount: history.length,
        hasHistory: history.length >= 3,
      },
    });
  })
);

/**
 * GET /api/test-optimization/flaky
 * Get all flaky tests
 */
testOptimizationRouter.get(
  '/flaky',
  asyncHandler(async (_req: Request, res: Response) => {
    const historyTracker = getGlobalHistoryTracker();
    const flakyTests = historyTracker.getFlakyTests();

    const flakyTestData = Array.from(flakyTests.values()).map((record) => ({
      testCaseId: record.testCaseId,
      testName: record.testName,
      avgDuration: record.avgDuration,
      sampleCount: record.sampleCount,
      tags: record.tags,
    }));

    res.json({
      data: {
        count: flakyTestData.length,
        tests: flakyTestData,
      },
    });
  })
);

/**
 * POST /api/test-optimization/config
 * Update optimization configuration
 */
testOptimizationRouter.post(
  '/config',
  asyncHandler(async (req: Request, res: Response) => {
    const { targetWorkers, strategy, minHistorySamples, maxHistorySamples } =
      req.body;

    const updates: {
      targetWorkers?: number;
      strategy?: GroupingStrategy;
      minHistorySamples?: number;
      maxHistorySamples?: number;
    } = {};

    if (typeof targetWorkers === 'number') {
      if (targetWorkers < 1 || targetWorkers > 20) {
        throw new HttpError(400, 'targetWorkers must be between 1 and 20');
      }
      updates.targetWorkers = targetWorkers;
    }

    if (typeof strategy === 'string') {
      const validStrategies = [
        'duration_balanced',
        'duration_clustered',
        'tag_based',
        'flaky_isolated',
        'hybrid',
      ];
      if (!validStrategies.includes(strategy)) {
        throw new HttpError(400, `Invalid strategy. Must be one of: ${validStrategies.join(', ')}`);
      }
      updates.strategy = strategy as GroupingStrategy;
    }

    if (typeof minHistorySamples === 'number') {
      if (minHistorySamples < 1) {
        throw new HttpError(400, 'minHistorySamples must be at least 1');
      }
      updates.minHistorySamples = minHistorySamples;
    }

    if (typeof maxHistorySamples === 'number') {
      if (maxHistorySamples < 10) {
        throw new HttpError(400, 'maxHistorySamples must be at least 10');
      }
      updates.maxHistorySamples = maxHistorySamples;
    }

    const service = getTestOptimizationService();
    service.updateConfig(updates);

    const updatedConfig = service.getConfig();

    logger.info({ updates }, 'Updated optimization configuration');

    res.json({ data: updatedConfig });
  })
);

/**
 * GET /api/test-optimization/config
 * Get current optimization configuration
 */
testOptimizationRouter.get(
  '/config',
  asyncHandler(async (_req: Request, res: Response) => {
    const optimizer = getGlobalOptimizer();
    const config = optimizer.getConfig();

    res.json({ data: config });
  })
);

/**
 * POST /api/test-optimization/history/load
 * Load historical data from database
 */
testOptimizationRouter.post(
  '/history/load',
  asyncHandler(async (req: Request, res: Response) => {
    const { limit } = req.body;
    const historyTracker = getGlobalHistoryTracker();

    await historyTracker.loadFromDatabase(limit || 1000);

    const stats = historyTracker.getStatistics();

    logger.info(
      {
        totalExecutions: stats.totalExecutions,
        uniqueTests: stats.testsWithDataHistory,
      },
      'Historical data loaded'
    );

    res.json({
      data: {
        message: 'Historical data loaded successfully',
        statistics: stats,
      },
    });
  })
);

/**
 * DELETE /api/test-optimization/history/cache
 * Clear historical data cache
 */
testOptimizationRouter.delete(
  '/history/cache',
  asyncHandler(async (_req: Request, res: Response) => {
    const historyTracker = getGlobalHistoryTracker();
    historyTracker.clearCache();

    logger.info('Historical data cache cleared');

    res.json({
      data: {
        message: 'Cache cleared successfully',
      },
    });
  })
);
