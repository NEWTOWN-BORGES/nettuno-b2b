/**
 * NETTUNO B2B — Community Signal Aggregator (Server-Side).
 * 
 * Responsável por:
 *   - Agregação estatística de votos ponderados pelo Voter Trust.
 *   - Cálculo da velocidade de votação (Velocity Tracking).
 *   - Deteção de picos anormais de votos negativos em janela curta.
 *   - Emissão de Community Signal para priorização no Signal Engine.
 * 
 * Regra Inviolável:
 *   Community Signal é um sensor distribuído de priorização de análise,
 *   NUNCA a autoridade que define o estado final RISK.
 */
'use strict';

const { evaluateVoterTrust, capIndividualVoteWeight } = require('./voterTrust');

/**
 * @param {Array<object>} votesList Lista de votos do anúncio
 * @param {number} [windowMinutes=10] Janela para cálculo de velocidade
 * @returns {object} Estatísticas e sinais da comunidade
 */
function computeCommunitySignal(votesList = [], windowMinutes = 10, now = Date.now()) {
  if (!Array.isArray(votesList) || votesList.length === 0) {
    return {
      voterCount: 0,
      positiveWeight: 0,
      negativeWeight: 0,
      positiveRatio: 0.5,
      confidence: 0,
      velocityPerMinute: 0,
      hasSuspiciousNegativeVelocity: false,
      priorityLevel: 'LOW' // 'LOW' | 'MEDIUM' | 'HIGH'
    };
  }

  let totalPosWeight = 0;
  let totalNegWeight = 0;
  const recentWindowMs = windowMinutes * 60 * 1000;
  let recentNegVotes = 0;
  let recentPosVotes = 0;

  // Rastreia votantes únicos para medir diversidade
  const uniqueVoters = new Set();

  for (const vote of votesList) {
    const isPos = vote.type === 'POSITIVE' || vote.type === 'green';
    const createdAt = typeof vote.createdAt === 'number' ? vote.createdAt : now;
    const voterId = vote.voterId || vote.userId || 'anon_' + Math.random();
    uniqueVoters.add(voterId);

    // Obtém peso de confiança do votante
    const { trustWeight } = evaluateVoterTrust(vote.voterProfile || {}, now);
    const cappedWeight = capIndividualVoteWeight(trustWeight, totalPosWeight + totalNegWeight);

    if (isPos) {
      totalPosWeight += cappedWeight;
      if (now - createdAt <= recentWindowMs) recentPosVotes++;
    } else {
      totalNegWeight += (cappedWeight * 1.3); // Leve assimetria defensiva
      if (now - createdAt <= recentWindowMs) recentNegVotes++;
    }
  }

  const totalWeight = totalPosWeight + totalNegWeight;
  const positiveRatio = totalWeight > 0 ? Math.round((totalPosWeight / totalWeight) * 1000) / 1000 : 0.5;

  // Cálculo de velocidade recente (votos / min)
  const velocityPerMinute = Math.round(((recentPosVotes + recentNegVotes) / windowMinutes) * 100) / 100;
  const negVelocityPerMinute = Math.round((recentNegVotes / windowMinutes) * 100) / 100;

  // Deteção de pico suspeito: ≥ 5 votos negativos recentes ou velocidade negativa > 1/min
  const hasSuspiciousNegativeVelocity = recentNegVotes >= 5 || negVelocityPerMinute >= 1.0;

  // Nível de prioridade para a fila de análise
  let priorityLevel = 'LOW';
  if (hasSuspiciousNegativeVelocity || (totalNegWeight >= 8 && positiveRatio < 0.35)) {
    priorityLevel = 'HIGH';
  } else if (totalNegWeight >= 3 || recentNegVotes >= 2) {
    priorityLevel = 'MEDIUM';
  }

  // Grau de confiança estatística baseado na diversidade de votantes (0.0 a 1.0)
  const voterDiversity = uniqueVoters.size;
  const confidence = Math.min(1.0, Math.round((voterDiversity / 10) * 100) / 100);

  return {
    voterCount: votesList.length,
    voterDiversity,
    positiveWeight: Math.round(totalPosWeight * 100) / 100,
    negativeWeight: Math.round(totalNegWeight * 100) / 100,
    positiveRatio,
    confidence,
    velocityPerMinute,
    recentNegVotes,
    hasSuspiciousNegativeVelocity,
    priorityLevel
  };
}

module.exports = {
  computeCommunitySignal
};
