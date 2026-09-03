'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { HttpsError } = require('firebase-functions/v2/https');
const { validateRegistrationInput, extractClientIp } = require('./registerCompany');

describe('registerCompany — validateRegistrationInput', () => {
  it('accepts well-formed input and normalizes email/trims fields', () => {
    const out = validateRegistrationInput({
      email: '  Dev@Marketplace.COM  ',
      password: 'correcthorsebattery',
      companyName: '  Vedix Marketplace  ',
    });
    assert.equal(out.email, 'dev@marketplace.com');
    assert.equal(out.companyName, 'Vedix Marketplace');
    assert.equal(out.password, 'correcthorsebattery');
  });

  it('rejects an invalid email', () => {
    assert.throws(
      () => validateRegistrationInput({ email: 'not-an-email', password: 'correcthorsebattery', companyName: 'Vedix' }),
      HttpsError
    );
  });

  it('rejects a password shorter than the minimum', () => {
    assert.throws(
      () => validateRegistrationInput({ email: 'a@b.com', password: 'short', companyName: 'Vedix' }),
      HttpsError
    );
  });

  it('rejects an empty or invalid company name', () => {
    assert.throws(
      () => validateRegistrationInput({ email: 'a@b.com', password: 'correcthorsebattery', companyName: '' }),
      HttpsError
    );
    assert.throws(
      () => validateRegistrationInput({ email: 'a@b.com', password: 'correcthorsebattery', companyName: '<script>' }),
      HttpsError
    );
  });

  it('never lets the caller set plan/status via input — they are not part of the accepted shape', () => {
    const out = validateRegistrationInput({
      email: 'a@b.com',
      password: 'correcthorsebattery',
      companyName: 'Vedix',
      plan: 'enterprise',
      status: 'active',
    });
    assert.equal('plan' in out, false);
    assert.equal('status' in out, false);
  });
});

describe('registerCompany — extractClientIp', () => {
  it('prefers rawRequest.ip when present', () => {
    const ip = extractClientIp({ ip: '203.0.113.5', headers: { 'x-forwarded-for': '198.51.100.1' } });
    assert.equal(ip, '203.0.113.5');
  });

  it('falls back to the first address in x-forwarded-for', () => {
    const ip = extractClientIp({ headers: { 'x-forwarded-for': '198.51.100.1, 10.0.0.1' } });
    assert.equal(ip, '198.51.100.1');
  });

  it('returns "unknown" when nothing is available', () => {
    assert.equal(extractClientIp(null), 'unknown');
    assert.equal(extractClientIp({ headers: {} }), 'unknown');
  });
});
