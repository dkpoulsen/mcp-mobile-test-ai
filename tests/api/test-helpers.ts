/**
 * Test Helpers
 *
 * Utility functions for API testing including data seeding, assertions, and helpers.
 * Includes automatic test data health checking and regeneration.
 */

import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../src/database/client.js';
import { TestDataHealthService, type HealthCheckConfig, type RegenerationConfig } from '../../src/services/test-data-health/index.js';

/**
 * Test data seeders
 */
export const seeders = {
  /**
   * Create a test device
   */
  async device(prisma: PrismaClient, data: {
    name?: string;
    platform?: 'ios' | 'android';
    osVersion?: string;
   _udid?: string;
    status?: 'online' | 'offline' | 'busy';
  } = {}) {
    return prisma.device.create({
      data: {
        name: data.name ?? 'Test Device',
        platform: data.platform ?? 'android',
        osVersion: data.osVersion ?? '14.0',
        udid: data._udid ?? `test-device-${Date.now()}`,
        status: data.status ?? 'online',
      },
    });
  },

  /**
   * Create a test suite
   */
  async testSuite(prisma: PrismaClient, data: {
    name?: string;
    description?: string | null;
    tags?: string[];
  } = {}) {
    return prisma.testSuite.create({
      data: {
        name: data.name ?? `Test Suite ${Date.now()}`,
        description: data.description ?? null,
        tags: data.tags ?? [],
      },
    });
  },

  /**
   * Create a test case
   */
  async testCase(prisma: PrismaClient, data: {
    testSuiteId: string;
    name?: string;
    description?: string | null;
    enabled?: boolean;
  }) {
    return prisma.testCase.create({
      data: {
        testSuiteId: data.testSuiteId,
        name: data.name ?? `Test Case ${Date.now()}`,
        description: data.description ?? null,
        enabled: data.enabled ?? true,
      },
    });
  },

  /**
   * Create a test run
   */
  async testRun(prisma: PrismaClient, data: {
    testSuiteId: string;
    deviceId: string;
    status?: 'pending' | 'running' | 'completed' | 'failed';
    result?: 'passed' | 'failed' | 'skipped';
  }) {
    return prisma.testRun.create({
      data: {
        testSuiteId: data.testSuiteId,
        deviceId: data.deviceId,
        status: data.status ?? 'pending',
        result: data.result ?? null,
      },
    });
  },

  /**
   * Clean all test data
   */
  async cleanAll(prisma: PrismaClient) {
    // Delete in order of dependencies
    await prisma.testResult.deleteMany({});
    await prisma.testRun.deleteMany({});
    await prisma.testCase.deleteMany({});
    await prisma.testSuite.deleteMany({});
    await prisma.device.deleteMany({});
  },
};

/**
 * API response assertions
 */
export const assertions = {
  /**
   * Assert response has successful status
   */
  assertSuccess(response: Response, expectedStatus = 200): void {
    if (response.status !== expectedStatus) {
      throw new Error(
        `Expected status ${expectedStatus}, got ${response.status}`
      );
    }
  },

  /**
   * Assert response has error status
   */
  assertError(response: Response, expectedStatus?: number): void {
    const status = expectedStatus ?? 400;
    if (response.status < 400 || response.status >= 600) {
      throw new Error(
        `Expected error status (4xx or 5xx), got ${response.status}`
      );
    }
  },

  /**
   * Assert response body contains data
   */
  async assertHasData(response: Response): Promise<unknown> {
    const body = await response.json();
    if (!body.data) {
      throw new Error('Response body missing "data" field');
    }
    return body.data;
  },

  /**
   * Assert response is a paginated list
   */
  async assertPaginated(response: Response): Promise<{
    data: unknown[];
    pagination: { skip: number; take: number; total: number; totalPages: number };
  }> {
    const body = await response.json();
    if (!body.data || !body.pagination) {
      throw new Error('Response body missing "data" or "pagination" field');
    }
    if (typeof body.pagination.total !== 'number') {
      throw new Error('Pagination missing "total" field');
    }
    return body;
  },

  /**
   * Assert response contains error
   */
  async assertHasError(response: Response): Promise<{
    error: string;
    message?: string;
    code?: string;
  }> {
    const body = await response.json();
    if (!body.error) {
      throw new Error('Response body missing "error" field');
    }
    return body;
  },
};

/**
 * Parse response body as JSON
 */
export async function parseJson<T = unknown>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

/**
 * Create a test API client
 */
