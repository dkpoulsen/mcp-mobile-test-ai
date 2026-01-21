/**
 * Example unit test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Math Utils', () => {
  it('should add two numbers correctly', () => {
    const result = 2 + 2;
    assert.strictEqual(result, 4);
  });

  it('should multiply two numbers correctly', () => {
    const result = 3 * 4;
    assert.strictEqual(result, 12);
  });
});
