'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { RateLimiter } = require('./rateLimiter');

describe('RateLimiter', () => {
  it('allows requests within the limit', () => {
    const limiter = new RateLimiter({ windowMs: 10_000, maxRequests: 3 });
    const r1 = limiter.check('client_1');
    assert.equal(r1.allowed, true);
    assert.equal(r1.current, 1);
    assert.equal(r1.remaining, 2);

    const r2 = limiter.check('client_1');
    assert.equal(r2.allowed, true);
    assert.equal(r2.remaining, 1);

    const r3 = limiter.check('client_1');
    assert.equal(r3.allowed, true);
    assert.equal(r3.remaining, 0);

    const r4 = limiter.check('client_1');
    assert.equal(r4.allowed, false);
  });

  it('tracks different clients separately', () => {
    const limiter = new RateLimiter({ windowMs: 10_000, maxRequests: 2 });
    limiter.check('user_a');
    limiter.check('user_a');
    assert.equal(limiter.check('user_a').allowed, false);

    assert.equal(limiter.check('user_b').allowed, true);
  });
});
