/**
 * Nettuno Cloud — Usage Metering & Quota Engine (Production-Ready).
 *
 * Princípio: 1 anúncio analisado = 1 crédito Nettuno.
 * Garante consistência atómica mesmo sob alta concorrência de requests paralelos.
 */
'use strict';

const { FieldValue } = require('firebase-admin/firestore');

/**
 * Validação pura em memória de quota (útil para pré-checagem rápida).
 *
 * @param {object} tenantData  Documento de tenants/{tenantId}
 * @param {number} creditsRequested  Quantidade de anúncios a analisar
 * @returns {{ allowed: boolean, status?: number, error?: string, remaining?: number, isOverage?: boolean }}
 */
function evaluateQuota(tenantData, creditsRequested = 1) {
  if (!tenantData || typeof tenantData !== 'object') {
    return { allowed: true, remaining: 999_999, isOverage: false };
  }

  if (tenantData.status === 'suspended') {
    return { allowed: false, status: 403, error: 'Conta de tenant suspensa.' };
  }

  const quota = tenantData.quota || {};
  const monthlyCredits = typeof quota.monthlyCredits === 'number' ? quota.monthlyCredits : 50_000;
  const allowOverage = quota.allowOverage !== false;

  const currentCycle = tenantData.currentCycle || {};
  const creditsUsed = typeof currentCycle.creditsUsed === 'number' ? currentCycle.creditsUsed : 0;

  const projectedUsage = creditsUsed + creditsRequested;
  const remaining = Math.max(0, monthlyCredits - creditsUsed);

  if (projectedUsage > monthlyCredits) {
    if (!allowOverage) {
      return {
        allowed: false,
        status: 402,
        error: `Quota mensal de créditos excedida (${creditsUsed}/${monthlyCredits}). Overage desactivado.`,
        remaining: 0,
      };
    }
    return {
      allowed: true,
      remaining: 0,
      isOverage: true,
      overageAmount: projectedUsage - monthlyCredits,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, monthlyCredits - projectedUsage),
    isOverage: false,
  };
}

/**
 * Consome créditos atomicamente no Firestore via Transação (previne race condition em hard-limit).
 * Só é chamado quando os anúncios foram processados com sucesso.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} tenantId
 * @param {number} creditsCount
 * @returns {Promise<{ success: boolean, status?: number, error?: string, remaining?: number, isOverage?: boolean }>}
 */
async function consumeCreditsAtomic(db, tenantId, creditsCount) {
  if (!tenantId || tenantId === 'default' || creditsCount <= 0) {
    return { success: true, remaining: 999_999, isOverage: false };
  }

  const tenantRef = db.doc(`tenants/${tenantId}`);
  const now = Date.now();
  const cyclePeriod = new Date(now).toISOString().slice(0, 7);

  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(tenantRef);
    if (!snap.exists) {
      // Se o doc não existe ainda, cria com valores default
      const monthlyCredits = 50_000;
      transaction.set(tenantRef, {
        tenantId,
        status: 'active',
        quota: { monthlyCredits, allowOverage: true },
        currentCycle: {
          period: cyclePeriod,
          creditsUsed: creditsCount,
          lastUsageAt: now,
        },
        createdAt: now,
        updatedAt: now,
      });
      return { success: true, remaining: Math.max(0, monthlyCredits - creditsCount), isOverage: false };
    }

    const data = snap.data() || {};
    if (data.status === 'suspended') {
      const err = new Error('Conta de tenant suspensa.');
      err.status = 403;
      throw err;
    }

    const quota = data.quota || {};
    const monthlyCredits = typeof quota.monthlyCredits === 'number' ? quota.monthlyCredits : 50_000;
    const allowOverage = quota.allowOverage !== false;

    const currentCycle = data.currentCycle || {};
    // Se mudou o mês/ciclo, reinicia a contagem
    let creditsUsed = currentCycle.period === cyclePeriod ? (Number(currentCycle.creditsUsed) || 0) : 0;

    const newCreditsUsed = creditsUsed + creditsCount;

    if (newCreditsUsed > monthlyCredits && !allowOverage) {
      const err = new Error(`Quota mensal de créditos excedida (${creditsUsed}/${monthlyCredits}).`);
      err.status = 402;
      err.remaining = 0;
      throw err;
    }

    transaction.set(
      tenantRef,
      {
        currentCycle: {
          period: cyclePeriod,
          creditsUsed: newCreditsUsed,
          lastUsageAt: now,
        },
        updatedAt: now,
      },
      { merge: true }
    );

    return {
      success: true,
      remaining: Math.max(0, monthlyCredits - newCreditsUsed),
      isOverage: newCreditsUsed > monthlyCredits,
    };
  });
}

module.exports = {
  evaluateQuota,
  consumeCreditsAtomic,
};
