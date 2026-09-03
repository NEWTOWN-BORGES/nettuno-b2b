'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { globalRiskCache } = require('./riskCache');
const { globalRateLimiter } = require('./rateLimiter');
const { evaluateQuota } = require('./metering');
const { resolveAllowedOrigin } = require('./apiV1');

describe('API V1 Metering & Cache End-to-End Logic', () => {
  beforeEach(() => {
    globalRiskCache.clear();
    globalRateLimiter.reset();
  });

  it('correctly allocates 1 credit for single and N credits for batch', () => {
    const tenant = {
      tenantId: 'mkt_test',
      status: 'active',
      quota: { monthlyCredits: 50, allowOverage: false },
      currentCycle: { creditsUsed: 10 },
    };

    // 1 crédito
    const singleQuota = evaluateQuota(tenant, 1);
    assert.equal(singleQuota.allowed, true);
    assert.equal(singleQuota.remaining, 39);

    // 40 créditos num batch (10 + 40 = 50 <= 50)
    const batchQuota = evaluateQuota(tenant, 40);
    assert.equal(batchQuota.allowed, true);
    assert.equal(batchQuota.remaining, 0);

    // 41 créditos num batch (10 + 41 = 51 > 50)
    const batchOver = evaluateQuota(tenant, 41);
    assert.equal(batchOver.allowed, false);
    assert.equal(batchOver.status, 402);
  });

  it('serves from cache on second request and tracks hit count', () => {
    const adData = { listingId: 'olx_456', score: 90, state: 'TRUSTED' };
    
    // 1st request: MISS
    assert.equal(globalRiskCache.get('olx_456'), null);
    globalRiskCache.set('olx_456', adData);

    // 2nd request: HIT
    const cached = globalRiskCache.get('olx_456');
    assert.deepEqual(cached, adData);
    assert.equal(globalRiskCache.stats().hits, 1);
  });
});

describe('API V1 — restricted CORS (resolveAllowedOrigin)', () => {
  it('is permissive (backward-compatible) when the tenant has no allowedOrigins configured', () => {
    const req = { headers: { origin: 'https://anything.example.com' } };
    assert.equal(resolveAllowedOrigin(req, {}), '*');
    assert.equal(resolveAllowedOrigin(req, null), '*');
    assert.equal(resolveAllowedOrigin(req, { allowedOrigins: [] }), '*');
  });

  it('allows only origins present in the tenant allowlist once configured', () => {
    const tenant = { allowedOrigins: ['https://vedix.com', 'https://app.vedix.com'] };
    assert.equal(resolveAllowedOrigin({ headers: { origin: 'https://vedix.com' } }, tenant), 'https://vedix.com');
    assert.equal(resolveAllowedOrigin({ headers: { origin: 'https://evil.example.com' } }, tenant), null);
  });

  it('returns null (no CORS header set) for requests without an Origin header', () => {
    // Pedidos server-to-server (curl, backend do marketplace) não enviam Origin
    // e não precisam de CORS — não faz sentido bloquear nem libertar.
    assert.equal(resolveAllowedOrigin({ headers: {} }, { allowedOrigins: ['https://vedix.com'] }), null);
  });

  it('ignores malformed entries in allowedOrigins instead of trusting stored data blindly', () => {
    const tenant = { allowedOrigins: ['https://vedix.com', 123, null, 'x'.repeat(300)] };
    const req = { headers: { origin: 'https://vedix.com' } };
    assert.equal(resolveAllowedOrigin(req, tenant), 'https://vedix.com');
  });
});
