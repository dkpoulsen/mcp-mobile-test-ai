/**
 * Request Logger Middleware
 *
 * Logs incoming HTTP requests.
 */

import type { Response, NextFunction } from 'express';
import type { ExtendedRequest } from '../types.js';
import { logger } from '../../utils/logger.js';

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Request logger middleware
 */
export function requestLogger(
  req: ExtendedRequest,
  res: Response,
  next: NextFunction
): void {
  // Add request ID
  req.id = generateRequestId();

  // Get request start time
  const startTime = Date.now();

  // Log request
  logger.info({
    requestId: req.id,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  }, 'Incoming request');

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const { statusCode } = res;

    const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    logger[logLevel]({
      requestId: req.id,
      method: req.method,
      path: req.path,
      statusCode,
      duration,
    }, 'Request completed');
  });

  next();
}
