/**
 * Nettuno Cloud — Adaptive Risk API V1 (HTTP Beta).
 * 
 * Separação Estrita de Recursos:
 *   - Shield data requests (/shield, /batch-shield) → 0 Risk Units
 *   - Community Voting (/vote)                     → 0 Risk Units
 *   - Signal Engine Pre-filter                      → 0 Risk Units
 *   - Risk Analysis on demand (/analyze)            → 1 Risk Unit (processado via fila assíncrona)
 *   - Sandbox testing (/test/analyze)               → 0 Risk Units
 */
'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');
const crypto = require('crypto');
const { authenticateApiKey } = require('./authApiKey');
const { toPublicRisk, unknownRisk, assertNoLeak } = require('./toPublicRisk');
const { globalRiskCache } = require('./riskCache');
const { evaluateQuota, consumeCreditsAtomic } = require('./metering');
const { shouldTriggerAnalysis, computeContentHash } = require('./adaptiveRisk');
const { globalRiskQueue } = require('./riskQueue');
const { computeCommunitySignal } = require('./communitySignal');
const { isValidPhase, isValidSignal } = require('./communitySignalCatalog');

const AD_ID_RE = /^[a-zA-Z0-9_\-:.]{1,256}$/;
const BATCH_MAX = 50;
const API_VERSION = '2026-08-01-beta';

function sendJson(res, status, body, headers = {}) {
  res.set('Content-Type', 'application/json; charset=utf-8');
  for (const [k, v] of Object.entries(headers)) {
    res.set(k, String(v));
  }
  res.status(status).send(JSON.stringify(body));
}

const CORS_METHODS = 'GET, POST, OPTIONS';
const CORS_HEADERS = 'Authorization, Content-Type, X-Nettuno-Client, Idempotency-Key';
const CORS_EXPOSE = 'X-Nettuno-Credits-Used, X-Nettuno-Quota-Remaining, X-Nettuno-Cache, X-Nettuno-Request-Id, X-Nettuno-Mode, X-RateLimit-Limit, X-RateLimit-Remaining';

/**
 * Preflight (OPTIONS) — não expõe nenhum dado do tenant, por isso pode ser
 * respondido de forma permissiva sem conhecer ainda a API key (o browser só
 * decide se avança com o pedido real; a restrição efetiva acontece na resposta
 * do pedido real, já autenticado, via resolveAllowedOrigin()).
 */
function applyCorsPreflight(req, res) {
  const origin = req.headers.origin || '*';
  res.set('Access-Control-Allow-Origin', origin);
  if (origin !== '*') res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', CORS_METHODS);
  res.set('Access-Control-Allow-Headers', CORS_HEADERS);
  res.set('Access-Control-Expose-Headers', CORS_EXPOSE);
  res.set('Access-Control-Max-Age', '3600');
  res.status(204).send('');
}

/**
 * CORS restrito por marketplace: cada tenant pode configurar `allowedOrigins`
 * (array de origens, ex: ["https://vedix.com"]) no seu documento marketplaces/{uid}.
 * Sem essa configuração, mantém-se permissivo (compat com integrações existentes) —
 * é um endurecimento opt-in, não uma quebra retroativa.
 *
 * @returns {string|null} origem a devolver em Access-Control-Allow-Origin, ou
 *   null se não deve ser definida (o browser bloqueará a leitura da resposta).
 */
function resolveAllowedOrigin(req, tenantData) {
  const origin = req.headers.origin;
  if (!origin) return null; // pedidos server-to-server (sem Origin) não precisam de CORS

  const configured = Array.isArray(tenantData && tenantData.allowedOrigins)
    ? tenantData.allowedOrigins.filter((o) => typeof o === 'string' && o.length > 0 && o.length < 256)
    : [];

  if (configured.length === 0) return '*'; // sem allowlist definida → permissivo
  return configured.includes(origin) ? origin : null;
}

function pathOf(req) {
  const raw = String(req.path || req.url || '').split('?')[0];
  return raw.replace(/\/+$/, '') || '/';
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(String(req.body)); } catch { return {}; }
}

