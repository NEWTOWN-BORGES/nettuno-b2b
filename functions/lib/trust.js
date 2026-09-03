/**
 * User Trust (server-side) — escala 0.0–1.5 (especificação de produção).
 *   0.0 → muito suspeito · 0.5 → neutro · 1.0 → confiável · 1.5 → altamente confiável
 *
 * Calculado SEMPRE no servidor (o cliente nunca define o seu peso).
 * Usa só sinais disponíveis no doc users/{uid}; sinais de fraude (burst,
 * multi-conta) entram como `trustPenalty`/`flaggedMultiAccount` escritos por
 * deteção server-side.
 */

const DAY_MS = 86400000;

function calculateUserTrust(u = {}) {
  const now = Date.now();
  let trust = 0.5; // neutro

  // Idade da conta
  const createdAt = typeof u.createdAt === 'number' ? u.createdAt : now;
  const ageDays = (now - createdAt) / DAY_MS;
  if (ageDays > 180)      trust += 0.30;
  else if (ageDays > 30)  trust += 0.15;
  else if (ageDays < 1)   trust -= 0.20; // conta muito nova

  // Conta Google associada (email verificado)
  if (u.emailVerified || u.email) trust += 0.20;

  // Atividade legítima (votos + sinais)
  const activity = (u.voteCount || 0) + (u.signalCount || 0) * 0.5;
  if (activity >= 200)      trust += 0.30;
  else if (activity >= 50)  trust += 0.20;
  else if (activity >= 10)  trust += 0.10;

  // Precisão histórica (−0.2 … +0.2)
  if (u.accuracyRate != null && !isNaN(u.accuracyRate)) {
    const acc = Math.max(0, Math.min(1, u.accuracyRate));
    trust += (acc - 0.5) * 0.4;
  }

  // Penalizações por padrões suspeitos (escritas por deteção server-side)
  if (u.trustPenalty)        trust -= Math.min(0.6, u.trustPenalty);
  if (u.flaggedMultiAccount) trust -= 0.30;

  return Math.max(0.0, Math.min(1.5, +trust.toFixed(3)));
}

module.exports = { calculateUserTrust };
