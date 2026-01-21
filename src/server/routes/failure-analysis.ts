/**
 * Failure Analysis routes
 *
 * REST endpoints for AI-powered test failure analysis
 */

import type { Router, Request, Response } from 'express';
import { Router as expressRouter } from 'express';
import { asyncHandler, parsePagination } from './router-utils.js';
import { getPrismaClient } from '../../database/client.js';
import { HttpError } from '../middleware/error-handler.js';
import {
  getFailureAnalyzer,
  type FailureContext,
} from '../../services/failure-analyzer/index.js';
import { createProvider } from '../../llm/factory.js';

/**
 * Failure Analysis router
 */
export const failureAnalysisRouter: Router = expressRouter();

/**
 * Get LLM provider for analysis
 */
async function getAnalyzer() {
  const provider = createProvider();
  return getFailureAnalyzer(provider);
}

/**
 * POST /api/failure-analysis/analyze
 * Analyze a single test failure
 */
failureAnalysisRouter.post(
  '/analyze',
  asyncHandler(async (req: Request, res: Response) => {
    const { testResultId, context, options } = req.body;

    // Validate request body
    if (!context && !testResultId) {
      throw new HttpError(400, 'Either testResultId or context is required');
    }

    let failureContext: FailureContext;
    const prisma = getPrismaClient();

    if (testResultId) {
      // Load test result from database
      const testResult = await prisma.testResult.findUnique({
        where: { id: testResultId },
      });

      if (!testResult) {
        throw new HttpError(404, `Test result not found: ${testResultId}`);
      }

      // Check if analysis already exists
      const existingAnalysis = await prisma.failureAnalysis.findUnique({
        where: { testResultId },
      });

      if (existingAnalysis) {
        res.json({
          id: existingAnalysis.id,
          testResultId: existingAnalysis.testResultId,
          category: existingAnalysis.category,
          severity: existingAnalysis.severity,
          summary: existingAnalysis.summary,
          rootCause: existingAnalysis.rootCause,
          flakiness: existingAnalysis.flakiness,
          suggestedFixes: existingAnalysis.suggestedFixes,
          notes: existingAnalysis.notes,
          analyzedAt: existingAnalysis.analyzedAt,
          processingTimeMs: existingAnalysis.processingTimeMs,
          tokensUsed: existingAnalysis.tokensUsed,
          cached: true,
        });
        return;
      }

      // Get related data for context
      const testRun = await prisma.testRun.findUnique({
        where: { id: testResult.testRunId },
        include: {
          device: true,
          testSuite: true,
        },
      });

      const testCase = await prisma.testCase.findUnique({
        where: { id: testResult.testCaseId },
      });

      // Build context from database
      failureContext = {
        testName: testCase?.name || 'Unknown Test',
        testFile: undefined,
        suiteName: testRun?.testSuite.name,
        errorMessage: testResult.errorMessage || 'Unknown error',
        stackTrace: testResult.stackTrace || undefined,
        deviceInfo: testRun?.device
          ? {
              platform: testRun.device.platform.toLowerCase(),
              osVersion: testRun.device.osVersion,
              deviceName: testRun.device.name,
            }
          : undefined,
        duration: testResult.duration,
        metadata: testResult.metadata as Record<string, unknown> | undefined,
      };
    } else {
      failureContext = context;
    }

    // Validate failure context
    if (!failureContext.testName || !failureContext.errorMessage) {
      throw new HttpError(400, 'Invalid failure context: testName and errorMessage are required');
    }

    // Perform analysis
    const analyzer = await getAnalyzer();
    const analysis = await analyzer.analyze(failureContext, options || {});

    // Store analysis in database if testResultId was provided
    if (testResultId) {
      await prisma.failureAnalysis.create({
        data: {
          testResultId,
          category: analysis.category as any,
          severity: analysis.severity as any,
          summary: analysis.summary,
          rootCause: analysis.rootCause as any,
          flakiness: analysis.flakiness as any,
          suggestedFixes: analysis.suggestedFixes as any,
          notes: analysis.notes as any,
          processingTimeMs: analysis.processingTimeMs,
          tokensUsed: analysis.tokensUsed as any,
        },
      });
    }

    res.json({
      ...analysis,
      cached: false,
    });
  })
);

/**
 * POST /api/failure-analysis/batch
 * Analyze multiple test failures
 */
failureAnalysisRouter.post(
  '/batch',
  asyncHandler(async (req: Request, res: Response) => {
    const { testResultIds, failures, options } = req.body;

    if (!testResultIds && !failures) {
      throw new HttpError(400, 'Either testResultIds or failures array is required');
    }

    let contexts: FailureContext[];
    const prisma = getPrismaClient();

    if (testResultIds) {
      // Load test results from database
      const testResults = await prisma.testResult.findMany({
        where: {
          id: { in: testResultIds },
          status: { in: ['FAILED', 'TIMEOUT'] },
        },
      });

      // Get related data
      const testRunIds = testResults.map((r) => r.testRunId);
      const testCaseIds = testResults.map((r) => r.testCaseId);

      const [testRuns, testCases] = await Promise.all([
        prisma.testRun.findMany({
          where: { id: { in: testRunIds } },
          include: { device: true, testSuite: true },
        }),
        prisma.testCase.findMany({
          where: { id: { in: testCaseIds } },
        }),
      ]);

      const testRunMap = new Map(testRuns.map((tr) => [tr.id, tr]));
      const testCaseMap = new Map(testCases.map((tc) => [tc.id, tc]));

      contexts = testResults.map((testResult) => {
        const testRun = testRunMap.get(testResult.testRunId);
        const testCase = testCaseMap.get(testResult.testCaseId);

        return {
          testName: testCase?.name || 'Unknown Test',
          suiteName: testRun?.testSuite.name,
          errorMessage: testResult.errorMessage || 'Unknown error',
          stackTrace: testResult.stackTrace || undefined,
          deviceInfo: testRun?.device
            ? {
                platform: testRun.device.platform.toLowerCase(),
                osVersion: testRun.device.osVersion,
                deviceName: testRun.device.name,
              }
            : undefined,
          duration: testResult.duration,
          metadata: testResult.metadata as Record<string, unknown> | undefined,
        };
      });
    } else {
      contexts = failures;
    }

    // Perform batch analysis
    const analyzer = await getAnalyzer();
    const result = await analyzer.analyzeBatch({
      failures: contexts,
      options,
    });

    res.json(result);
  })
);

