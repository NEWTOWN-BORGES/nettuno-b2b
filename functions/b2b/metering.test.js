'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateQuota } = require('./metering');

describe('Metering & Quota Engine', () => {
  it('allows requests when within monthly credit quota', () => {
    const tenant = {
      tenantId: 'mkt_1',
      status: 'active',
      quota: { monthlyCredits: 50_000, allowOverage: false },
      currentCycle: { creditsUsed: 10_000 },
    };

    // 1 anúncio individual
    const res1 = evaluateQuota(tenant, 1);
    assert.equal(res1.allowed, true);
    assert.equal(res1.remaining, 39_999);
    assert.equal(res1.isOverage, false);

    // Batch com 50 anúncios
    const resBatch = evaluateQuota(tenant, 50);
    assert.equal(resBatch.allowed, true);
    assert.equal(resBatch.remaining, 39_950);
  });

  it('blocks request when quota is exceeded and allowOverage is false', () => {
    const tenant = {
      tenantId: 'mkt_strict',
      status: 'active',
      quota: { monthlyCredits: 1000, allowOverage: false },
      currentCycle: { creditsUsed: 980 },
    };

    const resBatch = evaluateQuota(tenant, 50); // 980 + 50 = 1030 > 1000
    assert.equal(resBatch.allowed, false);
    assert.equal(resBatch.status, 402);
    assert.match(resBatch.error, /Quota mensal de créditos excedida/);
  });

  it('permits request with overage flag when allowOverage is true', () => {
    const tenant = {
      tenantId: 'mkt_enterprise',
      status: 'active',
      quota: { monthlyCredits: 1000, allowOverage: true },
      currentCycle: { creditsUsed: 980 },
    };

    const resBatch = evaluateQuota(tenant, 50);
    assert.equal(resBatch.allowed, true);
    assert.equal(resBatch.isOverage, true);
    assert.equal(resBatch.overageAmount, 30);
  });

  it('blocks suspended tenants with 403', () => {
    const tenant = {
      tenantId: 'mkt_bad',
      status: 'suspended',
    };
    const res = evaluateQuota(tenant, 1);
    assert.equal(res.allowed, false);
    assert.equal(res.status, 403);
  });
});
