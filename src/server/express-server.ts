/**
 * Express Server
 *
 * Main Express server with middleware, routes, and error handling.
 */

import type {
  Request,
  Response,
  NextFunction,
} from 'express';
import express from 'express';
import type { Server } from 'node:http';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerConfig, ServerDependencies } from './types.js';
import { logger } from '../utils/logger.js';
import { authenticationMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { requestLogger } from './middleware/request-logger.js';
import { testSuitesRouter } from './routes/test-suites.js';
import { testCasesRouter } from './routes/test-cases.js';
import { testRunsRouter } from './routes/test-runs.js';
import { devicesRouter } from './routes/devices.js';
import { healthRouter } from './routes/health.js';
import { failureAnalysisRouter } from './routes/failure-analysis.js';
import { securityScansRouter } from './routes/security-scans.js';
import { testOptimizationRouter } from './routes/test-optimization.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Express Server class
 */
export class ExpressServer {
  private app: express.Application;
  private server?: Server;
  private config: ServerConfig;

  constructor(config: ServerConfig, _dependencies: ServerDependencies) {
    this.config = config;
    this.app = express();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandlers();
  }

  /**
   * Setup middleware
   */
  private setupMiddleware(): void {
    const app = this.app;

    // Trust proxy
    if (this.config.trustProxy) {
      app.set('trust proxy', this.config.trustProxy);
    }

    // Security headers
    if (this.config.enableHelmet !== false) {
      app.use(helmet({
        contentSecurityPolicy: false, // Disable for API-only
      }));
    }

    // CORS
    if (this.config.enableCors !== false) {
      app.use(cors({
        origin: this.config.corsOrigins || '*',
        credentials: true,
      }));
    }

    // Body parsing
    app.use(express.json({ limit: this.config.maxBodySize || '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: this.config.maxBodySize || '1mb' }));

    // Request logging
    if (this.config.enableRequestLogging !== false) {
      app.use(requestLogger);
    }

    // Authentication middleware (if configured)
    if (this.config.apiKey || this.config.bearerToken) {
      app.use(authenticationMiddleware({
        apiKey: this.config.apiKey,
        bearerToken: this.config.bearerToken,
      }));
    }
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    const app = this.app;

    // Health check (no auth required)
    app.use('/health', healthRouter);

    // API routes
    app.use('/api/test-suites', testSuitesRouter);
    app.use('/api/test-cases', testCasesRouter);
    app.use('/api/test-runs', testRunsRouter);
    app.use('/api/devices', devicesRouter);
    app.use('/api/failure-analysis', failureAnalysisRouter);
    app.use('/api/security-scans', securityScansRouter);
    app.use('/api/test-optimization', testOptimizationRouter);

    // Serve dashboard frontend (production)
    const dashboardDistPath = path.join(__dirname, '../../dashboard/dist');
    app.use(express.static(dashboardDistPath));

    // Root endpoint - redirect to dashboard
    app.get('/', (_req: Request, res: Response) => {
      res.sendFile(path.join(dashboardDistPath, 'index.html'));
    });

    // SPA fallback - redirect all non-API routes to index.html
    app.get(/^((?!api|health).)*$/, (_req: Request, res: Response) => {
      res.sendFile(path.join(dashboardDistPath, 'index.html'));
    });
  }

  /**
   * Setup error handlers
   */
  private setupErrorHandlers(): void {
    const app = this.app;

    // 404 handler
    app.use(notFoundHandler);

    // Error handler
    app.use(errorHandler);
  }

  /**
   * Get the Express app instance
   */
  getApp(): express.Application {
    return this.app;
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const port = this.config.port;
      const host = this.config.host || '0.0.0.0';

      this.server = this.app.listen(port, host, () => {
        logger.info(`Server listening on http://${host}:${port}`);
        resolve();
      });

      this.server.on('error', (err: Error) => {
        logger.error('Server error:', err);
        reject(err);
      });

      // Handle request timeout
      if (this.config.requestTimeout) {
        this.app.use((_req: Request, res: Response, next: NextFunction) => {
          res.setTimeout(this.config.requestTimeout!, () => {
            if (!res.headersSent) {
              res.status(503).json({
                error: 'Service Unavailable',
                message: 'Request timeout',
              });
            }
          });
          next();
        });
      }
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err) => {
        if (err) {
          logger.error('Error closing server:', err);
          reject(err);
        } else {
          logger.info('Server closed');
          resolve();
        }
      });
    });
  }
}