/**
 * GET /api/failure-analysis/:testResultId
 * Get existing failure analysis for a test result
 */
failureAnalysisRouter.get(
  '/:testResultId',
  asyncHandler(async (req: Request, res: Response) => {
    const testResultId = typeof req.params.testResultId === 'string'
      ? req.params.testResultId
      : req.params.testResultId?.[0] ?? '';

    const prisma = getPrismaClient();
    const analysis = await prisma.failureAnalysis.findUnique({
      where: { testResultId },
    });

    if (!analysis) {
      throw new HttpError(404, `Failure analysis not found for test result: ${testResultId}`);
    }

    res.json(analysis);
  })
);

/**
 * GET /api/failure-analysis
 * List all failure analyses with pagination
 */
failureAnalysisRouter.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const { skip, take } = parsePagination(_req);
    const { category, severity, isFlaky } = _req.query;

    const prisma = getPrismaClient();
    const where: Record<string, unknown> = {};

    if (category) {
      where.category = category as string;
    }
    if (severity) {
      where.severity = severity as string;
    }
    if (isFlaky === 'true') {
      // Filter by flaky indicator in the JSON field
      where.flakiness = {
        path: ['isFlaky'],
        equals: true,
      };
    }

    const [analyses, total] = await Promise.all([
      prisma.failureAnalysis.findMany({
        where,
        skip,
        take,
        orderBy: { analyzedAt: 'desc' },
      }),
      prisma.failureAnalysis.count({ where }),
    ]);

    // Get related test result data
    const testResultIds = analyses.map((a) => a.testResultId);
    const testResults = testResultIds.length > 0
      ? await prisma.testResult.findMany({
          where: { id: { in: testResultIds } },
          include: {
            testCase: { select: { name: true } },
            testRun: {
              include: {
                testSuite: { select: { name: true } },
                device: { select: { name: true, platform: true, osVersion: true } },
              },
            },
          },
        })
      : [];

    const testResultMap = new Map(testResults.map((tr) => [tr.id, tr]));

    const analysesWithDetails = analyses.map((analysis) => ({
      ...analysis,
      testResult: testResultMap.get(analysis.testResultId),
    }));

    res.json({
      data: analysesWithDetails,
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
 * GET /api/failure-analysis/summary/stats
 * Get failure analysis summary statistics
 */
failureAnalysisRouter.get(
  '/summary/stats',
  asyncHandler(async (_req: Request, res: Response) => {
    const prisma = getPrismaClient();

    const [total, byCategory, bySeverity, flakyCount] = await Promise.all([
      prisma.failureAnalysis.count(),
      prisma.failureAnalysis.groupBy({
        by: ['category'],
        _count: true,
      }),
      prisma.failureAnalysis.groupBy({
        by: ['severity'],
        _count: true,
      }),
      // Count flaky tests (need to filter on JSON field)
      prisma.failureAnalysis.count({
        where: {
          flakiness: {
            path: ['isFlaky'],
            equals: true,
          },
        },
      }),
    ]);

    const categoryMap = byCategory.reduce((acc: Record<string, number>, item) => {
      acc[item.category] = item._count;
      return acc;
    }, {});

    const severityMap = bySeverity.reduce((acc: Record<string, number>, item) => {
      acc[item.severity] = item._count;
      return acc;
    }, {});

    res.json({
      total,
      flakyCount,
      byCategory: categoryMap,
      bySeverity: severityMap,
    });
  })
);

/**
 * DELETE /api/failure-analysis/:testResultId
 * Delete failure analysis for a test result
 */
failureAnalysisRouter.delete(
  '/:testResultId',
  asyncHandler(async (req: Request, res: Response) => {
    const testResultId = typeof req.params.testResultId === 'string'
      ? req.params.testResultId
      : req.params.testResultId?.[0] ?? '';

    const prisma = getPrismaClient();
    const analysis = await prisma.failureAnalysis.delete({
      where: { testResultId },
    });

    res.json({
      success: true,
      deleted: analysis.id,
    });
  })
);

/**
 * POST /api/failure-analysis/quick-analyze
 * Quick pattern-based analysis without LLM
 */
failureAnalysisRouter.post(
  '/quick-analyze',
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.body;

    if (!context || !context.testName || !context.errorMessage) {
      throw new HttpError(400, 'Invalid failure context: testName and errorMessage are required');
    }

    const analyzer = await getAnalyzer();
    const result = analyzer.quickAnalyze(context);

    res.json(result);
  })
);
