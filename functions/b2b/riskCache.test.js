'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { RiskCache } = require('./riskCache');

describe('RiskCache', () => {
  it('stores and retrieves items correctly (HIT / MISS)', () => {
    const cache = new RiskCache({ maxSize: 10, ttlMs: 10_000 });
    assert.equal(cache.get('ad_1'), null);
    assert.equal(cache.stats().misses, 1);

    cache.set('ad_1', { score: 85, state: 'TRUSTED' });
    const item = cache.get('ad_1');
    assert.deepEqual(item, { score: 85, state: 'TRUSTED' });
    assert.equal(cache.stats().hits, 1);
  });

  it('respects TTL expiration', async () => {
    const cache = new RiskCache({ maxSize: 10, ttlMs: 50 }); // 50ms TTL
    cache.set('quick', { test: true });
    assert.ok(cache.get('quick'));

    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(cache.get('quick'), null);
  });

  it('evicts oldest items when maxSize is reached (LRU)', () => {
    const cache = new RiskCache({ maxSize: 2, ttlMs: 60_000 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3); // deve despejar 'a'

    assert.equal(cache.get('a'), null);
    assert.equal(cache.get('b'), 2);
    assert.equal(cache.get('c'), 3);
  });
});
