'use strict';

/**
 * Nettuno Cloud — registerCompany (callable, público/não autenticado).
 *
 * Regista uma nova conta de empresa (marketplace): valida os dados recebidos no
 * servidor, aplica rate limiting por IP, cria o utilizador Firebase Auth via
 * Admin SDK e o documento `marketplaces/{uid}` com `plan`/`status` SEMPRE
 * definidos pelo servidor — nunca aceites do cliente.
 *
 * Porquê isto existe: o registo atual (dashboard/login.html) cria a conta e o
 * documento marketplaces/{uid} diretamente do browser (createUserWithEmailAndPassword
 * + Firestore .set()), incluindo os campos `plan`/`status`. Como as Firestore Rules
 * só restringem `update` (não `create`), qualquer pessoa podia autoatribuir-se
 * `plan: 'enterprise'` ou outro estado na criação. Este endpoint fecha essa
 * lacuna: passa a ser o ÚNICO caminho para criar `marketplaces/{uid}`.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { logger } = require('firebase-functions');
const { RateLimiter } = require('./rateLimiter');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Letras (com acentos), números, espaço e pontuação comum de nomes de empresa.
const COMPANY_NAME_RE = /^[\p{L}\p{N}\s\-.,&']{2,80}$/u;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const DEFAULT_PLAN = 'developer';

// Instância PRÓPRIA — não partilha estado com o globalRateLimiter da Risk API
// (functions/b2b/rateLimiter.js), que é para tráfego de API autenticado por
// chave. Aqui o limite é muito mais apertado, porque é anterior a qualquer
// autenticação: precisa de travar criação em massa de contas por IP.
const registrationLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hora
  maxRequests: 5,           // 5 registos / IP / hora
});

/**
 * Valida e normaliza o input recebido. Lança HttpsError('invalid-argument', ...)
 * em caso de dados inválidos. Exportada separadamente para ser testável sem
 * precisar de inicializar o Firebase Admin SDK.
 */
function validateRegistrationInput(data) {
  const email = String((data && data.email) || '').trim().toLowerCase();
  const password = String((data && data.password) || '');
  const companyName = String((data && data.companyName) || '').trim();

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    throw new HttpsError('invalid-argument', 'Email inválido.');
  }
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `A palavra-passe deve ter entre ${MIN_PASSWORD_LENGTH} e ${MAX_PASSWORD_LENGTH} caracteres.`
    );
  }
  if (!companyName || !COMPANY_NAME_RE.test(companyName)) {
    throw new HttpsError('invalid-argument', 'Nome da empresa inválido (2–80 caracteres).');
  }

  return { email, password, companyName };
}

function extractClientIp(rawRequest) {
  if (!rawRequest) return 'unknown';
  const forwarded = rawRequest.headers && rawRequest.headers['x-forwarded-for'];
  const ip = rawRequest.ip || forwarded || 'unknown';
  // x-forwarded-for pode ser uma lista "cliente, proxy1, proxy2" — o primeiro é o real.
  return String(ip).split(',')[0].trim();
}

exports.registerCompany = onCall(
  { region: 'europe-west1', enforceAppCheck: false, cors: true, invoker: 'public' },
  async (request) => {
    // 1. Rate limiting por IP — antes de tocar em Auth/Firestore.
    const clientIp = extractClientIp(request.rawRequest);
    const rate = registrationLimiter.check(`register:${clientIp}`);
    if (!rate.allowed) {
      logger.warn('register_rate_limited', { ip: clientIp, count: rate.current });
      throw new HttpsError(
        'resource-exhausted',
        `Demasiados registos a partir deste IP. Tenta novamente em ${Math.ceil(rate.resetMs / 60000)} min.`
      );
    }

    // 2. Validação server-side dos dados recebidos.
    const { email, password, companyName } = validateRegistrationInput(request.data);

    const db = getFirestore();
    const auth = getAuth();

    // 3. Criar o utilizador Firebase Auth via Admin SDK — nunca client-side.
    //    A password só existe nesta função; nunca é escrita em Firestore/logs.
    let userRecord;
    try {
      userRecord = await auth.createUser({
        email,
        password,
        displayName: companyName,
      });
    } catch (err) {
      if (err.code === 'auth/email-already-exists') {
        throw new HttpsError('already-exists', 'Já existe uma conta com este email.');
      }
      logger.error('register_auth_create_failed', { email, error: err.message });
      throw new HttpsError('internal', 'Não foi possível criar a conta.');
    }

    const uid = userRecord.uid;
    const now = Date.now();

    // 4. Criar marketplaces/{uid} — plan/status são SEMPRE fixos no servidor,
    //    nunca vindos de request.data (fecha a auto-elevação de plano).
    try {
      await db.doc(`marketplaces/${uid}`).set({
        uid,
        name: companyName,
        email,
        plan: DEFAULT_PLAN,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      // Rollback: não deixar um utilizador Auth órfão sem documento de marketplace.
      await auth.deleteUser(uid).catch(() => {});
      logger.error('register_firestore_write_failed', { uid, error: err.message });
      throw new HttpsError('internal', 'Não foi possível concluir o registo.');
    }

    // 5. Devolve um custom token — o cliente troca-o por sessão real com
    //    auth.signInWithCustomToken(token). A password nunca passou pelo SDK
    //    cliente nem foi persistida fora do Firebase Auth.
    const customToken = await auth.createCustomToken(uid);

    logger.info('company_registered', { uid, email, companyName });

    return { uid, customToken };
  }
);

exports.validateRegistrationInput = validateRegistrationInput;
exports.extractClientIp = extractClientIp;
