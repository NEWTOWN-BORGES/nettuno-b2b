'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isValidPhase, isValidSignal, SIGNAL_CATALOG, SUB_SIGNAL_CODES } = require('./communitySignalCatalog');

describe('communitySignalCatalog', () => {
  it('accepts only the three real phases', () => {
    assert.equal(isValidPhase('contact'), true);
    assert.equal(isValidPhase('interaction'), true);
    assert.equal(isValidPhase('result'), true);
    assert.equal(isValidPhase('stats'), false);
    assert.equal(isValidPhase('bogus'), false);
    assert.equal(isValidPhase(''), false);
  });

  it('validates a signal against its own phase only', () => {
    assert.equal(isValidSignal('contact', 'doesnt_answer'), true);
    assert.equal(isValidSignal('interaction', 'doesnt_answer'), false, 'doesnt_answer pertence a contact, não interaction');
    assert.equal(isValidSignal('result', 'scam'), true);
    assert.equal(isValidSignal('contact', 'scam'), false, 'scam pertence a result, não contact');
  });

  it('rejects unknown or malformed signal codes', () => {
    assert.equal(isValidSignal('contact', 'nao_existe'), false);
    assert.equal(isValidSignal('contact', ''), false);
    assert.equal(isValidSignal('contact', undefined), false);
    assert.equal(isValidSignal('contact', 123), false);
  });

  it('accepts sub-signal codes for any phase (used by hasSub cards)', () => {
    for (const sub of SUB_SIGNAL_CODES) {
      assert.equal(isValidSignal('interaction', sub), true);
    }
  });

  it('catalog matches the known default counts (8 contact / 7 interaction / 5 result)', () => {
    assert.equal(SIGNAL_CATALOG.contact.length, 8);
    assert.equal(SIGNAL_CATALOG.interaction.length, 7);
    assert.equal(SIGNAL_CATALOG.result.length, 5);
  });
});
