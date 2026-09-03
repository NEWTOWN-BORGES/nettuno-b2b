/**
 * Score Engine (server-side) — Modelo por COR com peso decrescente.
 * Especificação de produção: até 5 votos/utilizador/anúncio, cada voto adicional
 * vale menos (anti-spam), peso por cor, trust server-side.
 *
 *   peso final do voto = trustWeight × voteDecay(voteNumber) × colorWeight(cor)
 *
 * Score do anúncio = Bayesian Beta + Wilson (0–100), começa neutro (50).
 * Estados: RISK <40 · SAFE 40–75 · TRUSTED ≥75.
 *
 * Toda a matemática é pura/testável aqui; a orquestração Firestore está em index.js.
 * CommonJS (firebase-functions).
 */

// ── Constantes da especificação ──────────────────────────────────────
const COLOR_WEIGHT = { green: 1.0, yellow: 0.2, red: -1.3 };
const COLORS = Object.keys(COLOR_WEIGHT);

// Peso decrescente por nº de voto do MESMO utilizador no MESMO anúncio.
// 1º=100% … 5º=5%. Acima de 5 → 0 (limite de votos).
const VOTE_DECAY = [1.0, 0.60, 0.35, 0.15, 0.05];
const MAX_VOTES_PER_AD = VOTE_DECAY.length; // 5

// Cooldown server-side por cor (ms). Vermelho tem mais fricção (anti-brigading).
const COOLDOWN_MS = { green: 1000, yellow: 3000, red: 5000 };

const ALPHA = 2, BETA = 2;

// ── Helpers puros ────────────────────────────────────────────────────

function isValidColor(color) {
  return Object.prototype.hasOwnProperty.call(COLOR_WEIGHT, color);
}

function colorWeight(color) {
  return isValidColor(color) ? COLOR_WEIGHT[color] : null;
}

/**
 * Factor de decaimento para o n-ésimo voto (1-indexado).
 * voteNumber 1→1.0, 2→0.6, …, 5→0.05, >5→0.
 */
function voteDecay(voteNumber) {
  const i = Math.floor(voteNumber) - 1;
  if (i < 0 || i >= VOTE_DECAY.length) return 0;
  return VOTE_DECAY[i];
}

/**
 * Peso efetivo (assinado) de um voto.
 * @returns {number|null} null se cor inválida; 0 se exceder o limite de votos.
 */
function effectiveWeight(color, trustWeight, voteNumber) {
  const cw = colorWeight(color);
  if (cw === null) return null;
  const t = Math.max(0, Math.min(1.5, parseFloat(trustWeight)));
  const decay = voteDecay(voteNumber);
  return +(t * decay * cw).toFixed(6);
}

function wilsonScore(pos, neg, z = 1.96) {
  const n = pos + neg;
  if (n <= 0) return 0;
  const p = pos / n;
  const z2 = z * z;
  const num = p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return Math.max(0, Math.min(1, num / (1 + z2 / n)));
}

/**
 * Dobra um peso efetivo no agregado ponderado. delta=+1 adiciona, -1 reverte.
 * wPos = soma dos pesos positivos; wNeg = soma dos |pesos negativos|.
 */
function foldWeighted(agg, effW, delta) {
  let wPos = parseFloat(agg.wPos) || 0;
  let wNeg = parseFloat(agg.wNeg) || 0;
  if (effW >= 0) wPos += delta * effW;
  else           wNeg += delta * Math.abs(effW);
  return { wPos: Math.max(0, +wPos.toFixed(6)), wNeg: Math.max(0, +wNeg.toFixed(6)) };
}

/**
 * Calcula score (0-100) e estado a partir dos pesos acumulados.
 * @param {number} wPos  soma ponderada positiva
 * @param {number} wNeg  soma ponderada negativa (abs)
 * @param {number} total nº de votos contabilizados (para confiança estatística)
 */
function finalizeState(wPos, wNeg, total) {
  wPos = Math.max(0, wPos);
  wNeg = Math.max(0, wNeg);
  total = Math.max(0, Math.round(total));

  // Bayesian Beta: começa em 0.5 (neutro) com 0 votos.
  const bayes = (wPos + ALPHA) / (wPos + wNeg + ALPHA + BETA);
  // Wilson como dampener de confiança estatística (ganha peso com volume).
  const wilson = wilsonScore(wPos, wNeg);
  const wilsonWeight = Math.min(0.6, total / 10);
  let confidence = (1 - wilsonWeight) * bayes + wilsonWeight * wilson;
  if (total === 0) confidence = 0.5; // anúncio novo → neutro

  const score = Math.round(confidence * 1000) / 10;          // 0–100, 1 casa
  const weightedScore = (wPos + wNeg) > 0                      // % ponderada pura
    ? Math.round((wPos / (wPos + wNeg)) * 1000) / 10
    : 50.0;

  let trustState = 'SAFE';
  if (score < 40)       trustState = 'RISK';
  else if (score >= 75) trustState = 'TRUSTED';
  // 40 ≤ score < 75 → SAFE

  return {
    score,
    weightedScore,
    trustState,
    wPos: +wPos.toFixed(6),
    wNeg: +wNeg.toFixed(6),
    total,
  };
}

module.exports = {
  COLOR_WEIGHT, COLORS, VOTE_DECAY, MAX_VOTES_PER_AD, COOLDOWN_MS, ALPHA, BETA,
  isValidColor, colorWeight, voteDecay, effectiveWeight, wilsonScore,
  foldWeighted, finalizeState,
};
