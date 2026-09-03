'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { toPublicRisk, unknownRisk, LEAK_KEYS } = require('./toPublicRisk');

describe('toPublicRisk', () => {
  it('returns unknown SAFE 50 when the ad is missing', () => {
    const r = toPublicRisk('olx_1', null);
    assert.equal(r.listingId, 'olx_1');
    assert.equal(r.score, 50);
    assert.equal(r.state, 'SAFE');
    assert.equal(r.evidence.source, 'unknown');
    assert.deepEqual(r.votes, { green: 0, yellow: 0, red: 0 });
  });

  it('maps community read-model fields and does not leak internals', () => {
    const ad = {
      adId: 'olx_99',
      score: 74.2,
      weightedScore: 82.3,
      trustState: 'SAFE',
      wPos: 41.7,
      wNeg: 9.2,
      total: 214,
      votes: { green: 183, yellow: 24, red: 7 },
      updatedAt: 1700000000000,
      schemaVersion: 3,
      ownerUid: 'secret-user',
      ipHash: 'abc',
      trustWeight: 1.2,
    };
    const r = toPublicRisk('olx_99', ad);
    assert.equal(r.listingId, 'olx_99');
    assert.equal(r.score, 74.2);
    assert.equal(r.state, 'SAFE');
    assert.deepEqual(r.votes, { green: 183, yellow: 24, red: 7 });
    assert.equal(r.evidence.source, 'community');
    assert.equal(r.model.name, 'adaptive-beta-v1');
    assert.equal(r.updatedAt, new Date(1700000000000).toISOString());

    const json = JSON.stringify(r);
    for (const k of LEAK_KEYS) {
      assert.equal(json.includes(`"${k}"`), false, `leaked ${k}`);
    }
    assert.equal('wPos' in r, false);
    assert.equal('weightedScore' in r, false);
    assert.equal('ownerUid' in r, false);
  });

  it('accepts trustState from the live ads read model', () => {
    const r = toPublicRisk('id_3', { score: 38, trustState: 'RISK', likes: 0, dislikes: 2 });
    assert.equal(r.state, 'RISK');
    assert.equal(r.score, 38);
  });

  it('falls back to likes/dislikes when votes map is absent', () => {
    const r = toPublicRisk('id_2', { likes: 4, dislikes: 1, trustState: 'TRUSTED', score: 80 });
    assert.deepEqual(r.votes, { green: 4, yellow: 0, red: 1 });
    assert.equal(r.state, 'TRUSTED');
  });

  it('reads Risk Engine signals from riskSignals (array), never from signals', () => {
    const ad = {
      score: 40,
      trustState: 'RISK',
      riskSignals: [{ code: 'SEVERE_PRICE_UNDERVALUE', severity: 'HIGH' }, { code: 'bad', severity: null }],
      // `signals` aqui é o mapa da comunidade — não deve nunca virar o array público.
      signals: { unrealistic_price: 3, doesnt_answer: 1 },
    };
    const r = toPublicRisk('id_4', ad);
    assert.deepEqual(r.signals, [
      { code: 'SEVERE_PRICE_UNDERVALUE', severity: 'HIGH' },
      { code: 'bad', severity: 'LOW' },
    ]);
  });

  it('exposes the community signals map and totalSignals separately from riskSignals', () => {
    const ad = {
      score: 60,
      trustState: 'SAFE',
      signals: { unrealistic_price: 3, doesnt_answer: '1' },
      totalSignals: 4,
    };
    const r = toPublicRisk('id_5', ad);
    assert.deepEqual(r.communitySignals, { unrealistic_price: 3, doesnt_answer: 1 });
    assert.equal(r.totalSignals, 4);
    assert.deepEqual(r.signals, []);
  });

  it('does not treat a legacy array-shaped signals field as community signals', () => {
    const ad = { score: 50, trustState: 'SAFE', signals: [{ code: 'X', severity: 'LOW' }] };
    const r = toPublicRisk('id_6', ad);
    assert.deepEqual(r.communitySignals, {});
    assert.deepEqual(r.signals, []); // riskSignals ausente -> array público vazio
  });
});

describe('unknownRisk', () => {
  it('matches the no-document contract', () => {
    const r = unknownRisk('x');
    assert.equal(r.score, 50);
    assert.equal(r.evidence.source, 'unknown');
  });
});
