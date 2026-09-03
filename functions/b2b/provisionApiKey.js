'use strict';

/**
 * Nettuno Cloud — provisionApiKey (callable, Firebase Auth obrigatório).
 *
 * Gera uma nova API key B2B (Live ou Test) para o marketplace autenticado.
 * O secret é devolvido UMA ÚNICA VEZ e nunca fica armazenado em plaintext.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');
const crypto = require('crypto');
const { hashKey } = require('./authApiKey');

const KEY_NAME_RE = /^[\p{L}\p{N}\s\-.,]{1,64}$/u;
const DEFAULT_PLAN = 'developer';
const DEFAULT_MAX_KEYS = 5;

async function loadPlan(db, planId) {
  const snap = await db.doc(`plans/${planId || DEFAULT_PLAN}`).get();
  if (!snap.exists) {
    return { maxApiKeys: DEFAULT_MAX_KEYS, monthlyCredits: 5000, rateLimitRpm: 30, allowOverage: false };
  }
  const d = snap.data();
  return {
    maxApiKeys: Number(d.maxApiKeys) || DEFAULT_MAX_KEYS,
    monthlyCredits: Number(d.monthlyCredits) || 5000,
    rateLimitRpm: Number(d.rateLimitRpm) || 30,
    allowOverage: d.allowOverage === true,
  };
}

exports.provisionApiKey = onCall(
  { region: 'europe-west1', enforceAppCheck: false },
  async (request) => {
    // 1. Autenticação obrigatória
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
    }
    const uid = request.auth.uid;

    // 2. Validar input
    const name = String((request.data && request.data.name) || '').trim();
    const type = (request.data && request.data.type === 'test') ? 'test' : 'live';

    if (!name || !KEY_NAME_RE.test(name)) {
      throw new HttpsError('invalid-argument', 'Nome da key inválido (1–64 caracteres).');
    }

    const db = getFirestore();

    // 3. Verificar que o marketplace existe e está activo
    const mktSnap = await db.doc(`marketplaces/${uid}`).get();
    if (!mktSnap.exists) {
      throw new HttpsError('not-found', 'Conta de marketplace não encontrada. Completa o registo.');
    }
    const mkt = mktSnap.data();
    if (mkt.status !== 'active') {
      throw new HttpsError('permission-denied', `Conta suspensa (${mkt.status}).`);
    }

    // 4. Verificar limite de chaves do plano
    const plan = await loadPlan(db, mkt.plan);
    const activeKeysSnap = await db
      .collection(`marketplaces/${uid}/apiKeys`)
      .where('status', '==', 'active')
      .get();

    if (activeKeysSnap.size >= plan.maxApiKeys) {
      throw new HttpsError(
        'resource-exhausted',
        `Limite de ${plan.maxApiKeys} API key(s) activas atingido para o plano ${mkt.plan || DEFAULT_PLAN}. Revoga uma antes de criar outra.`
      );
    }

    // 5. Gerar a chave (nt_live_ ou nt_test_)
    const keyId = crypto.randomBytes(8).toString('hex');
    const secret = crypto.randomBytes(24).toString('base64url');
    const prefixStr = `nt_${type}_${keyId}`;
    const plaintext = `${prefixStr}_${secret}`;
    const now = Date.now();

    // 6. Escrever atomicamente via batch (Admin SDK)
    const batch = db.batch();

    // root-level: só Admin SDK consegue ler — guarda hash + metadata de routing
    batch.set(db.doc(`apiKeys/${keyId}`), {
      hash: hashKey(plaintext),
      marketplaceId: uid,
      tenantId: uid,
      type, // 'live' | 'test'
      plan: mkt.plan || DEFAULT_PLAN,
      status: 'active',
      name,
      createdAt: now,
    });

    // subcoleção do marketplace: dashboard lê isto (nunca contém secret/hash)
    batch.set(db.doc(`marketplaces/${uid}/apiKeys/${keyId}`), {
      keyId,
      prefix: prefixStr,
      type,
      name,
      status: 'active',
      createdAt: now,
      lastUsedAt: null,
      revokedAt: null,
    });

    await batch.commit();

    logger.info('api_key_provisioned', { uid, keyId, type, plan: mkt.plan, name });

    // 7. Devolver o secret UMA ÚNICA VEZ
    return {
      keyId,
      prefix: prefixStr,
      type,
      key: plaintext,
      name,
      createdAt: now,
    };
  }
);
