'use strict';

/**
 * Nettuno Cloud — ensureMarketplaceAccount (callable, autenticado).
 *
 * Bootstrap server-side do documento `marketplaces/{uid}` para utilizadores que
 * entram via provedor federado (Google Sign-In) e ainda não têm conta. Antes,
 * `dashboard/_auth.js` fazia isto com um `.set()` direto do browser — mesma classe
 * de falha do registo por email (`registerCompany.js`): o cliente definia
 * `plan`/`status` à vontade. Aqui o `uid`/`email`/`name` vêm do ID token já
 * verificado pelo Admin SDK (request.auth), nunca do corpo do pedido, e
 * `plan`/`status` continuam fixos no servidor.
 *
 * Idempotente: se a conta já existir, devolve-a tal como está (não sobrescreve).
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');
const { RateLimiter } = require('./rateLimiter');

const DEFAULT_PLAN = 'developer';

// Chamada é autenticada (muito menos exposta a abuso que o registo público),
// mas mantém-se um limite generoso por uid como camada extra.
const bootstrapLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 10 });

exports.ensureMarketplaceAccount = onCall(
  { region: 'europe-west1', enforceAppCheck: false, cors: true },
  async (request) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
    }
    const uid = request.auth.uid;

    const rate = bootstrapLimiter.check(`ensure:${uid}`);
    if (!rate.allowed) {
      logger.warn('ensure_marketplace_rate_limited', { uid });
      throw new HttpsError('resource-exhausted', 'Demasiados pedidos. Tenta novamente em instantes.');
    }

    const db = getFirestore();
    const ref = db.doc(`marketplaces/${uid}`);
    const snap = await ref.get();
    if (snap.exists) {
      return snap.data();
    }

    // Dados de identidade vêm do ID token verificado — nunca de request.data.
    const token = request.auth.token || {};
    const email = String(token.email || '').slice(0, 254);
    const name = String(token.name || (email ? email.split('@')[0] : 'Marketplace')).slice(0, 80) || 'Marketplace';
    const now = Date.now();

    const mktData = {
      uid,
      name,
      email,
      plan: DEFAULT_PLAN,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    await ref.set(mktData);
    logger.info('marketplace_bootstrapped', { uid, email });

    return mktData;
  }
);
