/**
 * NETTUNO B2B — Low-Cost Signal Engine (Pre-Filter).
 */
'use strict';

const SUSPICIOUS_TEXT_PATTERNS = [
  /\b(?:mbway|mb\s*way)\s+(?:por\s+mensagem|envie\s+contacto|adiantado|codigo|código|sinal)\b/i,
  /\b(?:pagamento|transferencia|transferência)\s+(?:fora\s+do\s+site|direto|directo|antecipado|sinal)\b/i,
  /\b(?:contacto|contacte|fale|envie)\s+(?:pelo\s+)?(?:whatsapp|telegram|signal)\s*[:=]?\s*(?:\+?\d{9,15}|@[\w_]+)\b/i,
  /\b(?:urgente|apenas\s+hoje|oportunidade\s+unica|motivo\s+de\s+viagem|heranca)\b/i,
];

/**
 * Avalia sinais leves do anúncio e emite um suspicionScore.
 */
function evaluateSignals(listing = {}, options = {}) {
  let score = 0;
  const signals = [];

  const title = String(listing.title || listing.t || '');
  const description = String(listing.description || listing.desc || '');
  const fullText = `${title} ${description}`;
  const price = Number(listing.price || listing.p) || null;

  // 1. Verificação de Padrões de Texto Concretos
  let textFlagCount = 0;
  for (const pattern of SUSPICIOUS_TEXT_PATTERNS) {
    if (pattern.test(fullText)) {
      textFlagCount++;
    }
  }

  if (textFlagCount >= 3) {
    score += 75;
    signals.push({ code: 'CRITICAL_SUSPICIOUS_TEXT_PATTERNS', severity: 'HIGH' });
  } else if (textFlagCount === 2) {
    score += 50;
    signals.push({ code: 'SUSPICIOUS_CONTACT_OR_PAYMENT_EVASION', severity: 'HIGH' });
  } else if (textFlagCount === 1) {
    score += 25;
    signals.push({ code: 'SUSPICIOUS_KEYWORD_FLAG', severity: 'MEDIUM' });
  }

  // 2. Anomalia de Preço (APENAS se baseline confiável existir)
  const baseline = options.baselinePrice;
  if (typeof baseline === 'number' && baseline > 10 && price !== null && price > 0) {
    const deviation = (baseline - price) / baseline;
    if (deviation >= 0.65) {
      score += 40;
      signals.push({ code: 'SEVERE_PRICE_UNDERVALUE', severity: 'HIGH' });
    } else if (deviation >= 0.40) {
      score += 20;
      signals.push({ code: 'MODERATE_PRICE_UNDERVALUE', severity: 'MEDIUM' });
    }
  }

  // 3. Integração com Community Signal
  const comm = options.communitySignal;
  if (comm && typeof comm === 'object') {
    if (comm.hasSuspiciousNegativeVelocity) {
      score += 50;
      signals.push({ code: 'RAPID_NEGATIVE_COMMUNITY_VELOCITY', severity: 'HIGH' });
    } else if (comm.priorityLevel === 'HIGH') {
      score += 35;
      signals.push({ code: 'STRONG_NEGATIVE_COMMUNITY_CONSENSUS', severity: 'HIGH' });
    } else if (comm.priorityLevel === 'MEDIUM') {
      score += 15;
      signals.push({ code: 'MODERATE_COMMUNITY_CONCERN', severity: 'LOW' });
    }
  }

  const finalScore = Math.max(0, Math.min(100, score));

  let action = 'NORMAL';
  if (finalScore >= 70) {
    action = 'ANALYZE';
  } else if (finalScore >= 30) {
    action = 'MONITOR';
  }

  return {
    suspicionScore: finalScore,
    action,
    signals,
    evaluatedAt: Date.now()
  };
}

module.exports = {
  evaluateSignals,
  SUSPICIOUS_TEXT_PATTERNS
};
