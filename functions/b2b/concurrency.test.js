'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { consumeCreditsAtomic } = require('./metering');

describe('Concurrency & Atomic Metering Tests', () => {
  it('prevents race conditions when multiple parallel requests compete for remaining quota', async () => {
    // Simulação de base de dados em memória para transações atómicas
    const tenantStore = {
      tenant_abc: {
        status: 'active',
        quota: { monthlyCredits: 30, allowOverage: false },
        currentCycle: { period: new Date().toISOString().slice(0, 7), creditsUsed: 0 },
      },
    };

    let lock = Promise.resolve();

    const mockDb = {
      doc: (path) => ({
        path,
      }),
      runTransaction: async (updateFunction) => {
        // Enfileira transações concorrentes para garantir serialização isolada (como o Firestore faz)
        const currentLock = lock;
        let releaseLock;
        lock = new Promise((resolve) => { releaseLock = resolve; });
        await currentLock;

        try {
          const fakeTransaction = {
            get: async (ref) => {
              const id = ref.path.replace('tenants/', '');
              const data = tenantStore[id];
              return {
                exists: !!data,
                data: () => (data ? JSON.parse(JSON.stringify(data)) : null),
              };
            },
            set: (ref, update, options) => {
              const id = ref.path.replace('tenants/', '');
              if (!tenantStore[id]) {
                tenantStore[id] = update;
              } else {
                tenantStore[id].currentCycle = {
                  ...tenantStore[id].currentCycle,
                  ...update.currentCycle,
                };
              }
            },
          };

          return await updateFunction(fakeTransaction);
        } finally {
          releaseLock();
        }
      },
    };

    // Cenário: Quota de 30 créditos.
    // 2 pedidos paralelos simultâneos solicitam 20 créditos cada (Total 40 > 30).
    const p1 = consumeCreditsAtomic(mockDb, 'tenant_abc', 20);
    const p2 = consumeCreditsAtomic(mockDb, 'tenant_abc', 20);

    const results = await Promise.allSettled([p1, p2]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exatamente 1 pedido deve ter sucesso e 1 deve ser rejeitado com 402 Quota Exceeded
    assert.equal(fulfilled.length, 1, 'Apenas 1 pedido deve ser aprovado');
    assert.equal(rejected.length, 1, '1 pedido deve ser rejeitado');
    assert.equal(rejected[0].reason.status, 402);
    assert.match(rejected[0].reason.message, /Quota mensal de créditos excedida/);

    // O saldo consumido deve ser exatamente 20, NUNCA 40 nem negativo
    assert.equal(tenantStore.tenant_abc.currentCycle.creditsUsed, 20);
  });
});
