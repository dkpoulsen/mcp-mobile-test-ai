/**
 * Test Server Setup
 *
 * Provides utilities for starting and stopping the Express server during API tests.
 * Handles test database isolation and cleanup.
 */

import { describe, before, after } from 'node:test';
import type { Express } from 'express';
import { createServer } from '../../src/server/factory.js';
import type { ServerConfig, ServerDependencies } from '../../src/server/types.js';
import { getPrismaClient, disconnectDatabase } from '../../src/database/client.js';

/**
 * Test server instance
 */
export interface TestServerInstance {
  /**
   * Express app instance
   */
  app: Express;

  /**
   * Server URL (base URL for making requests)
   */
  serverUrl: string;

  /**
   * Original ExpressServer instance
   */
  server: ReturnType<typeof createServer>;

  /**
   * Start the server
   */
  start: () => Promise<void>;

  /**
   * Stop the server
   */
  stop: () => Promise<void>;
}

/**
 * Test server options
 */
export interface TestServerOptions {
  /**
   * Port to run the test server on
   */
  port?: number;

  /**
   * Host to bind to
   */
  host?: string;

  /**
   * Enable authentication
   */
  enableAuth?: boolean;

  /**
   * API key for authentication
   */
  apiKey?: string;

  /**
   * Bearer token for authentication
   */
  bearerToken?: string;
}

/**
 * Default test server options
 */
const DEFAULT_TEST_SERVER_OPTIONS: Required<TestServerOptions> = {
  port: parseInt(process.env.TEST_SERVER_PORT || '3001', 10),
  host: '127.0.0.1',
  enableAuth: false,
  apiKey: undefined,
  bearerToken: undefined,
};

/**
 * Global test server instance
 */
let globalTestServer: TestServerInstance | null = null;

/**
 * Create a test server instance
 */
export function createTestServer(options: TestServerOptions = {}): TestServerInstance {
  const opts = { ...DEFAULT_TEST_SERVER_OPTIONS, ...options };
  const prisma = getPrismaClient();

  const serverConfig: ServerConfig = {
    port: opts.port,
    host: opts.host,
    enableCors: true,
    enableHelmet: false, // Disable for testing
    enableRequestLogging: false, // Disable for cleaner test output
    apiKey: opts.apiKey,
    bearerToken: opts.bearerToken,
  };

  const dependencies: ServerDependencies = {
    prisma,
  };

  const server = createServer(serverConfig, dependencies);
  const app = server.getApp();

  return {
    app,
    serverUrl: `http://${opts.host}:${opts.port}`,
    server,
    async start() {
      await server.start();
    },
    async stop() {
      await server.stop();
    },
  };
}

/**
 * Setup test server for a test suite
 *
 * Usage:
 * ```ts
 * import { withTestServer } from './test-server.js';
 *
 * describe('My API Tests', () => {
 *   const { serverUrl, app } = withTestServer();
 *
 *   it('should make requests', async () => {
 *     const response = await fetch(`${serverUrl}/health`);
 *     // ...
 *   });
 * });
 * ```
 */
export function withTestServer(options: TestServerOptions = {}): {
  serverUrl: string;
  app: Express;
} {
  let serverInstance: TestServerInstance | null = null;

  before(async () => {
    // Use global server if already running with same config
    const opts = { ...DEFAULT_TEST_SERVER_OPTIONS, ...options };
    const expectedServerUrl = `http://${opts.host}:${opts.port}`;

    if (globalTestServer && globalTestServer.serverUrl === expectedServerUrl) {
      return;
    }

    // Create and start new server
    serverInstance = createTestServer(options);
    await serverInstance.start();
    globalTestServer = serverInstance;
  });

  after(async () => {
    // Only stop if it's not the global server
    // Global server cleanup happens in afterAll()
  });

  // Return a proxy that accesses the global server
  return {
    get serverUrl() {
      return globalTestServer?.serverUrl ?? '';
    },
    get app() {
      return globalTestServer?.app ?? ({} as Express);
    },
  };
}

/**
 * Setup global test server (called once before all tests)
 */
export async function setupGlobalTestServer(
  options: TestServerOptions = {}
): Promise<TestServerInstance> {
  if (globalTestServer) {
    return globalTestServer;
  }

  globalTestServer = createTestServer(options);
  await globalTestServer.start();
  return globalTestServer;
}

/**
 * Teardown global test server (called once after all tests)
 */
export async function teardownGlobalTestServer(): Promise<void> {
  if (globalTestServer) {
    await globalTestServer.stop();
    globalTestServer = null;
  }

  // Also disconnect Prisma
  await disconnectDatabase();
}

/**
 * Get the global test server instance
 */
export function getGlobalTestServer(): TestServerInstance | null {
  return globalTestServer;
}

/**
 * Utility to make authenticated API requests
 */
export async function makeAuthenticatedRequest(
  serverUrl: string,
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    apiKey?: string;
    bearerToken?: string;
    headers?: Record<string, string>;
  } = {}
): Promise<Response> {
  const { method = 'GET', body, apiKey, bearerToken, headers = {} } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (apiKey) {
    requestHeaders['X-API-Key'] = apiKey;
  }
  if (bearerToken) {
    requestHeaders['Authorization'] = `Bearer ${bearerToken}`;
  }

  const response = await fetch(`${serverUrl}${path}`, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  return response;
}

/**
 * Wait for server to be ready
 */
export async function waitForServer(
  serverUrl: string,
  options: { timeout?: number; interval?: number } = {}
): Promise<boolean> {
  const { timeout = 5000, interval = 100 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`${serverUrl}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        return true;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  return false;
}
