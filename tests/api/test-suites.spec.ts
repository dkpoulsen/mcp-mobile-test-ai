/**
 * Test Suites API Tests
 *
 * Tests the test suites management endpoints
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { withTestServer, teardownGlobalTestServer } from './test-server.js';
import { createTestClient, seeders, cleanDatabase, assertions, getTestPrisma } from './test-helpers.js';

describe('Test Suites API', () => {
  const { serverUrl } = withTestServer();
  const client = createTestClient(serverUrl);
  const prisma = getTestPrisma();

  before(async () => {
    await cleanDatabase();
  });

  after(async () => {
    await cleanDatabase();
  });

  describe('GET /api/test-suites', () => {
    it('should return empty array when no suites exist', async () => {
      await cleanDatabase();

      const response = await client.get('/api/test-suites');

      assertions.assertSuccess(response);
      const result = await assertions.assertPaginated(response);

      assert.strictEqual(result.data.length, 0);
      assert.strictEqual(result.pagination.total, 0);
    });

    it('should return list of test suites', async () => {
      await cleanDatabase();

      // Create test suites
      await seeders.testSuite(prisma, { name: 'Suite 1' });
      await seeders.testSuite(prisma, { name: 'Suite 2' });

      const response = await client.get('/api/test-suites');

      assertions.assertSuccess(response);
      const result = await assertions.assertPaginated(response);

      assert.strictEqual(result.data.length, 2);
      assert.strictEqual(result.pagination.total, 2);
    });

    it('should support pagination', async () => {
      await cleanDatabase();

      // Create multiple test suites
      for (let i = 0; i < 5; i++) {
        await seeders.testSuite(prisma, { name: `Suite ${i}` });
      }

      const response = await client.get('/api/test-suites?skip=2&take=2');

      assertions.assertSuccess(response);
      const result = await assertions.assertPaginated(response);

      assert.strictEqual(result.data.length, 2);
      assert.strictEqual(result.pagination.skip, 2);
      assert.strictEqual(result.pagination.take, 2);
      assert.strictEqual(result.pagination.total, 5);
      assert.strictEqual(result.pagination.totalPages, 3);
    });

    it('should filter by tags', async () => {
      await cleanDatabase();

      await seeders.testSuite(prisma, {
        name: 'Tagged Suite 1',
        tags: ['smoke', 'critical'],
      });
      await seeders.testSuite(prisma, {
        name: 'Tagged Suite 2',
        tags: ['regression'],
      });
      await seeders.testSuite(prisma, {
        name: 'Untagged Suite',
        tags: [],
      });

      const response = await client.get('/api/test-suites?tags=smoke');

      assertions.assertSuccess(response);
      const result = await assertions.assertPaginated(response);

      assert.strictEqual(result.data.length, 1);
      assert.strictEqual((result.data[0] as { name: string }).name, 'Tagged Suite 1');
    });
  });

  describe('GET /api/test-suites/:id', () => {
    it('should return 404 for non-existent suite', async () => {
      const response = await client.get('/api/test-suites/non-existent-id');

      assert.strictEqual(response.status, 404);
    });

    it('should return a single test suite', async () => {
      await cleanDatabase();

      const suite = await seeders.testSuite(prisma, {
        name: 'Test Suite',
        description: 'A test suite',
      });

      const response = await client.get(`/api/test-suites/${suite.id}`);

      assertions.assertSuccess(response);
      const data = await assertions.assertHasData(response) as {
        id: string;
        name: string;
        description: string | null;
        tags: string[];
      };

      assert.strictEqual(data.id, suite.id);
      assert.strictEqual(data.name, 'Test Suite');
      assert.strictEqual(data.description, 'A test suite');
    });

    it('should include test cases and test runs', async () => {
      await cleanDatabase();

      const device = await seeders.device(prisma);
      const suite = await seeders.testSuite(prisma);
      await seeders.testCase(prisma, { testSuiteId: suite.id });
      await seeders.testRun(prisma, {
        testSuiteId: suite.id,
        deviceId: device.id,
      });

      const response = await client.get(`/api/test-suites/${suite.id}`);

      assertions.assertSuccess(response);
      const data = await assertions.assertHasData(response) as {
        testCases: unknown[];
        testRuns: unknown[];
      };

      assert.ok(Array.isArray(data.testCases));
      assert.ok(Array.isArray(data.testRuns));
      assert.strictEqual(data.testCases.length, 1);
      assert.strictEqual(data.testRuns.length, 1);
    });
  });

  describe('POST /api/test-suites', () => {
    it('should create a new test suite', async () => {
      await cleanDatabase();

      const response = await client.post('/api/test-suites', {
        name: 'New Test Suite',
        description: 'A new test suite',
        tags: ['smoke'],
      });

      assert.strictEqual(response.status, 201);
      const data = await assertions.assertHasData(response) as {
        id: string;
        name: string;
      };

      assert.strictEqual(data.name, 'New Test Suite');
      assert.ok(data.id);
    });

    it('should return 400 when name is missing', async () => {
      const response = await client.post('/api/test-suites', {
        description: 'Missing name',
      });

      assert.strictEqual(response.status, 400);
      const body = await assertions.assertHasError(response);
      assert.ok(body.message?.includes('name'));
    });

    it('should create suite with empty tags', async () => {
      await cleanDatabase();

      const response = await client.post('/api/test-suites', {
        name: 'No Tags Suite',
      });

      assertions.assertSuccess(response);
      const data = await assertions.assertHasData(response) as { tags: string[] };

      assert.deepStrictEqual(data.tags, []);
    });
  });

  describe('PATCH /api/test-suites/:id', () => {
    it('should update test suite description', async () => {
      await cleanDatabase();

      const suite = await seeders.testSuite(prisma, {
        name: 'Original Suite',
        description: 'Original description',
      });

      const response = await client.patch(`/api/test-suites/${suite.id}`, {
        description: 'Updated description',
      });

      assertions.assertSuccess(response);
      const data = await assertions.assertHasData(response) as {
        description: string | null;
      };

      assert.strictEqual(data.description, 'Updated description');
    });

    it('should update test suite tags', async () => {
      await cleanDatabase();

      const suite = await seeders.testSuite(prisma, {
        name: 'Tag Suite',
        tags: ['original'],
      });

      const response = await client.patch(`/api/test-suites/${suite.id}`, {
        tags: ['updated', 'tags'],
      });

      assertions.assertSuccess(response);
      const data = await assertions.assertHasData(response) as { tags: string[] };

      assert.deepStrictEqual(data.tags, ['updated', 'tags']);
    });
  });

  describe('DELETE /api/test-suites/:id', () => {
    it('should delete a test suite', async () => {
      await cleanDatabase();

      const suite = await seeders.testSuite(prisma);

      const response = await client.delete(`/api/test-suites/${suite.id}`);

      assert.strictEqual(response.status, 204);

      // Verify it's deleted
      const getResponse = await client.get(`/api/test-suites/${suite.id}`);
      assert.strictEqual(getResponse.status, 404);
    });
  });

  describe('GET /api/test-suites/stats/summary', () => {
    it('should return test suite statistics', async () => {
      await cleanDatabase();

      await seeders.testSuite(prisma, { tags: ['tag1'] });
      await seeders.testSuite(prisma, { tags: ['tag2'] });
      await seeders.testSuite(prisma, { tags: [] });

      const response = await client.get('/api/test-suites/stats/summary');

      assertions.assertSuccess(response);
      const data = await assertions.assertHasData(response) as {
        total: number;
        withTags: number;
      };

      assert.strictEqual(data.total, 3);
      assert.strictEqual(data.withTags, 2);
    });
  });
});
