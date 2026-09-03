'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateVoterTrust, capIndividualVoteWeight } = require('./voterTrust');
const { computeCommunitySignal } = require('./communitySignal');
const { calculateUserTrust } = require('../lib/trust');

describe('Voter Trust & Community Signal Suite', () => {
  it('calculates trust higher for older, verified, active accounts', () => {
    const now = Date.now();
    const oldVerifiedUser = {
      createdAt: now - (200 * 86400000), // 200 dias
      emailVerified: true,
      voteCount: 120,
      lastActiveAt: now
    };

    const newAnonUser = {
      createdAt: now - (0.5 * 86400000), // 12 horas
      emailVerified: false,
      voteCount: 1,
      lastActiveAt: now
    };

    const trustA = evaluateVoterTrust(oldVerifiedUser, now);
    const trustB = evaluateVoterTrust(newAnonUser, now);

    assert.ok(trustA.trustWeight > 1.0, 'Utilizador antigo e ativo deve ter trust > 1.0');
    assert.ok(trustB.trustWeight < 0.5, 'Conta muito nova deve ter trust < 0.5');
  });

  it('applies trust decay when voter has been inactive for > 60 days', () => {
    const now = Date.now();
    const activeUser = {
      createdAt: now - (300 * 86400000),
      emailVerified: true,
      voteCount: 150,
      lastActiveAt: now
    };

    const dormantUser = {
      createdAt: now - (300 * 86400000),
      emailVerified: true,
      voteCount: 150,
      lastActiveAt: now - (180 * 86400000) // Inativo há 6 meses
    };

    const trustActive = evaluateVoterTrust(activeUser, now);
    const trustDormant = evaluateVoterTrust(dormantUser, now);

    assert.ok(trustDormant.trustWeight < trustActive.trustWeight, 'Trust inativo deve decair');
    assert.ok(trustDormant.decayFactor < 1.0, 'Decay factor deve ser < 1.0');
  });

  it('caps individual voter weight to prevent single-voter dominance', () => {
    const capped = capIndividualVoteWeight(1.5, 2.0);
    assert.ok(capped <= 1.0, 'Voto individual é limitado proporcionalmente ao agregado');
  });

  it('delegates the base trust calculation to the shared B2C engine (lib/trust.js) — not a parallel reimplementation', () => {
    // Sem decaimento (lastActiveAt = now) nem chão/teto B2B, trustWeight deve
    // ser exatamente calculateUserTrust(...) — se alguém reintroduzir uma
    // fórmula própria aqui, este teste deteta a divergência.
    const now = Date.now();
    const voter = {
      createdAt: now - (90 * 86400000),
      emailVerified: true,
      voteCount: 30,
      reportCount: 4,
      lastActiveAt: now,
    };

    const expected = calculateUserTrust({
      createdAt: voter.createdAt,
      emailVerified: true,
      voteCount: 30,
      signalCount: 4,
      accuracyRate: null,
      trustPenalty: 0,
      flaggedMultiAccount: false,
    });

    const { trustWeight } = evaluateVoterTrust(voter, now);
    assert.equal(trustWeight, Math.max(0.1, Math.min(1.5, expected)));
  });

  it('detects suspicious negative vote velocity in communitySignal', () => {
    const now = Date.now();
    const normalVotes = [
      { type: 'POSITIVE', createdAt: now - 5000 },
      { type: 'POSITIVE', createdAt: now - 10000 },
      { type: 'POSITIVE', createdAt: now - 20000 }
    ];

    const burstAttackVotes = [
      { type: 'NEGATIVE', createdAt: now - 1000 },
      { type: 'NEGATIVE', createdAt: now - 2000 },
      { type: 'NEGATIVE', createdAt: now - 3000 },
      { type: 'NEGATIVE', createdAt: now - 4000 },
      { type: 'NEGATIVE', createdAt: now - 5000 },
      { type: 'NEGATIVE', createdAt: now - 6000 }
    ];

    const sigNormal = computeCommunitySignal(normalVotes, 10, now);
    const sigBurst = computeCommunitySignal(burstAttackVotes, 10, now);

    assert.equal(sigNormal.hasSuspiciousNegativeVelocity, false);
    assert.equal(sigNormal.priorityLevel, 'LOW');

    assert.equal(sigBurst.hasSuspiciousNegativeVelocity, true);
    assert.equal(sigBurst.priorityLevel, 'HIGH');
  });
});
