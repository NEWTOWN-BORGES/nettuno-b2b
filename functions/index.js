/**
 * NETTUNO B2B — Cloud Functions entrypoint (Gen 2).
 *
 * Só a camada B2B (Risk API, dashboard self-service, autenticação de
 * empresas). O sistema de votação B2C (submitVote, deleteMyAccount, training)
 * vive no repositório principal (SCM-HUNTERS) — não é duplicado aqui.
 *
 * Pré-requisitos de deploy: plano Blaze + projeto Firebase com Firestore.
 */
'use strict';

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();
getFirestore();

// Risk API V1 (shield/batch-shield/vote/signal/analyze).
exports.apiV1 = require('./b2b/apiV1').apiV1;

// Autenticação de empresas — registo (email/password) e bootstrap (Google Sign-In).
exports.registerCompany = require('./b2b/registerCompany').registerCompany;
Object.assign(exports, require('./b2b/ensureMarketplaceAccount'));

// Gestão self-service de API Keys (dashboard).
Object.assign(exports, require('./b2b/provisionApiKey'));
Object.assign(exports, require('./b2b/revokeApiKey'));