async function logApiRequest(db, auth, endpoint, status, credits, latencyMs, requestId) {
  if (!auth || !auth.tenantId || auth.tenantId === 'default') return;
  try {
    const logRef = db.collection(`marketplaces/${auth.tenantId}/logs`).doc(requestId);
    await logRef.set({
      requestId,
      keyId: auth.keyId || null,
      keyType: auth.keyType || 'live',
      endpoint,
      status,
      credits: Number(credits) || 0,
      latencyMs: Math.round(latencyMs),
      timestamp: Date.now(),
    });
  } catch (err) {
    logger.warn('b2b_log_fail', { error: err.message });
  }
}

/**
 * Lê o estado do Shield para um anúncio (0 créditos).
 * Se o anúncio for novo ou suspeito, enfileira para análise em background e retorna PENDING.
 */
async function resolveShieldState(db, marketplaceId, listingId, listingPayload = {}) {
  // 1. Consulta Cache L1
  const cached = globalRiskCache.get(listingId);
  if (cached) {
    return { data: cached, cacheStatus: 'HIT', credits: 0 };
  }

  // 2. Consulta Firestore
  const snap = await db.doc(`ads/${listingId}`).get();
  const existingData = snap.exists ? snap.data() : null;

  if (existingData) {
    const publicData = assertNoLeak(toPublicRisk(listingId, existingData));
    globalRiskCache.set(listingId, publicData, 300_000);
    return { data: publicData, cacheStatus: 'MISS', credits: 0 };
  }

  // 3. Anúncio sem análise prévia: avalia com Signal Engine
  const decision = shouldTriggerAnalysis(listingPayload, []);
  
  if (decision.shouldAnalyze) {
    // Enfileira assincronamente (não bloqueia o HTTP do Shield)
    globalRiskQueue.enqueue(db, marketplaceId, listingId, decision.contentHash, listingPayload);
    const pendingState = unknownRisk(listingId, 'PENDING');
    return { data: pendingState, cacheStatus: 'ENQUEUED', credits: 0 };
  }

  const defaultState = unknownRisk(listingId, 'SAFE');
  globalRiskCache.set(listingId, defaultState, 120_000);
  return { data: defaultState, cacheStatus: 'MISS', credits: 0 };
}