export function createTestClient(serverUrl: string, options: {
  apiKey?: string;
  bearerToken?: string;
  defaultHeaders?: Record<string, string>;
} = {}) {
  const { apiKey, bearerToken, defaultHeaders = {} } = options;

  return {
    /**
     * Make a GET request
     */
    async get(path: string, headers: Record<string, string> = {}) {
      const requestHeaders = {
        'Content-Type': 'application/json',
        ...defaultHeaders,
        ...headers,
      };

      if (apiKey) requestHeaders['X-API-Key'] = apiKey;
      if (bearerToken) requestHeaders['Authorization'] = `Bearer ${bearerToken}`;

      return fetch(`${serverUrl}${path}`, {
        method: 'GET',
        headers: requestHeaders,
      });
    },

    /**
     * Make a POST request
     */
    async post(path: string, body: unknown, headers: Record<string, string> = {}) {
      const requestHeaders = {
        'Content-Type': 'application/json',
        ...defaultHeaders,
        ...headers,
      };

      if (apiKey) requestHeaders['X-API-Key'] = apiKey;
      if (bearerToken) requestHeaders['Authorization'] = `Bearer ${bearerToken}`;

      return fetch(`${serverUrl}${path}`, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(body),
      });
    },

    /**
     * Make a PUT request
     */
    async put(path: string, body: unknown, headers: Record<string, string> = {}) {
      const requestHeaders = {
        'Content-Type': 'application/json',
        ...defaultHeaders,
        ...headers,
      };

      if (apiKey) requestHeaders['X-API-Key'] = apiKey;
      if (bearerToken) requestHeaders['Authorization'] = `Bearer ${bearerToken}`;

      return fetch(`${serverUrl}${path}`, {
        method: 'PUT',
        headers: requestHeaders,
        body: JSON.stringify(body),
      });
    },

    /**
     * Make a PATCH request
     */
    async patch(path: string, body: unknown, headers: Record<string, string> = {}) {
      const requestHeaders = {
        'Content-Type': 'application/json',
        ...defaultHeaders,
        ...headers,
      };

      if (apiKey) requestHeaders['X-API-Key'] = apiKey;
      if (bearerToken) requestHeaders['Authorization'] = `Bearer ${bearerToken}`;

      return fetch(`${serverUrl}${path}`, {
        method: 'PATCH',
        headers: requestHeaders,
        body: JSON.stringify(body),
      });
    },

    /**
     * Make a DELETE request
     */
    async delete(path: string, headers: Record<string, string> = {}) {
      const requestHeaders = {
        'Content-Type': 'application/json',
        ...defaultHeaders,
        ...headers,
      };

      if (apiKey) requestHeaders['X-API-Key'] = apiKey;
      if (bearerToken) requestHeaders['Authorization'] = `Bearer ${bearerToken}`;

      return fetch(`${serverUrl}${path}`, {
        method: 'DELETE',
        headers: requestHeaders,
      });
    },
  };
}

/**
 * Retry utility for flaky tests
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; delay?: number; backoff?: number } = {}
): Promise<T> {
  const { maxAttempts = 3, delay = 100, backoff = 2 } = options;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(backoff, attempt)));
      }
    }
  }

  throw lastError;
}

/**
 * Get test Prisma client
 */
export function getTestPrisma(): PrismaClient {
  return getPrismaClient();
}

/**
 * Clean database before/after tests
 */
export async function cleanDatabase(): Promise<void> {
  const prisma = getTestPrisma();
  await seeders.cleanAll(prisma);
}

/**
 * Cached health service instance
 */
let healthService: TestDataHealthService | null = null;

/**
 * Get the test data health service instance
 */
export function getHealthService(config?: HealthCheckConfig): TestDataHealthService {
  if (!healthService) {
    healthService = new TestDataHealthService(getTestPrisma(), config);
  }
  return healthService;
}

/**
 * Check test data health and auto-regenerate if needed
 * Returns true if data was regenerated, false if data was healthy
 */
export async function ensureHealthyTestData(config?: HealthCheckConfig): Promise<boolean> {
  const service = getHealthService(config);
  const result = await service.autoRegenerateIfNeeded();
  return result !== null;
}

/**
 * Force regeneration of all test data
 */
export async function regenerateTestData(config?: RegenerationConfig): Promise<void> {
  const service = getHealthService();
  await service.regenerateData(config);
}

/**
 * Check test data health without regenerating
 */
export async function checkTestDataHealth(config?: HealthCheckConfig) {
  const service = getHealthService(config);
  return service.checkHealth();
}

/**
 * Reset test database to clean state (no data)
 */
export async function resetToCleanState(): Promise<void> {
  const service = getHealthService();
  await service.resetToClean();
}

/**
 * Setup fixture that ensures healthy test data before tests
 * Usage in test files:
 *   test.beforeEach(async () => await setupHealthyTestData());
 */
export async function setupHealthyTestData(options?: {
  /** If true, regenerates data even if existing data is healthy */
  forceRegenerate?: boolean;
  /** Health check configuration */
  healthConfig?: HealthCheckConfig;
  /** Regeneration configuration */
  regenerationConfig?: RegenerationConfig;
}): Promise<void> {
  const { forceRegenerate = false, healthConfig, regenerationConfig } = options ?? {};

  if (forceRegenerate) {
    await regenerateTestData(regenerationConfig);
  } else {
    await ensureHealthyTestData(healthConfig);
  }
}

/**
 * Teardown fixture that cleans test data after tests
 * Usage in test files:
 *   test.afterEach(async () => await teardownHealthyTestData());
 */
export async function teardownHealthyTestData(options?: {
  /** If true, performs health check before cleaning */
  checkHealth?: boolean;
  /** If true, resets to clean state instead of just cleaning */
  fullReset?: boolean;
}): Promise<void> {
  const { checkHealth = true, fullReset = false } = options ?? {};

  if (checkHealth) {
    const health = await checkTestDataHealth();
    // Log health status for debugging
    if (health.totalIssues > 0) {
      console.warn(`[TestDataHealth] Found ${health.totalIssues} issues during teardown`);
    }
  }

  if (fullReset) {
    await resetToCleanState();
  } else {
    await cleanDatabase();
  }
}
