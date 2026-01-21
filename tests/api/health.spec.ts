/**
 * Health API Tests
 *
 * Tests the health check endpoints
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { withTestServer } from './test-server.js';
import { createTestClient } from './test-helpers.js';

describe('Health API', () => {
  const { serverUrl } = withTestServer();
  const client = createTestClient(serverUrl);

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await client.get('/health');

      assert.strictEqual(response.status, 200);

      const body = await response.json();
      assert.strictEqual(body.status, 'ok');
      assert.ok(body.timestamp);
      assert.ok(body.database === 'connected' || body.database === 'disconnected');
    });

    it('should return JSON content type', async () => {
      const response = await client.get('/health');

      assert.strictEqual(response.headers.get('content-type'), 'application/json; charset=utf-8');
    });
  });

  describe('GET /health/ready', () => {
    it('should return ready status when database is connected', async () => {
      const response = await client.get('/health/ready');

      // Should be 200 or 503 depending on database state
      assert.ok(response.status === 200 || response.status === 503);

      const body = await response.json();
      assert.ok(body.timestamp);

      if (response.status === 200) {
        assert.strictEqual(body.status, 'ready');
      } else {
        assert.strictEqual(body.status, 'not ready');
      }
    });
  });

  describe('GET /health/live', () => {
    it('should return alive status', async () => {
      const response = await client.get('/health/live');

      assert.strictEqual(response.status, 200);

      const body = await response.json();
      assert.strictEqual(body.status, 'alive');
      assert.ok(body.timestamp);
    });
  });
});
