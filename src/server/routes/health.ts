/**
 * Health check routes
 */

import type { Router, Request, Response } from 'express';
import { Router as expressRouter } from 'express';
import { asyncHandler } from './router-utils.js';
import { healthCheck } from '../../database/client.js';

/**
 * Health check router
 */
export const healthRouter: Router = expressRouter();

/**
 * GET /health
 * Basic health check endpoint
 */
healthRouter.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const dbHealth = await healthCheck();

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: dbHealth ? 'connected' : 'disconnected',
    });
  })
);

/**
 * GET /health/ready
 * Readiness probe
 */
healthRouter.get(
  '/ready',
  asyncHandler(async (_req: Request, res: Response) => {
    const dbHealth = await healthCheck();

    if (!dbHealth) {
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
      });
      return;
    }

    res.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /health/live
 * Liveness probe
 */
healthRouter.get(
  '/live',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      status: 'alive',
      timestamp: new Date().toISOString(),
    });
  })
);
