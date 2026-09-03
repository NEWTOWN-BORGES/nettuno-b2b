'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { authenticateApiKey, hashKey } = require('./authApiKey');
const { assertNoLeak, LEAK_KEYS } = require('./toPublicRisk');

describe('Security & Multi-Tenant Isolation Tests', () => {
  it('strictly isolates tenants and denies access with invalid or mismatched key hash', async () => {
    const mockDb = {
      doc: (path) => ({
        get: async () => {
          if (path === 'apiKeys/0123456789abcdef') {
            return {
              exists: true,
              data: () => ({
                active: true,
                hash: hashKey('nt_live_0123456789abcdef_validsecret'),
                tenantId: 'tenant_safe',
              }),
            };
          }
          if (path === 'apiKeys/fedcba9876543210') {
            return {
              exists: true,
              data: () => ({
                active: false, // Revogada / Desativada
                hash: hashKey('nt_live_fedcba9876543210_revokedsecret'),
                tenantId: 'tenant_revoked',
              }),
            };
          }
          if (path === 'tenants/tenant_safe') {
            return {
              exists: true,
              data: () => ({
                tenantId: 'tenant_safe',
                name: 'Safe Tenant',
                status: 'active',
                quota: { monthlyCredits: 50_000 },
              }),
            };
          }
          return { exists: false, data: () => null };
        },
      }),
    };

    // 1. Chave válida para tenant_safe
    const reqValid = { headers: { authorization: 'Bearer nt_live_0123456789abcdef_validsecret' } };
    const authValid = await authenticateApiKey(mockDb, reqValid);
    assert.equal(authValid.keyId, '0123456789abcdef');
    assert.equal(authValid.tenantId, 'tenant_safe');
    assert.equal(authValid.tenantData.name, 'Safe Tenant');

    // 2. Chave revogada (active: false)
    const reqRevoked = { headers: { authorization: 'Bearer nt_live_fedcba9876543210_revokedsecret' } };
    const authRevoked = await authenticateApiKey(mockDb, reqRevoked);
    assert.equal(authRevoked.status, 403);
    assert.match(authRevoked.error, /desactivada/);

    // 3. Chave com secret incorreto (hash mismatch)
    const reqTampered = { headers: { authorization: 'Bearer nt_live_0123456789abcdef_wrongsecret' } };
    const authTampered = await authenticateApiKey(mockDb, reqTampered);
    assert.equal(authTampered.status, 401);

    // 4. Formato de chave inválido
    const reqInvalid = { headers: { authorization: 'Bearer invalid_format' } };
    const authInvalid = await authenticateApiKey(mockDb, reqInvalid);
    assert.equal(authInvalid.status, 401);
  });

  it('guarantees zero leak of internal parameters', () => {
    for (const key of LEAK_KEYS) {
      assert.throws(() => {
        assertNoLeak({ listingId: 'ad_1', score: 80, [key]: 'secret_data' });
      }, /leaked internal field/);
    }
  });
});
