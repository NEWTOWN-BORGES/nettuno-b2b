/**
 * NETTUNO B2B — Adaptive Risk Coordinator.
 * 
 * Orquestra a decisão entre:
 *   - Servir resultado da cache rápida L1 (0 créditos)
 *   - Manter monitorização passiva / estado PENDING (0 créditos)
 *   - Enfileirar para o Risk Engine assíncrono (1 Risk Unit consumida sob demanda)
 */
'use strict';

const crypto = require('crypto');
const { evaluateSignals } = require('./signalEngine');
const { computeCommunitySignal } = require('./communitySignal');
const { globalRiskCache } = require('./riskCache');

function computeContentHash(listing = {}) {
  const t = listing.title || listing.t || '';
  const p = listing.price || listing.p || '';
  const d = listing.description || listing.desc || '';
  return crypto.createHash('md5').update(`${t}|${p}|${d}`).digest('hex').slice(0, 12);
}

/**
 * Avalia se o anúncio requer enfileiramento para o Risk Engine.
 * 
 * @param {object} listing Dados do anúncio
 * @param {Array<object>} votes Lista de votos comunitários
 * @param {object} options Opções de amostragem (canaryRate: 0.01 por omissão)
 * @returns {{
 *   shouldAnalyze: boolean,
 *   reason: 'SIGNAL_THRESHOLD'|'CANARY_SAMPLING'|'CONTENT_CHANGED'|'NONE',
 *   suspicionScore: number,
 *   contentHash: string,
 *   communitySignal: object
 * }}
 */
function shouldTriggerAnalysis(listing = {}, votes = [], options = {}) {
  const contentHash = computeContentHash(listing);
  const commSignal = computeCommunitySignal(votes);
  
  const signalResult = evaluateSignals(listing, {
    baselinePrice: options.baselinePrice,
    communitySignal: commSignal
  });

  // 1. Verificação de Threshold do Signal Engine (suspicionScore >= 70)
  if (signalResult.action === 'ANALYZE') {
    return {
      shouldAnalyze: true,
      reason: 'SIGNAL_THRESHOLD',
      suspicionScore: signalResult.suspicionScore,
      contentHash,
      communitySignal: commSignal
    };
  }

  // 2. Verificação de Mudança de Conteúdo (se já existia hash anterior diferente)
  if (options.previousContentHash && options.previousContentHash !== contentHash) {
    return {
      shouldAnalyze: true,
      reason: 'CONTENT_CHANGED',
      suspicionScore: signalResult.suspicionScore,
      contentHash,
      communitySignal: commSignal
    };
  }

  // 3. Canary / Random Sampling Controlado (ex: 1% padrão, configurável e seguro)
  const canaryRate = typeof options.canaryRate === 'number' ? Math.min(0.05, options.canaryRate) : 0.01;
  if (Math.random() < canaryRate) {
    return {
      shouldAnalyze: true,
      reason: 'CANARY_SAMPLING',
      suspicionScore: signalResult.suspicionScore,
      contentHash,
      communitySignal: commSignal
    };
  }

  return {
    shouldAnalyze: false,
    reason: 'NONE',
    suspicionScore: signalResult.suspicionScore,
    contentHash,
    communitySignal: commSignal
  };
}

module.exports = {
  shouldTriggerAnalysis,
  computeContentHash
};
