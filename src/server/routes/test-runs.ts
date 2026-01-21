/**
 * Test Run routes
 *
 * REST endpoints for test execution triggers and result retrieval
 */

import type { Router, Request, Response } from 'express';
import { Router as expressRouter } from 'express';
import { asyncHandler, parsePagination, parseFilters, getParam } from './router-utils.js';
import { getPrismaClient } from '../../database/client.js';
import { HttpError } from '../middleware/error-handler.js';
import { getQueueManager } from '../../queues/manager.js';
import type { TestJobData } from '../../queues/types.js';

/**
 * Test Runs router
 */
export const testRunsRouter: Router = expressRouter();

/**
 * Queue manager reference (initialized on first use)
 */
let queueManagerInitialized = false;

/**
 * Ensure queue manager is initialized
 */
async function ensureQueueManager() {
  if (!queueManagerInitialized) {
    const manager = getQueueManager();
    try {
      await manager.initialize();
      queueManagerInitialized = true;
    } catch (error) {
      // Queue initialization failed - log but continue (fallback to synchronous mode)
      console.error('Failed to initialize queue manager:', error);
    }
  }
}

// Helper to get prisma client lazily
function getPrisma() {
  return getPrismaClient();
}

/**
 * GET /api/test-runs
 * Get all test runs with optional filtering
 */
testRunsRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { skip, take } = parsePagination(req);
    const filters = parseFilters(req, ['testSuiteId', 'deviceId', 'status']);

    const where: Record<string, unknown> = {};
    if (filters.testSuiteId) {
      where.testSuiteId = filters.testSuiteId as string;
    }
    if (filters.deviceId) {
      where.deviceId = filters.deviceId as string;
    }
    if (filters.status) {
      where.status = filters.status as string;
    }

    const [runs, total] = await Promise.all([
      getPrisma().testRun.findMany({
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
          device: {
            select: {
              id: true,
              name: true,
              platform: true,
              osVersion: true,
            },
          },
        },
      }),
      getPrisma().testRun.count({ where }),
    ]);

    res.json({
      data: runs,
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
 * GET /api/test-runs/summary
 * Get test run summary statistics
 */
testRunsRouter.get(
  '/summary',
  asyncHandler(async (req: Request, res: Response) => {
    const filters = parseFilters(req, ['testSuiteId', 'deviceId', 'status']);

    const where: Record<string, unknown> = {};
    if (filters.testSuiteId) {
      where.testSuiteId = filters.testSuiteId as string;
    }
    if (filters.deviceId) {
      where.deviceId = filters.deviceId as string;
    }
    if (filters.status) {
      where.status = filters.status as string;
    }

    const [total, completed, failed, pending, running, cancelled] = await Promise.all([
      getPrisma().testRun.count({ where }),
      getPrisma().testRun.count({ where: { ...where, status: 'COMPLETED' } }),
      getPrisma().testRun.count({ where: { ...where, status: 'FAILED' } }),
      getPrisma().testRun.count({ where: { ...where, status: 'PENDING' } }),
      getPrisma().testRun.count({ where: { ...where, status: 'RUNNING' } }),
      getPrisma().testRun.count({ where: { ...where, status: 'CANCELLED' } }),
    ]);

    // Calculate aggregate stats
    const finishedRuns = await getPrisma().testRun.findMany({
      where: {
        ...where,
        status: { in: ['COMPLETED', 'FAILED'] },
      },
      select: {
        passedCount: true,
        failedCount: true,
        skippedCount: true,
      },
    });

    const totalPassed = finishedRuns.reduce((sum, r) => sum + (r.passedCount || 0), 0);
    const totalFailed = finishedRuns.reduce((sum, r) => sum + (r.failedCount || 0), 0);
    const totalSkipped = finishedRuns.reduce((sum, r) => sum + (r.skippedCount || 0), 0);

    res.json({
      data: {
        total,
        byStatus: {
          completed,
          failed,
          pending,
          running,
          cancelled,
        },
        aggregate: {
          totalPassed,
          totalFailed,
          totalSkipped,
          passRate: totalPassed + totalFailed > 0
            ? (totalPassed / (totalPassed + totalFailed)) * 100
            : 0,
        },
      },
    });
  })
);

/**
 * GET /api/test-runs/historical
 * Get historical test run data
 */
testRunsRouter.get(
  '/historical',
  asyncHandler(async (req: Request, res: Response) => {
    const days = parseInt(req.query.days as string) || 30;
    const filters = parseFilters(req, ['testSuiteId', 'deviceId']);

    const where: Record<string, unknown> = {};
    if (filters.testSuiteId) {
      where.testSuiteId = filters.testSuiteId as string;
    }
    if (filters.deviceId) {
      where.deviceId = filters.deviceId as string;
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const runs = await getPrisma().testRun.findMany({
      where: {
        ...where,
        startedAt: { not: null },
      },
      select: {
        startedAt: true,
        status: true,
        passedCount: true,
        failedCount: true,
      },
    });

    // Group by date
    const grouped = new Map<string, { total: number; passed: number; failed: number }>();

    for (const run of runs) {
      if (!run.startedAt) continue;
      const dateKey = run.startedAt.toISOString().split('T')[0] ?? '';
      const current = grouped.get(dateKey) ?? { total: 0, passed: 0, failed: 0 };
      current.total++;
      if (run.status === 'COMPLETED') {
        current.passed++;
      }
      if (run.status === 'FAILED') {
        current.failed++;
      }
      grouped.set(dateKey, current);
    }

    const data = Array.from(grouped.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({ data });
  })
);

// ============================================================================
// Queue Management Routes
// NOTE: These must be defined before /:id route to avoid conflicts
// ============================================================================

/**
 * GET /api/test-runs/queue/stats
 * Get queue statistics
 */
testRunsRouter.get(
  '/queue/stats',
  asyncHandler(async (_req: Request, res: Response) => {
    await ensureQueueManager();
    const manager = getQueueManager();

    if (!manager.isReady()) {
      throw new HttpError(503, 'Queue not available', 'QUEUE_UNAVAILABLE');
    }

    const stats = await manager.getStats();
    const connectionInfo = manager.getConnectionInfo();

    res.json({
      data: {
        ...stats,
        connection: {
          clientStatus: connectionInfo.clientStatus,
          subscriberStatus: connectionInfo.subscriberStatus,
        },
      },
    });
  })
);

/**
 * GET /api/test-runs/queue/job/:jobId
 * Get job status by job ID
 */
testRunsRouter.get(
  '/queue/job/:jobId',
  asyncHandler(async (req: Request, res: Response) => {
    const jobId = getParam(req, 'jobId');
    const jobStatus = await getQueueManager().getJobStatus(jobId);

    if (!jobStatus) {
      throw new HttpError(404, 'Job not found');
    }

    res.json({ data: jobStatus });
  })
);

/**
 * POST /api/test-runs/queue/job/:jobId/retry
 * Retry a failed job
 */
testRunsRouter.post(
  '/queue/job/:jobId/retry',
  asyncHandler(async (req: Request, res: Response) => {
    const jobId = getParam(req, 'jobId');
    const job = await getQueueManager().retryJob(jobId);

    if (!job) {
      throw new HttpError(404, 'Job not found');
    }

    res.json({
      data: {
        jobId: job.id?.toString(),
        retried: true,
      },
    });
  })
);

/**
 * DELETE /api/test-runs/queue/job/:jobId
 * Cancel/remove a job
 */
testRunsRouter.delete(
  '/queue/job/:jobId',
  asyncHandler(async (req: Request, res: Response) => {
    const jobId = getParam(req, 'jobId');
    const cancelled = await getQueueManager().cancelJob(jobId);

    if (!cancelled) {
      throw new HttpError(404, 'Job not found or could not be cancelled');
    }

    res.json({
      data: {
        jobId,
        cancelled: true,
      },
    });
  })
);

/**
 * POST /api/test-runs/queue/pause
 * Pause the queue
 */
testRunsRouter.post(
  '/queue/pause',
  asyncHandler(async (_req: Request, res: Response) => {
    await ensureQueueManager();
    const manager = getQueueManager();

    if (!manager.isReady()) {
      throw new HttpError(503, 'Queue not available', 'QUEUE_UNAVAILABLE');
    }

    await manager.pause();

    res.json({
      data: {
        paused: true,
        message: 'Queue paused successfully',
      },
    });
  })
);

/**
 * POST /api/test-runs/queue/resume
 * Resume the queue
 */
testRunsRouter.post(
  '/queue/resume',
  asyncHandler(async (_req: Request, res: Response) => {
    await ensureQueueManager();
    const manager = getQueueManager();

    if (!manager.isReady()) {
      throw new HttpError(503, 'Queue not available', 'QUEUE_UNAVAILABLE');
    }

    await manager.resume();

    res.json({
      data: {
        resumed: true,
        message: 'Queue resumed successfully',
      },
    });
  })
);

/**
 * POST /api/test-runs/queue/clean
 * Clean old jobs from the queue
 */
testRunsRouter.post(
  '/queue/clean',
  asyncHandler(async (req: Request, res: Response) => {
    await ensureQueueManager();
    const manager = getQueueManager();

    if (!manager.isReady()) {
      throw new HttpError(503, 'Queue not available', 'QUEUE_UNAVAILABLE');
    }

    const { grace = 86400000, type = 'completed' } = req.body; // grace: 24 hours default

    if (!['completed', 'failed', 'wait'].includes(type)) {
      throw new HttpError(400, 'Invalid type. Must be "completed", "failed", or "wait"');
    }

    const jobs = await manager.cleanOldJobs(grace, undefined, type as 'completed' | 'failed' | 'wait');

    res.json({
      data: {
        cleaned: jobs.length,
        type,
        grace,
      },
    });
  })
);

/**
 * GET /api/test-runs/:id
 * Get a single test run by ID
 */
testRunsRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const run = await getPrisma().testRun.findUnique({
      where: { id: getParam(req, 'id') },
      include: {
        testSuite: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        device: {
          select: {
            id: true,
            name: true,
            platform: true,
            osVersion: true,
            isEmulator: true,
          },
        },
        testResults: {
          include: {
            testCase: {
              select: {
                id: true,
                name: true,
                description: true,
              },
            },
          },
        },
        artifacts: true,
      },
    });

    if (!run) {
      throw new HttpError(404, 'Test run not found');
    }

    res.json({ data: run });
  })
);

/**
 * POST /api/test-runs
 * Create and trigger a new test run
 * Supports both queued (async) and direct (sync) execution via queue parameter
 */
testRunsRouter.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { testSuiteId, deviceId, metadata, priority, scheduleAt, useQueue = true } = req.body;

    if (!testSuiteId || !deviceId) {
      throw new HttpError(400, 'Missing required fields: testSuiteId, deviceId');
    }

    // Verify test suite exists
    const testSuite = await getPrisma().testSuite.findUnique({
      where: { id: testSuiteId },
    });

    if (!testSuite) {
      throw new HttpError(404, 'Test suite not found');
    }

    // Verify device exists
    const device = await getPrisma().device.findUnique({
      where: { id: deviceId },
    });

    if (!device) {
      throw new HttpError(404, 'Device not found');
    }

    // Create test run
    const testRun = await getPrisma().testRun.create({
      data: {
        testSuiteId,
        deviceId,
        status: 'PENDING',
        metadata: metadata ?? {},
      },
    });

    // If queue is requested and available, enqueue the job
    if (useQueue) {
      try {
        await ensureQueueManager();
        const manager = getQueueManager();

        if (manager.isReady()) {
          const jobData: TestJobData = {
            testRunId: testRun.id,
            testSuiteId,
            deviceId,
            priority,
            scheduledAt: scheduleAt ? new Date(scheduleAt).getTime() : undefined,
            metadata,
          };

          const job = await manager.addJob(jobData, {
            priority,
            delay: scheduleAt ? Math.max(0, new Date(scheduleAt).getTime() - Date.now()) : undefined,
          });

          // Update device status to BUSY immediately when queued
          await getPrisma().device.update({
            where: { id: deviceId },
            data: { status: 'BUSY' },
          });

          return res.status(201).json({
            data: {
              ...testRun,
              queue: {
                jobId: job.id?.toString(),
                queued: true,
                scheduledAt: scheduleAt || null,
              },
            },
          });
        }
      } catch (error) {
        console.error('Queue error, falling back to direct mode:', error);
        // Fall through to direct mode if queue fails
      }
    }

    // Direct/synchronous mode (fallback or when queue is disabled)
    // Update device status to BUSY
    await getPrisma().device.update({
      where: { id: deviceId },
      data: { status: 'BUSY' },
    });

    res.status(201).json({
      data: {
        ...testRun,
        queue: {
          queued: false,
        },
      },
    });
  })
);

