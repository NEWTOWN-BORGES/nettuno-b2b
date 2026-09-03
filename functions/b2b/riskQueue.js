/**
 * NETTUNO B2B — Async Risk Analysis Queue (Server-Side).
 * 
 * Responsabilidades:
 *   - Enfileirar pedidos de análise profunda disparados pelo Adaptive Risk.
 *   - Deduplicação estrita: (listingId + contentHash). Se uma análise já estiver
 *     em curso para o mesmo conteúdo, junta os callbacks sem duplicar processamento.
 *   - Verificação e débito atómico de 1 Risk Unit antes da execução.
 *   - Limite de concorrência e retries limitados (max 2).
 *   - Atualização do cache e persistência em ads/{listingId}.
 */
'use strict';

const { logger } = require('firebase-functions');
const { consumeCreditsAtomic } = require('./metering');
const { globalRiskCache } = require('./riskCache');
const { toPublicRisk, assertNoLeak } = require('./toPublicRisk');
const { evaluateSignals } = require('./signalEngine');
const { computeCommunitySignal } = require('./communitySignal');

/**
 * Deriva score (0-100, maior = mais seguro) e state a partir do suspicionScore
 * do Signal Engine (0-100, maior = mais suspeito) e do consenso da comunidade.
 */
function deriveStateFromSignals(signalResult, commSignal) {
  const score = Math.max(0, Math.min(100, 100 - signalResult.suspicionScore));

  if (signalResult.suspicionScore >= 70) {
    return { score, state: 'RISK' };
  }

  // Promove a TRUSTED apenas com consenso positivo forte e diverso o suficiente
  const strongPositiveConsensus = commSignal.voterDiversity >= 5 && commSignal.positiveRatio >= 0.8;
  if (signalResult.suspicionScore < 30 && strongPositiveConsensus) {
    return { score, state: 'TRUSTED' };
  }

  return { score, state: 'SAFE' };
}

class RiskQueue {
  constructor(options = {}) {
    this.maxConcurrent = options.maxConcurrent || 10;
    this.activeWorkers = 0;
    this.pendingQueue = [];
    this.inFlightDedupe = new Map(); // dedupeKey -> Promise
    this.deadLetter = new Map();     // dedupeKey -> error
  }

  /**
   * Enfileira uma análise profunda de forma assíncrona.
   * 
   * @param {FirebaseFirestore.Firestore} db Instância do Firestore
   * @param {string} marketplaceId ID do marketplace / tenant
   * @param {string} listingId ID do anúncio
   * @param {string} contentHash Hash do conteúdo para deduplicação
   * @param {object} listingData Dados do anúncio
   * @returns {Promise<{ status: 'ENQUEUED'|'IN_FLIGHT'|'COMPLETED', dedupeKey: string }>}
   */
  async enqueue(db, marketplaceId, listingId, contentHash = 'v1', listingData = {}) {
    const dedupeKey = `${marketplaceId}:${listingId}:${contentHash}`;

    // 1. Se já está em processamento, não duplica
    if (this.inFlightDedupe.has(dedupeKey)) {
      return { status: 'IN_FLIGHT', dedupeKey };
    }

    const task = {
      db,
      marketplaceId,
      listingId,
      contentHash,
      listingData,
      dedupeKey,
      attempts: 0,
      enqueuedAt: Date.now()
    };

    this.pendingQueue.push(task);
    this._processNext();

    return { status: 'ENQUEUED', dedupeKey };
  }

  _processNext() {
    if (this.activeWorkers >= this.maxConcurrent || this.pendingQueue.length === 0) {
      return;
    }

    const task = this.pendingQueue.shift();
    if (!task) return;

    this.activeWorkers++;
    const promise = this._executeTask(task).finally(() => {
      this.activeWorkers--;
      this.inFlightDedupe.delete(task.dedupeKey);
      this._processNext();
    });

    this.inFlightDedupe.set(task.dedupeKey, promise);
  }

