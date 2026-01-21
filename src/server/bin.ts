#!/usr/bin/env node
/**
 * API Server CLI
 *
 * Entry point for running the Express API server
 */

import { getPrismaClient } from '../database/client.js';
import { createServer } from './index.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';

/**
 * Get server configuration from environment variables
 */
function getServerConfig() {
  return {
    port: parseInt(process.env.API_PORT || '3000'),
    host: process.env.API_HOST || '0.0.0.0',
    enableCors: process.env.API_ENABLE_CORS !== 'false',
    enableHelmet: process.env.API_ENABLE_HELMET !== 'false',
    apiKey: process.env.API_KEY,
    bearerToken: process.env.API_BEARER_TOKEN,
    enableRequestLogging: process.env.API_ENABLE_REQUEST_LOGGING !== 'false',
    requestTimeout: parseInt(process.env.API_REQUEST_TIMEOUT || '30000'),
    maxBodySize: process.env.API_MAX_BODY_SIZE || '1mb',
    trustProxy: process.env.API_TRUST_PROXY === 'true' ? true : process.env.API_TRUST_PROXY,
    corsOrigins: process.env.API_CORS_ORIGINS?.split(',') || '*',
  };
}

/**
 * Main server startup function
 */
async function main(): Promise<void> {
  try {
    const serverConfig = getServerConfig();
    const prisma = getPrismaClient();

    logger.info('Starting MCP Mobile Test AI API server...', {
      port: serverConfig.port,
      host: serverConfig.host,
      nodeEnv: config.NODE_ENV,
    });

    const server = createServer(serverConfig, { prisma, logger });

    // Graceful shutdown handlers
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      await server.stop();
      await prisma.$disconnect();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (err: Error) => {
      logger.error(err, 'Uncaught exception');
      shutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason: unknown) => {
      logger.error({ reason: String(reason) }, 'Unhandled rejection');
      shutdown('UNHANDLED_REJECTION');
    });

    await server.start();

  } catch (error) {
    logger.error(error instanceof Error ? error : new Error(String(error)), 'Failed to start server');
    process.exit(1);
  }
}

// Start the server
main();
