/**
 * Redis connection management for Bull queues
 */

import IoRedis from 'ioredis';
import { config } from '../config/env.js';

/**
 * Redis client cache
 */
let redisClient: IoRedis.default | null = null;
let redisSubscriber: IoRedis.default | null = null;

/**
 * Redis connection options
 */
interface RedisConnectionOptions {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  tls?: boolean;
  maxRetriesPerRequest?: number;
  retryStrategy?: (times: number) => number | void;
  reconnectOnError?: (error: Error) => boolean | 1 | 2;
}

/**
 * Create a Redis connection configuration
 */
function createRedisConfig(): RedisConnectionOptions {
  // If REDIS_URL is set and not the default, use it
  if (config.REDIS_URL && config.REDIS_URL !== 'redis://localhost:6379') {
    // Parse the URL and return options
    try {
      const url = new URL(config.REDIS_URL);
      return {
        host: url.hostname,
        port: parseInt(url.port) || 6379,
        password: url.password || undefined,
        db: parseInt(url.pathname.slice(1)) || 0,
        tls: url.protocol === 'rediss:',
      };
    } catch {
      // If URL parsing fails, fall back to individual config
    }
  }

  // Use individual configuration options
  return {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD,
    db: config.REDIS_DB,
    tls: config.REDIS_TLS,
  };
}

/**
 * Get or create a Redis client
 * This client is used for standard queue operations
 */
export function getRedisClient(): IoRedis.default {
  if (!redisClient || redisClient.status === 'end') {
    const redisConfig = createRedisConfig();

    redisClient = new IoRedis.default({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.db,
      tls: redisConfig.tls ? {} : undefined,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 100, 3000);
        return delay;
      },
      reconnectOnError: (err: Error) => {
        // Reconnect on certain errors
        const targetErrors = ['READONLY', 'ECONNRESET'];
        return targetErrors.some((e) => err.message.includes(e));
      },
      // Enable offline queue for commands sent before connection
      enableOfflineQueue: true,
      // Lazy connect to avoid immediate connection attempts
      lazyConnect: false,
    });

    redisClient.on('error', (err: Error) => {
      console.error('Redis client error:', err);
    });

    redisClient.on('connect', () => {
      console.info('Redis client connected');
    });

    redisClient.on('disconnect', () => {
      console.warn('Redis client disconnected');
    });

    redisClient.on('reconnecting', () => {
      console.info('Redis client reconnecting...');
    });
  }

  return redisClient;
}

/**
 * Get or create a Redis subscriber client
 * This client is used for Bull's pub/sub functionality
 */
export function getRedisSubscriber(): IoRedis.default {
  if (!redisSubscriber || redisSubscriber.status === 'end') {
    const redisConfig = createRedisConfig();

    redisSubscriber = new IoRedis.default({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.db,
      tls: redisConfig.tls ? {} : undefined,
      maxRetriesPerRequest: null, // Required for subscriber
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 100, 3000);
        return delay;
      },
      enableOfflineQueue: true,
      lazyConnect: false,
    });

    redisSubscriber.on('error', (err: Error) => {
      console.error('Redis subscriber error:', err);
    });
  }

  return redisSubscriber;
}

/**
 * Close all Redis connections
 */
export async function closeRedisConnections(): Promise<void> {
  const closePromises: Promise<unknown>[] = [];

  if (redisClient && redisClient.status !== 'end') {
    closePromises.push(
      redisClient.quit().catch((err) => {
        console.error('Error closing Redis client:', err);
      })
    );
  }

  if (redisSubscriber && redisSubscriber.status !== 'end') {
    closePromises.push(
      redisSubscriber.quit().catch((err) => {
        console.error('Error closing Redis subscriber:', err);
      })
    );
  }

  await Promise.all(closePromises);

  redisClient = null;
  redisSubscriber = null;
}

/**
 * Test Redis connection
 */
export async function testRedisConnection(): Promise<boolean> {
  try {
    const client = getRedisClient();
    const result = await client.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Get Redis connection info for debugging
 */
export function getRedisConnectionInfo(): {
  clientStatus: string;
  subscriberStatus: string;
  config: ReturnType<typeof createRedisConfig>;
} {
  return {
    clientStatus: redisClient?.status || 'not-initialized',
    subscriberStatus: redisSubscriber?.status || 'not-initialized',
    config: createRedisConfig(),
  };
}