/**
 * PATCH /api/test-runs/:id
 * Update a test run
 */
testRunsRouter.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { status, passedCount, failedCount, skippedCount, totalDuration, metadata } = req.body;

    const data: Record<string, unknown> = {};
    if (status !== undefined) data.status = status;
    if (passedCount !== undefined) data.passedCount = passedCount;
    if (failedCount !== undefined) data.failedCount = failedCount;
    if (skippedCount !== undefined) data.skippedCount = skippedCount;
    if (totalDuration !== undefined) data.totalDuration = totalDuration;
    if (metadata !== undefined) data.metadata = metadata;

    // Set timestamps based on status
    if (status === 'RUNNING') {
      data.startedAt = new Date();
    }
    if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED') {
      data.completedAt = new Date();
    }

    const run = await getPrisma().testRun.update({
      where: { id: getParam(req, 'id') },
      data,
    });

    // If run is complete/fail/cancelled, release device
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) {
      await getPrisma().device.update({
        where: { id: run.deviceId },
        data: { status: 'AVAILABLE' },
      });
    }

    res.json({ data: run });
  })
);

/**
 * POST /api/test-runs/:id/start
 * Start a test run
 */
testRunsRouter.post(
  '/:id/start',
  asyncHandler(async (req: Request, res: Response) => {
    const run = await getPrisma().testRun.update({
      where: { id: getParam(req, 'id') },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    res.json({ data: run });
  })
);

/**
 * POST /api/test-runs/:id/complete
 * Complete a test run
 */
testRunsRouter.post(
  '/:id/complete',
  asyncHandler(async (req: Request, res: Response) => {
    const { totalDuration, passedCount, failedCount, skippedCount } = req.body;

    if (totalDuration === undefined || passedCount === undefined || failedCount === undefined) {
      throw new HttpError(400, 'Missing required fields: totalDuration, passedCount, failedCount');
    }

    const run = await getPrisma().testRun.update({
      where: { id: getParam(req, 'id') },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        totalDuration,
        passedCount,
        failedCount,
        skippedCount: skippedCount ?? 0,
      },
    });

    // Release device
    await getPrisma().device.update({
      where: { id: run.deviceId },
      data: { status: 'AVAILABLE' },
    });

    res.json({ data: run });
  })
);

/**
 * POST /api/test-runs/:id/fail
 * Mark a test run as failed
 */
testRunsRouter.post(
  '/:id/fail',
  asyncHandler(async (req: Request, res: Response) => {
    const { errorMessage } = req.body;

    const run = await getPrisma().testRun.update({
      where: { id: getParam(req, 'id') },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        metadata: errorMessage ? { error: errorMessage } : {},
      },
    });

    // Release device
    await getPrisma().device.update({
      where: { id: run.deviceId },
      data: { status: 'AVAILABLE' },
    });

    res.json({ data: run });
  })
);