exports.apiV1 = onRequest(
  { cors: false, invoker: 'public', region: 'europe-west1', maxInstances: 20 },
  async (req, res) => {
    const startTime = performance.now();
    const requestId = 'req_' + crypto.randomBytes(8).toString('hex');

    if (req.method === 'OPTIONS') { applyCorsPreflight(req, res); return; }

    const db = getFirestore();
    const auth = await authenticateApiKey(db, req);

    const baseHeaders = {
      'X-Nettuno-Request-Id': requestId,
      'X-Nettuno-Api-Version': API_VERSION,
    };

    if (auth.error) {
      logger.info('b2b_auth_fail', { status: auth.status, error: auth.error, requestId });
      const extraHeaders = { ...baseHeaders };
      if (auth.rateStatus) {
        extraHeaders['X-RateLimit-Limit'] = auth.rateStatus.limit;
        extraHeaders['X-RateLimit-Remaining'] = auth.rateStatus.remaining;
      }
      // Falha de auth não expõe dados de tenant — permissivo é seguro aqui.
      const failOrigin = req.headers.origin;
      if (failOrigin) { res.set('Access-Control-Allow-Origin', failOrigin); res.set('Vary', 'Origin'); }
      return sendJson(res, auth.status, { error: auth.error, requestId }, extraHeaders);
    }

    // CORS restrito: só a partir daqui conhecemos o tenant (auth.tenantData).
    const allowedOrigin = resolveAllowedOrigin(req, auth.tenantData);
    if (allowedOrigin) {
      res.set('Access-Control-Allow-Origin', allowedOrigin);
      if (allowedOrigin !== '*') res.set('Vary', 'Origin');
    }
    // Sem allowedOrigin válida: não define o header — o browser bloqueia a
    // leitura da resposta pelo JS da página (a chamada em si ainda é processada
    // e contabilizada; é assim que o CORS é sempre aplicado, do lado do browser).

    const path = pathOf(req);
    const isTest = auth.isTest === true;
    const rateHeaders = {
      ...baseHeaders,
      'X-Nettuno-Mode': isTest ? 'test' : 'live',
      'X-RateLimit-Limit': auth.rateStatus.limit,
      'X-RateLimit-Remaining': auth.rateStatus.remaining,
    };

    try {
      // ─────────────────────────────────────────────────────────────
      // 1. GET /v1/listings/{id}/shield (0 Créditos — Visualização)
      // ─────────────────────────────────────────────────────────────
      const shieldMatch = path.match(/^\/(?:v1\/)?listings\/([^/]+)\/shield$/);
      if (req.method === 'GET' && shieldMatch) {
        const listingId = decodeURIComponent(shieldMatch[1]);
        if (!AD_ID_RE.test(listingId)) {
          return sendJson(res, 400, { error: 'listingId inválido.', requestId }, rateHeaders);
        }

        const { data: shieldData, cacheStatus } = await resolveShieldState(db, auth.tenantId, listingId);
        const elapsed = performance.now() - startTime;
        await logApiRequest(db, auth, `/v1/listings/${listingId}/shield`, 200, 0, elapsed, requestId);

        return sendJson(res, 200, {
          ...shieldData,
          requestId,
          apiVersion: API_VERSION,
          cache: { status: cacheStatus }
        }, {
          ...rateHeaders,
          'X-Nettuno-Credits-Used': 0,
          'X-Nettuno-Cache': cacheStatus
        });
      }

      // ─────────────────────────────────────────────────────────────
      // 2. POST /v1/listings/batch-shield (0 Créditos — Batch de até 50)
      // ─────────────────────────────────────────────────────────────
      const batchShieldMatch = path.match(/^\/(?:v1\/)?listings\/batch-shield$/);
      if (req.method === 'POST' && batchShieldMatch) {
        const body = parseBody(req);
        const ids = Array.isArray(body.ids) ? body.ids : [];

        if (ids.length === 0) {
          return sendJson(res, 400, { error: 'O array de IDs não pode estar vazio.', requestId }, rateHeaders);
        }
        if (ids.length > BATCH_MAX) {
          return sendJson(res, 400, { error: `Batch excede o limite máximo de ${BATCH_MAX} IDs.`, requestId }, rateHeaders);
        }

        const results = [];
        for (const id of ids) {
          if (typeof id === 'string' && AD_ID_RE.test(id)) {
            const { data } = await resolveShieldState(db, auth.tenantId, id);
            results.push(data);
          }
        }

        const elapsed = performance.now() - startTime;
        await logApiRequest(db, auth, '/v1/listings/batch-shield', 200, 0, elapsed, requestId);

        return sendJson(res, 200, {
          results,
          count: results.length,
          creditsUsed: 0,
          requestId,
          apiVersion: API_VERSION
        }, {
          ...rateHeaders,
          'X-Nettuno-Credits-Used': 0
        });
      }

      // ─────────────────────────────────────────────────────────────
      // 3. POST /v1/listings/{id}/analyze (1 Risk Unit — Análise Profunda)
      // ─────────────────────────────────────────────────────────────
      const analyzeMatch = path.match(/^\/(?:v1\/)?listings\/([^/]+)\/analyze$/);
      if (req.method === 'POST' && analyzeMatch) {
        const listingId = decodeURIComponent(analyzeMatch[1]);
        if (!AD_ID_RE.test(listingId)) {
          return sendJson(res, 400, { error: 'listingId inválido.', requestId }, rateHeaders);
        }

        // Pré-verificação de Quota
        if (!isTest) {
          const preQuota = evaluateQuota(auth.tenantData, 1);
          if (!preQuota.allowed) {
            return sendJson(res, preQuota.status || 429, { error: preQuota.error, code: 'QUOTA_EXCEEDED', requestId }, rateHeaders);
          }
        }

        const body = parseBody(req);
        const contentHash = computeContentHash(body);

        // Enfileira para execução
        const enqueueRes = await globalRiskQueue.enqueue(db, auth.tenantId, listingId, contentHash, body);
        const elapsed = performance.now() - startTime;
        await logApiRequest(db, auth, `/v1/listings/${listingId}/analyze`, 200, isTest ? 0 : 1, elapsed, requestId);

        return sendJson(res, 200, {
          listingId,
          status: enqueueRes.status,
          message: 'Análise profunda enfileirada com sucesso.',
          requestId,
          apiVersion: API_VERSION
        }, {
          ...rateHeaders,
          'X-Nettuno-Credits-Used': isTest ? 0 : 1
        });
      }

      // ─────────────────────────────────────────────────────────────
      // 4. POST /v1/listings/{id}/vote (0 Créditos — Voto Comunitário)
      // ─────────────────────────────────────────────────────────────
      const voteMatch = path.match(/^\/(?:v1\/)?listings\/([^/]+)\/vote$/);
      if (req.method === 'POST' && voteMatch) {
        const listingId = decodeURIComponent(voteMatch[1]);
        if (!AD_ID_RE.test(listingId)) {
          return sendJson(res, 400, { error: 'listingId inválido.', requestId }, rateHeaders);
        }

        const body = parseBody(req);
        const voteType = String(body.type || 'POSITIVE').toUpperCase();
        if (voteType !== 'POSITIVE' && voteType !== 'NEGATIVE') {
          return sendJson(res, 400, { error: 'type deve ser POSITIVE ou NEGATIVE.', requestId }, rateHeaders);
        }

        const voterId = String(body.voterId || auth.keyId).slice(0, 64);
        const now = Date.now();

        // Persiste voto na subcoleção do marketplace
        const voteDoc = {
          listingId,
          marketplaceId: auth.tenantId,
          voterId,
          type: voteType,
          createdAt: now
        };

        await db.collection(`ads/${listingId}/votes`).add(voteDoc);

        // Atualiza contadores agregados
        await db.doc(`ads/${listingId}`).set({
          votes: {
            [voteType === 'POSITIVE' ? 'green' : 'red']: FieldValue.increment(1)
          },
          updatedAt: now
        }, { merge: true });

        // Invalida cache para refletir voto
        globalRiskCache.delete(listingId);

        const elapsed = performance.now() - startTime;
        await logApiRequest(db, auth, `/v1/listings/${listingId}/vote`, 200, 0, elapsed, requestId);

        return sendJson(res, 200, {
          ok: true,
          listingId,
          voteRecorded: voteType,
          creditsUsed: 0,
          requestId,
          apiVersion: API_VERSION
        }, {
          ...rateHeaders,
          'X-Nettuno-Credits-Used': 0
        });
      }

      // ─────────────────────────────────────────────────────────────
      // 4b. POST /v1/listings/{id}/signal (0 Créditos — Sinal Comunitário granular)
      // Mesmo padrão do /vote (0 créditos, sem trust/dedup extra — gap já aceite no
      // /vote hoje, ver nota em voterTrust.js). Escreve no MESMO mapa `ads/{id}.signals`
      // que a extensão usa (recordSignal), nunca no array `riskSignals` do Risk Engine.
      // ─────────────────────────────────────────────────────────────
      const signalMatch = path.match(/^\/(?:v1\/)?listings\/([^/]+)\/signal$/);
      if (req.method === 'POST' && signalMatch) {
        const listingId = decodeURIComponent(signalMatch[1]);
        if (!AD_ID_RE.test(listingId)) {
          return sendJson(res, 400, { error: 'listingId inválido.', requestId }, rateHeaders);
        }

        const body = parseBody(req);
        const phase = String(body.phase || '');
        const signal = String(body.signal || '');
        const action = body.action === 'remove' ? 'remove' : 'add';

        if (!isValidPhase(phase)) {
          return sendJson(res, 400, { error: "phase deve ser 'contact', 'interaction' ou 'result'.", requestId }, rateHeaders);
        }
        if (!isValidSignal(phase, signal)) {
          return sendJson(res, 400, { error: `signal desconhecido para a fase '${phase}'.`, requestId }, rateHeaders);
        }

        const voterId = String(body.voterId || auth.keyId).slice(0, 64);
        const now = Date.now();
        const delta = action === 'remove' ? -1 : 1;

        await db.doc(`ads/${listingId}`).set({
          signals: { [signal]: FieldValue.increment(delta) },
          totalSignals: FieldValue.increment(delta),
          updatedAt: now
        }, { merge: true });

        globalRiskCache.delete(listingId);

        const elapsed = performance.now() - startTime;
        await logApiRequest(db, auth, `/v1/listings/${listingId}/signal`, 200, 0, elapsed, requestId);

        return sendJson(res, 200, {
          ok: true,
          listingId,
          signal,
          phase,
          action,
          voterId,
          creditsUsed: 0,
          requestId,
          apiVersion: API_VERSION
        }, {
          ...rateHeaders,
          'X-Nettuno-Credits-Used': 0
        });
      }

      // ─────────────────────────────────────────────────────────────
      // 5. POST /v1/test/analyze (Sandbox Test Endpoint)
      // ─────────────────────────────────────────────────────────────
      const testMatch = path.match(/^\/(?:v1\/)?test\/analyze$/);
      if (req.method === 'POST' && testMatch) {
        const body = parseBody(req);
        const scenario = String(body.scenario || 'SAFE').toUpperCase();
        const mockScore = scenario === 'RISK' ? 24 : (scenario === 'TRUSTED' ? 95 : (scenario === 'PENDING' ? 50 : 68));

        const mockResult = {
          listingId: body.listingId || 'test_sandbox_ad',
          state: scenario,
          score: mockScore,
          evidence: { source: 'sandbox_test_scenario' },
          votes: { green: scenario === 'RISK' ? 1 : 12, red: scenario === 'RISK' ? 9 : 0 },
          requestId,
          apiVersion: API_VERSION,
          sandbox: true
        };

        return sendJson(res, 200, mockResult, {
          ...rateHeaders,
          'X-Nettuno-Credits-Used': 0
        });
      }

      // ─────────────────────────────────────────────────────────────
      // 6. Legado Compatível: GET /v1/listings/{id}/risk (Consumo direto)
      // ─────────────────────────────────────────────────────────────
      const legacyOne = path.match(/^\/(?:v1\/)?listings\/([^/]+)\/risk$/);
      if (req.method === 'GET' && legacyOne) {
        const listingId = decodeURIComponent(legacyOne[1]);
        const { data: risk, cacheStatus } = await resolveShieldState(db, auth.tenantId, listingId);
        
        let remaining = 'unlimited';
        if (!isTest) {
          try {
            const m = await consumeCreditsAtomic(db, auth.tenantId, 1);
            remaining = m.remaining;
          } catch (_) {}
        }

        return sendJson(res, 200, {
          ...risk,
          requestId,
          apiVersion: API_VERSION
        }, {
          ...rateHeaders,
          'X-Nettuno-Credits-Used': isTest ? 0 : 1,
          'X-Nettuno-Quota-Remaining': remaining,
          'X-Nettuno-Cache': cacheStatus
        });
      }

      return sendJson(res, 404, { error: 'Endpoint desconhecido na Risk API V1.', requestId }, rateHeaders);

    } catch (err) {
      logger.error('b2b_internal_error', { error: err.message, stack: err.stack, requestId });
      return sendJson(res, 500, { error: 'Erro interno na Risk API.', requestId }, rateHeaders);
    }
  }
);

// Exportado só para testes unitários. index.js importa `apiV1` por nome (não
// via Object.assign wildcard) precisamente para que isto não vire um trigger.
exports.resolveAllowedOrigin = resolveAllowedOrigin;
