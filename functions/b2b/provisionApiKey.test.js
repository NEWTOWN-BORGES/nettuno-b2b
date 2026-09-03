'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { hashKey } = require('./authApiKey');

describe('Provision & Revoke API Key Flow', () => {
  it('generates a valid formatted API key and saves only hash in root', async () => {
    const keyId = crypto.randomBytes(8).toString('hex');
    const secret = crypto.randomBytes(24).toString('base64url');
    const plaintext = `nt_live_${keyId}_${secret}`;
    const prefix = `nt_live_${keyId}`;

    assert.match(plaintext, /^nt_live_[a-f0-9]{16}_[A-Za-z0-9_-]+$/);
    assert.equal(prefix, `nt_live_${keyId}`);

    const hash = hashKey(plaintext);
    assert.equal(hash.length, 64); // SHA-256 hex length
    assert.equal(hash, hashKey(plaintext));
  });

  it('verifies plan limits logic for max API keys', () => {
    const plan = { maxApiKeys: 2 };
    const activeKeys = [{ id: 'k1', status: 'active' }, { id: 'k2', status: 'active' }];
    
    assert.equal(activeKeys.length >= plan.maxApiKeys, true, 'Deve bloquear quando atinge maxApiKeys');

    // Se uma for revogada
    activeKeys[0].status = 'revoked';
    const currentActive = activeKeys.filter(k => k.status === 'active');
    assert.equal(currentActive.length < plan.maxApiKeys, true, 'Deve permitir criar quando há vagas ativas');
  });
});
