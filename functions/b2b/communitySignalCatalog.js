/**
 * Allow-list server-side dos códigos de sinal que o endpoint POST /v1/listings/{id}/signal
 * aceita, por fase. É uma cópia deliberada do catálogo `default` (Idealista/genérico) de
 * apps/extension/scm-hunters-firebase/signals-data.js — os mesmos ~20 sinais que a extensão
 * usa para qualquer plataforma sem catálogo próprio.
 *
 * MANTER SINCRONIZADO com packages/nettuno-sdk/panel-data.js (o SDK usa a mesma lista para
 * desenhar os cartões clicáveis das abas CONTACTO/INTERAÇÃO/RESULTADO).
 */
'use strict';

const PHASES = Object.freeze({ CONTACT: 'contact', INTERACTION: 'interaction', RESULT: 'result' });

const SIGNAL_CATALOG = Object.freeze({
  contact: Object.freeze([
    'unrealistic_price', 'no_photos', 'doesnt_answer', 'number_off_or_fake',
    'seen_no_reply', 'ai_generated_photos', 'answered_call', 'replied_messages',
  ]),
  interaction: Object.freeze([
    'visit_done', 'clear_communication', 'refused_visit', 'wrong_location',
    'stopped_responding', 'asked_money_upfront', 'redirected_convo',
  ]),
  result: Object.freeze([
    'success', 'trusted_seller', 'scam', 'lost_money', 'suspicious',
  ]),
});

// Sub-sinais válidos para qualquer sinal com hasSub:true (hoje só 'redirected_convo').
const SUB_SIGNAL_CODES = Object.freeze([
  'redirect_whatsapp', 'redirect_telegram', 'redirect_sms', 'redirect_email', 'redirect_outro',
]);

function isValidPhase(phase) {
  return Object.values(PHASES).includes(phase);
}

function isValidSignal(phase, signal) {
  if (typeof signal !== 'string') return false;
  if (SUB_SIGNAL_CODES.includes(signal)) return true;
  const list = SIGNAL_CATALOG[phase];
  return Array.isArray(list) && list.includes(signal);
}

module.exports = { PHASES, SIGNAL_CATALOG, SUB_SIGNAL_CODES, isValidPhase, isValidSignal };
