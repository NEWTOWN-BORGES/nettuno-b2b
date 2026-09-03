'use strict';

/**
 * Nettuno Cloud — revokeApiKey (callable, Firebase Auth obrigatório).
 *
 * Revoga uma API key do marketplace autenticado.
 * A chave passa ao estado "revoked" e é imediatamente rejeitada pela API V1.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');
const { globalRateLimiter } = require('./rateLimiter');

exports.revokeApiKey = onCall(
  { region: 'europe-west1', enforceAppCheck: false },
  async (request) => {
    // 1. Autenticação obrigatória
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
    }
    const uid = request.auth.uid;

    const keyId = String((request.data && request.data.keyId) || '').trim();
    if (!keyId || !/^[a-f0-9]{16}$/.test(keyId)) {
      throw new HttpsError('invalid-argument', 'keyId inválido.');
    }

    const db = getFirestore();

    // 2. Verificar que a chave pertence a este marketplace
    const userKeyRef = db.doc(`marketplaces/${uid}/apiKeys/${keyId}`);
    const userKeySnap = await userKeyRef.get();

    if (!userKeySnap.exists) {
      throw new HttpsError('not-found', 'API key não encontrada nesta conta.');
    }

    const keyData = userKeySnap.data() || {};
    if (keyData.status === 'revoked') {
      return { ok: true, keyId, status: 'revoked', message: 'API key já se encontrava revogada.' };
    }

    const now = Date.now();

    // 3. Atualizar atomicamente no Firestore
    const batch = db.batch();
    
    // Na subcoleção do marketplace
    batch.update(userKeyRef, {
      status: 'revoked',
      revokedAt: now,
      updatedAt: now,
    });

    // No root `apiKeys/{keyId}` (lido pelo gateway de autenticação)
    batch.update(db.doc(`apiKeys/${keyId}`), {
      status: 'revoked',
      active: false,
      revokedAt: now,
      updatedAt: now,
    });

    await batch.commit();

    // 4. Limpar rate limiter em memória
    globalRateLimiter.reset(keyId);

    logger.info('api_key_revoked', { uid, keyId });

    return {
      ok: true,
      keyId,
      status: 'revoked',
      revokedAt: now,
    };
  }
);
