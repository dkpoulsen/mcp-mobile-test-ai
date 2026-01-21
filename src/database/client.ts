/**
 * Prisma Client singleton for database connections
 * Manages connection lifecycle and provides a single instance throughout the application
 */

import { PrismaClient } from '@prisma/client';
import type { Logger } from '../utils/logger.js';

export type { PrismaClient };

/**
 * Global prisma instance type extension
 */
declare global {
  var prisma: PrismaClient | undefined;
}

/**
 * Database client configuration options
 */
export interface DatabaseClientOptions {
  /**
   * Logger instance for database operations
   */
  logger?: Logger;

  /**
   * Enable query logging
   */
  logQueries?: boolean;

  /**
   * Maximum connection pool size
   */
  maxPoolSize?: number;

  /**
   * Connection timeout in seconds
   */
  connectionTimeout?: number;
}

/**
 * Creates a new Prisma Client instance with configured options
 */
function createPrismaClient(options: DatabaseClientOptions = {}): PrismaClient {
  const { logQueries = false } = options;

  return new PrismaClient({
    log: logQueries ? ['query', 'error', 'warn'] as const : ['error', 'warn'] as const,
  });
}

/**
 * Returns the singleton Prisma Client instance
 * Creates a new instance if one doesn't exist
 */
export function getPrismaClient(options?: DatabaseClientOptions): PrismaClient {
  if (!global.prisma) {
    global.prisma = createPrismaClient(options);

    // Set up logging if a logger is provided
    if (options?.logger) {
      const { logger } = options;

      global.prisma.$on('query' as never, (e: any) => {
        logger.debug(`Query: ${e.query}`, { duration: e.duration, params: e.params });
      });

      global.prisma.$on('error' as never, (e: any) => {
        logger.error(`Database error: ${e.message}`);
      });

      global.prisma.$on('warn' as never, (e: any) => {
        logger.warn(`Database warning: ${e.message}`);
      });
    }
  }

  return global.prisma;
}

/**
 * Disconnects the Prisma Client
 * Should be called on application shutdown
 */
export async function disconnectDatabase(): Promise<void> {
  if (global.prisma) {
    await global.prisma.$disconnect();
    global.prisma = undefined;
  }
}

/**
 * Resets the Prisma Client connection
 * Useful for testing or when connection needs to be refreshed
 */
export async function resetDatabaseConnection(options?: DatabaseClientOptions): Promise<void> {
  await disconnectDatabase();
  getPrismaClient(options);
}

/**
 * Health check for database connection
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const prisma = getPrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Executes a callback within a transaction
 */
export async function executeTransaction<T>(
  callback: (prisma: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>) => Promise<T>,
  options?: DatabaseClientOptions
): Promise<T> {
  const prisma = getPrismaClient(options);
  return prisma.$transaction(callback) as Promise<T>;
}
