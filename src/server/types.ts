/**
 * API Server Types
 */

import type { Request, Response, NextFunction } from 'express';
import type { Logger } from '../utils/logger.js';
import type { PrismaClient } from '@prisma/client';

/**
 * Extended Request type with id property
 */
export interface ExtendedRequest extends Request {
  id?: string;
}

/**
 * Server configuration options
 */
export interface ServerConfig {
  /**
   * Port to listen on
   */
  port: number;

  /**
   * Host to bind to
   */
  host?: string;

  /**
   * Enable CORS
   */
  enableCors?: boolean;

  /**
   * Enable Helmet security headers
   */
  enableHelmet?: boolean;

  /**
   * API key for authentication (optional)
   */
  apiKey?: string;

  /**
   * Bearer token for JWT authentication (optional)
   */
  bearerToken?: string;

  /**
   * Enable request logging
   */
  enableRequestLogging?: boolean;

  /**
   * Request timeout in milliseconds
   */
  requestTimeout?: number;

  /**
   * Maximum request body size
   */
  maxBodySize?: string;

  /**
   * Trust proxy headers
   */
  trustProxy?: boolean | string | string[];

  /**
   * CORS origins (if enableCors is true)
   */
  corsOrigins?: string | string[];

  /**
   * Logger instance
   */
  logger?: Logger;
}

/**
 * Express request with authenticated user info
 */
export interface AuthenticatedRequest extends ExtendedRequest {
  /**
   * User ID extracted from authentication
   */
  userId?: string;

  /**
   * Authentication type used ('api-key' or 'bearer')
   */
  authType?: 'api-key' | 'bearer';
}

/**
 * Request handler with error support
 */
export type AsyncRequestHandler<
  Req = Request,
  Res = Response,
  Next = NextFunction
> = (req: Req, res: Res, next: Next) => Promise<void> | void;

/**
 * Server error handler
 */
export type ServerErrorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => void;

/**
 * Not found handler
 */
export type NotFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => void;

/**
 * Server dependencies
 */
export interface ServerDependencies {
  prisma: PrismaClient;
  logger?: Logger;
}
