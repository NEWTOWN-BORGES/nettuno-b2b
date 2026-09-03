'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { RiskQueue } = require('./riskQueue');

describe('Risk Queue Suite (Async Queue & Deduplication)', () => {
  it('deduplicates in-flight tasks for the same listingId and contentHash', async () => {
    const queue = new RiskQueue({ maxConcurrent: 2 });
    
    // Mock DB
    const mockDb = {
      doc: () => ({
        get: async () => ({ exists: true, data: () => ({ score: 75, state: 'TRUSTED' }) }),
        set: async () => {}
      }),
      runTransaction: async (fn) => {
        return fn({
          get: async () => ({
            exists: true,
            data: () => ({
              status: 'active',
              plan: 'developer',
              currentCycle: { creditsUsed: 10 },
              quota: { monthlyCredits: 5000 }
            })
          }),
          set: () => {}
        });
      }
    };

    const res1 = await queue.enqueue(mockDb, 'mkt_1', 'ad_100', 'hash_abc', {});
    const res2 = await queue.enqueue(mockDb, 'mkt_1', 'ad_100', 'hash_abc', {});

    assert.equal(res1.status, 'ENQUEUED');
    assert.equal(res2.status, 'IN_FLIGHT', 'O segundo pedido com o mesmo hash entra em IN_FLIGHT sem duplicar');

    // Aguarda o processamento
    await new Promise(r => setTimeout(r, 50));
    assert.equal(queue.inFlightDedupe.size, 0, 'Após conclusão, a dedupeKey é limpa');
  });

  it('stops processing and warns when quota is exhausted', async () => {
    const queue = new RiskQueue({ maxConcurrent: 1 });
    
    const mockDbExhausted = {
      doc: () => ({ get: async () => ({ exists: false }) }),
      runTransaction: async () => {
        const err = new Error('Quota mensal excedida.');
        err.status = 402;
        throw err;
      }
    };

    await queue.enqueue(mockDbExhausted, 'mkt_exhausted', 'ad_999', 'hash_xyz', {});
    await new Promise(r => setTimeout(r, 50));

    // A fila não deve quebrar
    assert.equal(queue.activeWorkers, 0);
  });

  it('never overwrites the community signals map with the Risk Engine array (collision regression)', async () => {
    const queue = new RiskQueue({ maxConcurrent: 1 });
    let capturedSetPayload = null;
    // Simula um anúncio que já tem sinais reportados pela comunidade (extensão/endpoint /signal).
    const existingAd = { signals: { unrealistic_price: 3 }, totalSignals: 3 };

    const mockDb = {
      doc: (path) => ({
        get: async () => (path === 'ads/ad_collision'
          ? { exists: true, data: () => existingAd }
          : { exists: false }),
        set: async (payload) => {
          if (path === 'ads/ad_collision') capturedSetPayload = payload;
        }
      }),
      collection: () => ({ get: async () => ({ docs: [] }) })
    };

    // marketplaceId 'default' faz consumeCreditsAtomic devolver sucesso sem tocar em runTransaction.
    await queue.enqueue(mockDb, 'default', 'ad_collision', 'hash_1', { title: 'anuncio de teste' });
    await new Promise(r => setTimeout(r, 50));

    assert.ok(capturedSetPayload, 'a fila deve persistir o resultado em ads/{id}');
    assert.equal('signals' in capturedSetPayload, false,
      'o Risk Engine nunca pode escrever a chave "signals" (mapa da comunidade)');
    assert.ok(Array.isArray(capturedSetPayload.riskSignals),
      'o array de sinais detetados deve ir para "riskSignals", não para "signals"');
  });
});