/**
 * POST /api/test-runs/:id/cancel
 * Cancel a test run
 */
testRunsRouter.post(
  '/:id/cancel',
  asyncHandler(async (req: Request, res: Response) => {
    const run = await getPrisma().testRun.update({
      where: { id: getParam(req, 'id') },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      },
    });

    // Release device
    await getPrisma().device.update({
      where: { id: run.deviceId },
      data: { status: 'AVAILABLE' },
    });

    res.json({ data: run });
  })
);

/**
 * DELETE /api/test-runs/:id
 * Delete a test run
 */
testRunsRouter.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const run = await getPrisma().testRun.findUnique({
      where: { id: getParam(req, 'id') },
    });

    if (!run) {
      throw new HttpError(404, 'Test run not found');
    }

    await getPrisma().testRun.delete({
      where: { id: getParam(req, 'id') },
    });

    res.status(204).send();
  })
);

/**
 * GET /api/test-runs/:id/results
 * Get test results for a test run
 */
testRunsRouter.get(
  '/:id/results',
  asyncHandler(async (req: Request, res: Response) => {
    const { skip, take } = parsePagination(req);

    const run = await getPrisma().testRun.findUnique({
      where: { id: getParam(req, 'id') },
    });

    if (!run) {
      throw new HttpError(404, 'Test run not found');
    }

    const [results, total] = await Promise.all([
      getPrisma().testResult.findMany({
        where: { testRunId: getParam(req, 'id') },
        skip,
        take,
        orderBy: { createdAt: 'asc' },
        include: {
          testCase: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
        },
      }),
      getPrisma().testResult.count({
        where: { testRunId: getParam(req, 'id') },
      }),
    ]);

    res.json({
      data: results,
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
 * GET /api/test-runs/:id/artifacts
 * Get artifacts for a test run
 */
testRunsRouter.get(
  '/:id/artifacts',
  asyncHandler(async (req: Request, res: Response) => {
    const run = await getPrisma().testRun.findUnique({
      where: { id: getParam(req, 'id') },
    });

    if (!run) {
      throw new HttpError(404, 'Test run not found');
    }

    const artifacts = await getPrisma().artifact.findMany({
      where: { testRunId: getParam(req, 'id') },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ data: artifacts });
  })
);
