/**
 * Authentication Middleware
 *
 * Provides API key and Bearer token authentication.
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger.js';
import type { AuthenticatedRequest } from '../types.js';

/**
 * Authentication configuration
 */
export interface AuthenticationConfig {
  /**
   * API key to validate
   */
  apiKey?: string;

  /**
   * Bearer token to validate
   */
  bearerToken?: string;
}

/**
 * Extract token from Authorization header
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1] ?? null;
}

/**
 * Extract API key from X-API-Key header
 */
function extractApiKey(req: Request): string | null {
  // Check X-API-Key header
  const apiKeyFromHeader = req.headers['x-api-key'];
  if (typeof apiKeyFromHeader === 'string') {
    return apiKeyFromHeader;
  }
  if (Array.isArray(apiKeyFromHeader) && apiKeyFromHeader.length > 0) {
    return apiKeyFromHeader[0] ?? null;
  }

  // Check query parameter
  const apiKeyFromQuery = req.query.api_key;
  if (typeof apiKeyFromQuery === 'string') {
    return apiKeyFromQuery;
  }

  return null;
}

/**
 * Authentication middleware factory
 *
 * Validates API key or Bearer token from request headers
 */
export function authenticationMiddleware(config: AuthenticationConfig) {
  const { apiKey, bearerToken } = config;

  // If no auth configured, skip middleware
  if (!apiKey && !bearerToken) {
    return (_req: Request, _res: Response, next: NextFunction) => {
      next();
    };
  }

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    let isAuthenticated = false;
    let authType: 'api-key' | 'bearer' | undefined;

    // Check Bearer token first
    if (bearerToken) {
      const token = extractBearerToken(req.headers.authorization);
      if (token && token === bearerToken) {
        isAuthenticated = true;
        authType = 'bearer';
      }
    }

    // Check API key
    if (!isAuthenticated && apiKey) {
      const key = extractApiKey(req);
      if (key && key === apiKey) {
        isAuthenticated = true;
        authType = 'api-key';
      }
    }

    if (!isAuthenticated) {
      logger.warn('Unauthorized access attempt', {
        ip: req.ip,
        path: req.path,
        method: req.method,
      });

      res.status(401).json({
        error: 'Unauthorized',
        message: 'Valid authentication credentials required',
      });
      return;
    }

    // Attach auth info to request
    req.authType = authType;
    req.userId = authType; // Use authType as userId for now

    next();
  };
}
