/**
 * Error Handler Middleware
 *
 * Global error handling middleware for the Express server.
 */

import type { Request, Response, NextFunction } from 'express';
import type { ExtendedRequest } from '../types.js';
import { logger } from '../../utils/logger.js';

/**
 * HTTP error class
 */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Validate error is an HttpError
 */
function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

/**
 * Error response body
 */
interface ErrorResponse {
  error: string;
  message: string;
  code?: string;
  stack?: string;
  requestId?: string;
}

/**
 * Global error handler middleware
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error
  logger.error(err, `Error processing ${req.method} ${req.path}`);

  // Determine status code
  const statusCode = isHttpError(err) ? err.statusCode : 500;

  // Build error response
  const errorResponse: ErrorResponse = {
    error: isHttpError(err) ? getErrorName(err.statusCode) : 'Internal Server Error',
    message: err.message,
  };

  // Add error code if present
  if (isHttpError(err) && err.code) {
    errorResponse.code = err.code;
  }

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development' && err.stack) {
    errorResponse.stack = err.stack;
  }

  // Add request ID if present
  const extReq = req as ExtendedRequest;
  if (extReq.id) {
    errorResponse.requestId = extReq.id;
  }

  res.status(statusCode).json(errorResponse);
}

/**
 * Get HTTP error name from status code
 */
function getErrorName(statusCode: number): string {
  const errorNames: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
  };

  return errorNames[statusCode] || 'Error';
}
