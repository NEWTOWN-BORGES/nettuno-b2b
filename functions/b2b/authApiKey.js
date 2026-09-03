/**
 * Autenticação B2B por API key (nt_live_{keyId}_{secret} ou nt_test_{keyId}_{secret}).
 * O plaintext nunca é persistido — só SHA-256.
 *
 * Utiliza Rate Limiter em memória para não consumir escritas Firestore em cada requisição.
 */
'use strict';

const crypto = require('crypto');
const { globalRateLimiter } = require('./rateLimiter');

const KEY_RE = /^nt_(live|test)_([a-f0-9]{16})_([A-Za-z0-9_-]+)$/;
const DEFAULT_RATE_LIMIT = 120; // 120 req/min

function hashKey(plaintext) {
  return crypto.createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

function parseBearer(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  const m = String(h).match(/^Bearer\s+(\S+)/i);
  return m ? m[1] : '';
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {object} req
 * @returns {Promise<{
 *   keyId?: string,
 *   keyType?: 'live'|'test',
 *   isTest?: boolean,
 *   tenantId?: string,
 *   tenantData?: object,
 *   rateStatus?: object,
 *   error?: string,
 *   status?: number
 * }>}
 */
async function authenticateApiKey(db, req) {
  const token = parseBearer(req);
  const parsed = KEY_RE.exec(token);
  if (!parsed) {
    return { error: 'API key em falta ou formato inválido. Use nt_live_... ou nt_test_...', status: 401 };
  }

  const keyType = parsed[1]; // 'live' | 'test'
  const keyId = parsed[2];
  const isTest = keyType === 'test';

  const snap = await db.doc(`apiKeys/${keyId}`).get();
  if (!snap.exists) return { error: 'API key desconhecida.', status: 401 };

  const keyData = snap.data() || {};
  if (keyData.status === 'revoked') {
    return { error: 'API_KEY_REVOKED: Esta API key foi revogada.', status: 401 };
  }
  if (keyData.active === false || keyData.status === 'disabled') {
    return { error: 'API key desactivada.', status: 403 };
  }
  if (keyData.hash !== hashKey(token)) {
    return { error: 'API key inválida.', status: 401 };
  }

  const tenantId = keyData.marketplaceId || keyData.tenantId || keyData.tenant || 'default';

  // 1. Rate Limit em Memória
  const maxRpm = (keyData.rateLimit && keyData.rateLimit.maxRpm) || DEFAULT_RATE_LIMIT;
  const rateResult = globalRateLimiter.check(keyId, maxRpm);

  if (!rateResult.allowed) {
    return {
      error: 'Rate limit excedido. Aguarde antes de enviar novos pedidos.',
      status: 429,
      rateStatus: rateResult,
    };
  }

  // 2. Carrega metadados do Tenant / Marketplace (se existir)
  let tenantData = null;
  if (tenantId && tenantId !== 'default') {
    const mSnap = await db.doc(`marketplaces/${tenantId}`).get();
    if (mSnap.exists) {
      tenantData = mSnap.data();
    } else {
      const tSnap = await db.doc(`tenants/${tenantId}`).get();
      if (tSnap.exists) {
        tenantData = tSnap.data();
      }
    }
  }

  return {
    keyId,
    keyType,
    isTest,
    tenantId,
    tenantData,
    rateStatus: rateResult,
  };
}

module.exports = {
  authenticateApiKey,
  hashKey,
  KEY_RE,
  DEFAULT_RATE_LIMIT,
};
