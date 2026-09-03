'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateSignals } = require('./signalEngine');
const { shouldTriggerAnalysis, computeContentHash } = require('./adaptiveRisk');

describe('Signal Engine & Adaptive Risk Suite', () => {
  it('returns NORMAL action and low score when listing has no suspicious patterns', () => {
    const listing = {
      title: 'PlayStation 5 com 2 comandos',
      description: 'Entrega em mãos em Lisboa. Estado impecável.',
      price: 450
    };

    const res = evaluateSignals(listing);
    assert.equal(res.action, 'NORMAL');
    assert.ok(res.suspicionScore < 30);
    assert.equal(res.signals.length, 0);
  });

  it('triggers ANALYZE when multiple suspicious payment evasion patterns match', () => {
    // 3 padrões distintos → score = 75 → ANALYZE
    const listing = {
      title: 'iPhone 15 Pro Max 1TB Urgente Apenas Hoje motivo de viagem',
      description: 'Envie contacto para WhatsApp +351912345678 e transferência fora do site e pagamento por mbway codigo adiantado',
      price: 250
    };

    const res = evaluateSignals(listing);
    assert.equal(res.action, 'ANALYZE', `Esperado ANALYZE mas obteve ${res.action} (score: ${res.suspicionScore})`);
    assert.ok(res.suspicionScore >= 70, `Score ${res.suspicionScore} abaixo do threshold`);
  });

  it('only evaluates price anomaly when a reliable baseline is provided', () => {
    const cheapListing = { title: 'MacBook M3', price: 200 };
    
    // Sem baseline confiável -> Não emite sinal de preço
    const resNoBaseline = evaluateSignals(cheapListing);
    const hasPriceSignalNoBase = resNoBaseline.signals.some(s => s.code.includes('PRICE'));
    assert.equal(hasPriceSignalNoBase, false, 'Sem baseline não deve gerar sinal de preço');

    // Com baseline confiável (ex: 1200€) -> Emite desvio severo
    const resWithBaseline = evaluateSignals(cheapListing, { baselinePrice: 1200 });
    const hasPriceSignalWithBase = resWithBaseline.signals.some(s => s.code.includes('PRICE'));
    assert.equal(hasPriceSignalWithBase, true, 'Com baseline válida deve gerar sinal de preço');
  });

  it('triggers analysis when contentHash changes between updates', () => {
    const listingOriginal = { title: 'Bicicleta Scott', price: 500 };
    const hashOriginal = computeContentHash(listingOriginal);

    const listingModified = { title: 'Bicicleta Scott Top', price: 150 };
    const decision = shouldTriggerAnalysis(listingModified, [], {
      previousContentHash: hashOriginal,
      canaryRate: 0 // desliga canary para teste determinístico
    });

    assert.equal(decision.shouldAnalyze, true);
    assert.equal(decision.reason, 'CONTENT_CHANGED');
  });
});
