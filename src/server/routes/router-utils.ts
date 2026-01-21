/**
 * Router utilities
 *
 * Helper functions for creating async route handlers with error handling.
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger.js';
import type { AsyncRequestHandler } from '../types.js';

/**
 * Wrap async handler with error handling
 */
export function asyncHandler(handler: AsyncRequestHandler): AsyncRequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch((err) => {
      logger.error(err, `Error in ${req.method} ${req.path}`);
      next(err);
    });
  };
}

/**
 * Get a route parameter as a string
 */
export function getParam(req: Request, name: string): string {
  const value = req.params[name];
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

/**
 * Parse pagination parameters
 */
export function parsePagination(req: Request): {
  skip: number;
  take: number;
} {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const skip = (page - 1) * limit;
  return { skip, take: limit };
}

/**
 * Parse filter parameters
 */
export function parseFilters(
  req: Request,
  allowedFilters: string[]
): Record<string, unknown> {
  const filters: Record<string, unknown> = {};

  for (const filter of allowedFilters) {
    if (req.query[filter] !== undefined) {
      filters[filter] = req.query[filter];
    }
  }

  return filters;
}

/**
 * Send paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function sendPaginatedResponse<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number
): void {
  res.json({
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