  async _executeTask(task) {
    const { db, marketplaceId, listingId, contentHash, listingData, dedupeKey } = task;
    task.attempts++;

    try {
      // 1. Verificação e débito atómico de 1 Risk Unit
      let meterResult;
      try {
        meterResult = await consumeCreditsAtomic(db, marketplaceId, 1);
      } catch (quotaErr) {
        logger.warn('risk_queue_quota_exhausted', { marketplaceId, listingId, error: quotaErr.message });
        return { ok: false, error: 'QUOTA_EXCEEDED' };
      }

      // 2. Execução da análise: lê doc existente + conteúdo submetido + votos reais
      let snap = null;
      try {
        snap = await db.doc(`ads/${listingId}`).get();
      } catch (_) {}

      const existingAd = snap && snap.exists ? snap.data() : {};
      const rawAd = { ...existingAd, ...(listingData || {}) };

      let votesList = [];
      try {
        const votesSnap = await db.collection(`ads/${listingId}/votes`).get();
        votesList = votesSnap.docs.map((d) => d.data());
      } catch (_) {}

      const commSignal = computeCommunitySignal(votesList);
      const signalResult = evaluateSignals(rawAd, { communitySignal: commSignal });
      const { score, state } = deriveStateFromSignals(signalResult, commSignal);

      const analyzedRisk = assertNoLeak(toPublicRisk(listingId, { ...rawAd, score, state }));

      // Atualiza timestamp, contentHash e resultado real do Signal Engine
      analyzedRisk.contentHash = contentHash;
      analyzedRisk.analyzedAt = Date.now();
      analyzedRisk.state = state;
      analyzedRisk.score = score;
      analyzedRisk.signals = signalResult.signals;
      analyzedRisk.community = {
        voterCount: commSignal.voterCount,
        voterDiversity: commSignal.voterDiversity,
        positiveRatio: commSignal.positiveRatio,
        confidence: commSignal.confidence
      };

      // 3. Atualiza Cache L1
      globalRiskCache.set(listingId, analyzedRisk, 300_000);

      // 4. Grava em Firestore se aplicável.
      // IMPORTANTE: `ads/{id}.signals` é o mapa de sinais REPORTADOS PELA COMUNIDADE
      // (escrito pela extensão via recordSignal() e pelo endpoint /signal do B2B,
      // ambos com FieldValue.increment por chave). O array de sinais DETETADOS pelo
      // Signal Engine (analyzedRisk.signals) nunca pode ser gravado sob essa mesma
      // chave — um .set({..signals}, {merge:true}) substituiria o mapa inteiro e
      // apagaria os sinais da comunidade. Persistimos o array sob `riskSignals`.
      const { signals: _riskSignalsForResponse, ...analyzedRiskWithoutSignals } = analyzedRisk;
      try {
        await db.doc(`ads/${listingId}`).set({
          ...analyzedRiskWithoutSignals,
          riskSignals: signalResult.signals,
          contentHash,
          marketplaceId,
          updatedAt: Date.now()
        }, { merge: true });
      } catch (writeErr) {
        logger.warn('risk_queue_persist_warn', { listingId, error: writeErr.message });
      }

      logger.info('risk_queue_task_completed', {
        marketplaceId,
        listingId,
        dedupeKey,
        score: analyzedRisk.score,
        remainingCredits: meterResult.remaining
      });

      return { ok: true, risk: analyzedRisk };

    } catch (err) {
      logger.error('risk_queue_execution_error', { listingId, attempt: task.attempts, error: err.message });
      
      // Retry limitado (max 2 tentativas)
      if (task.attempts < 2) {
        this.pendingQueue.push(task);
      } else {
        this.deadLetter.set(dedupeKey, { error: err.message, failedAt: Date.now() });
      }
      return { ok: false, error: err.message };
    }
  }

  getQueueStats() {
    return {
      pending: this.pendingQueue.length,
      active: this.activeWorkers,
      inFlightCount: this.inFlightDedupe.size,
      deadLetterCount: this.deadLetter.size
    };
  }

  reset() {
    this.pendingQueue = [];
    this.inFlightDedupe.clear();
    this.deadLetter.clear();
    this.activeWorkers = 0;
  }
}

const globalRiskQueue = new RiskQueue();

module.exports = {
  RiskQueue,
  globalRiskQueue
};
