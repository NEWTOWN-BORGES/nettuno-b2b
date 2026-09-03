/**
 * NETTUNO B2B — Voter Trust & Reputation Engine (Server-Side).
 *
 * O cálculo BASE de confiança (idade de conta, verificação, atividade,
 * penalizações) é o MESMO motor usado pelo B2C (`functions/lib/trust.js`,
 * `calculateUserTrust`, já usado pelo `submitVote`) — não é recriado aqui.
 * Este ficheiro só acrescenta o que é específico do B2B, que não existe no
 * motor B2C: decaimento por inatividade prolongada (o voto B2C não tem
 * "sessões" de votante persistentes fora de cada voto) e o teto individual
 * de peso por anúncio (diminishing returns).
 *
 * Regras Fundamentais:
 *   1. O score de Voter Trust (0.1 – 1.5) é ESTRITAMENTE interno e nunca exposto publicamente.
 *   2. Trust não é fixo: decai com o tempo sem atividade legítima (Trust Decay).
 *   3. Idade da conta isolada não gera trust elevado sem atividade verificada.
 *   4. Penalização severa de padrões coordenados (multi-contas / brigading).
 *   5. Limite individual (Diminishing returns): nenhum utilizador domina mais de 25% do peso de um anúncio.
 */
'use strict';

const { calculateUserTrust } = require('../lib/trust');

const DAY_MS = 86400000;
const MAX_INDIVIDUAL_WEIGHT_SHARE = 0.25; // max 25%

/**
 * Calcula o peso de confiança interna de um votante, delegando o cálculo base
 * ao motor partilhado com o B2C e acrescentando só o decaimento por inatividade
 * (conceito exclusivo do B2B).
 *
 * @param {object} voterData Dados históricos do votante (users/{uid} ou perfil anónimo sanitizado)
 * @param {number} [now=Date.now()] Timestamp atual para cálculo de decaimento
 * @returns {{ trustWeight: number, isSuspicious: boolean, decayFactor: number }}
 */
function evaluateVoterTrust(voterData = {}, now = Date.now()) {
  const createdAt = typeof voterData.createdAt === 'number' ? voterData.createdAt : now;

  // Motor base partilhado com o B2C — mesma fórmula, mesmos limiares.
  const baseTrust = calculateUserTrust({
    createdAt,
    emailVerified: Boolean(voterData.emailVerified || voterData.verifiedIdentity),
    voteCount: Number(voterData.voteCount) || 0,
    // reportCount (B2B) mapeia para signalCount (B2C) — mesmo peso 0.5x na fórmula.
    signalCount: Number(voterData.reportCount) || 0,
    accuracyRate: typeof voterData.accuracyRate === 'number' ? voterData.accuracyRate : null,
    trustPenalty: Number(voterData.burstPenalty) || 0,
    flaggedMultiAccount: Boolean(voterData.flaggedBrigading || voterData.flaggedMultiAccount),
  });

  // Trust Decay por inatividade — específico do B2B, sem equivalente no motor
  // B2C (que não mantém "sessão" de votante entre votos).
  const lastActiveAt = typeof voterData.lastActiveAt === 'number' ? voterData.lastActiveAt : createdAt;
  const daysInactive = Math.max(0, (now - lastActiveAt) / DAY_MS);
  let decayFactor = 1.0;
  if (daysInactive > 60) {
    // Decaimento de 10% a cada 30 dias de inatividade adicional (mínimo 0.5x)
    const extraMonths = Math.floor((daysInactive - 60) / 30);
    decayFactor = Math.max(0.5, 1.0 - (extraMonths * 0.1));
  }

  const isSuspicious = Boolean(voterData.flaggedBrigading || voterData.flaggedMultiAccount || voterData.burstPenalty);

  // Aplica decaimento e o chão B2B de 0.1 (o motor B2C permite ir a 0.0; o B2B
  // nunca deixa o peso zerar — quem decide bloquear é o Risk Engine, não o trust).
  let finalTrust = baseTrust * decayFactor;
  finalTrust = Math.max(0.1, Math.min(1.5, Math.round(finalTrust * 1000) / 1000));

  return {
    trustWeight: finalTrust,
    isSuspicious,
    decayFactor
  };
}

/**
 * Aplica teto individual ao peso do voto (diminishing returns) para evitar
 * que um único votante de trust elevado domine o consenso do anúncio.
 */
function capIndividualVoteWeight(rawWeight, currentAggregateWeight) {
  if (currentAggregateWeight <= 0) return Math.min(rawWeight, 1.0);
  const maxAllowed = Math.max(0.5, currentAggregateWeight * MAX_INDIVIDUAL_WEIGHT_SHARE);
  return Math.min(rawWeight, maxAllowed);
}

module.exports = {
  evaluateVoterTrust,
  capIndividualVoteWeight,
  MAX_INDIVIDUAL_WEIGHT_SHARE
};
