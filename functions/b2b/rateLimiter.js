/**
 * Nettuno Cloud — In-Memory Rate Limiter (Sliding Window / Token Bucket).
 * Proteção DoS/Burst sem custos de leituras/escritas de base de dados.
 */
'use strict';

class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60_000; // 1 minuto
    this.maxRequests = options.maxRequests || 120; // 120 req/min
    this.clients = new Map();
    this.cleanupIntervalMs = options.cleanupIntervalMs || 120_000;
    this.lastCleanup = Date.now();
  }

  check(clientId, customMax) {
    const now = Date.now();
    this._periodicCleanup(now);

    const limit = typeof customMax === 'number' ? customMax : this.maxRequests;
    let entry = this.clients.get(clientId);

    if (!entry || now - entry.windowStart >= this.windowMs) {
      entry = { windowStart: now, count: 1 };
      this.clients.set(clientId, entry);
      return {
        allowed: true,
        current: 1,
        limit,
        remaining: Math.max(0, limit - 1),
        resetMs: this.windowMs,
      };
    }

    entry.count++;
    const allowed = entry.count <= limit;
    const remaining = Math.max(0, limit - entry.count);
    const resetMs = Math.max(0, this.windowMs - (now - entry.windowStart));

    return {
      allowed,
      current: entry.count,
      limit,
      remaining,
      resetMs,
    };
  }

  reset(clientId) {
    if (clientId) {
      this.clients.delete(clientId);
    } else {
      this.clients.clear();
    }
  }

  _periodicCleanup(now) {
    if (now - this.lastCleanup < this.cleanupIntervalMs) return;
    this.lastCleanup = now;

    for (const [id, entry] of this.clients.entries()) {
      if (now - entry.windowStart >= this.windowMs) {
        this.clients.delete(id);
      }
    }
  }
}

const globalRateLimiter = new RateLimiter();

module.exports = {
  RateLimiter,
  globalRateLimiter,
};
