/**
 * Not Found Handler Middleware
 *
 * Handles requests to undefined routes.
 */

import type { Request, Response, NextFunction } from 'express';

/**
 * Not found response body
 */
interface NotFoundResponse {
  error: string;
  message: string;
  path: string;
  method: string;
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const response: NotFoundResponse = {
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
    path: req.path,
    method: req.method,
  };

  res.status(404).json(response);
}
