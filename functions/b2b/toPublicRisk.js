/**
 * Mapeia o read model ads/{id} para o contrato Risk API V1.
 * Suporta os estados: SAFE, TRUSTED, RISK, PENDING, ANALYSIS_STALE, ANALYSIS_UNAVAILABLE.
 * Nunca inclui pesos internos, trust de utilizadores, IP ou identidades.
 */
'use strict';

const PUBLIC_STATES = new Set([
  'SAFE',
  'TRUSTED',
  'RISK',
  'PENDING',
  'ANALYSIS_STALE',
  'ANALYSIS_UNAVAILABLE'
]);

const LEAK_KEYS = [
  'wPos', 'wNeg', 'trustWeight', 'ipHash', 'uid', 'ownerUid',
  'effectiveWeight', 'deviceFingerprint', 'idempotencyKey',
];

const STALE_THRESHOLD_MS = 14 * 86400000; // 14 dias sem reanálise = STALE

function isoTime(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value.toDate === 'function') {
    try { return value.toDate().toISOString(); } catch { return null; }
  }
  if (typeof value === 'string') return value;
  return null;
}

function voteCounts(ad) {
  if (ad.votes && typeof ad.votes === 'object') {
    return {
      green: Number(ad.votes.green) || 0,
      yellow: Number(ad.votes.yellow) || 0,
      red: Number(ad.votes.red) || 0,
    };
  }
  return {
    green: Number(ad.likes) || 0,
    yellow: 0,
    red: Number(ad.dislikes) || 0,
  };
}

function unknownRisk(listingId, state = 'SAFE') {
  return {
    listingId: String(listingId),
    score: 50,
    state: PUBLIC_STATES.has(state) ? state : 'SAFE',
    votes: { green: 0, yellow: 0, red: 0 },
    signals: [],
    communitySignals: {},
    totalSignals: 0,
    community: null,
    updatedAt: null,
    model: { name: 'adaptive-beta-v1', schemaVersion: 4 },
    evidence: { source: 'unknown' },
  };
}

/**
 * @param {string} listingId
 * @param {object|null|undefined} ad Dados do documento Firestore
 * @param {number} [now=Date.now()]
 */
function toPublicRisk(listingId, ad, now = Date.now()) {
  if (!ad || typeof ad !== 'object') return unknownRisk(listingId, 'SAFE');

  const votes = voteCounts(ad);
  const rawScore = ad.score == null ? 50 : Number(ad.score);
  const score = Number.isFinite(rawScore) ? rawScore : 50;
  
  let state = ad.state || ad.trustState;
  
  // Verificação de Stale (apenas se analyzedAt for explicitamente definido e > 14 dias)
  const lastAnalyzedAt = typeof ad.analyzedAt === 'number' ? ad.analyzedAt : null;
  if (lastAnalyzedAt && (now - lastAnalyzedAt > STALE_THRESHOLD_MS) && state !== 'RISK') {
    state = 'ANALYSIS_STALE';
  }

  if (!PUBLIC_STATES.has(state)) {
    state = 'SAFE';
  }

  const schemaVersion = Number(ad.schemaVersion) || 4;

  // `ad.riskSignals` (array) = sinais DETETADOS pelo Signal Engine numa análise profunda.
  // `ad.signals` (mapa {codigo: contagem}) = sinais REPORTADOS PELA COMUNIDADE (extensão
  // via recordSignal() e endpoint B2B /signal). Duas fontes distintas — nunca fundir.
  const signals = Array.isArray(ad.riskSignals)
    ? ad.riskSignals
        .filter((s) => s && typeof s.code === 'string')
        .map((s) => ({ code: s.code, severity: s.severity || 'LOW' }))
    : [];

  const communitySignals = (ad.signals && typeof ad.signals === 'object' && !Array.isArray(ad.signals))
    ? Object.fromEntries(
        Object.entries(ad.signals).filter(([k, v]) => typeof k === 'string' && Number.isFinite(Number(v)))
          .map(([k, v]) => [k, Number(v)])
      )
    : {};
  const totalSignals = Number(ad.totalSignals) || 0;

  const community = ad.community && typeof ad.community === 'object'
    ? {
        voterCount: Number(ad.community.voterCount) || 0,
        voterDiversity: Number(ad.community.voterDiversity) || 0,
        positiveRatio: Number(ad.community.positiveRatio) || 0,
        confidence: Number(ad.community.confidence) || 0,
      }
    : null;

  const out = {
    listingId: String(listingId),
    score,
    state,
    votes,
    signals,
    communitySignals,
    totalSignals,
    community,
    analyzedAt: isoTime(lastAnalyzedAt),
    updatedAt: isoTime(ad.updatedAt),
    model: { name: 'adaptive-beta-v1', schemaVersion },
    evidence: { source: ad.evidence?.source || 'community' },
  };

  for (const k of LEAK_KEYS) {
    if (Object.prototype.hasOwnProperty.call(out, k)) delete out[k];
  }
  return out;
}

function assertNoLeak(payload) {
  const json = JSON.stringify(payload);
  for (const k of LEAK_KEYS) {
    if (json.includes(`"${k}"`)) {
      throw new Error(`Risk payload leaked internal field: ${k}`);
    }
  }
  return payload;
}

module.exports = {
  toPublicRisk,
  unknownRisk,
  assertNoLeak,
  PUBLIC_STATES,
  LEAK_KEYS
};
