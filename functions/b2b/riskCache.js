/**
 * Nettuno Cloud — In-Memory Risk Cache (LRU + TTL).
 * Evita leituras repetidas no Firestore para anúncios quentes.
 */
'use strict';

class RiskCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 5000;
    this.defaultTtlMs = options.ttlMs || 300_000; // 5 minutos padrão
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    if (!this.cache.has(key)) {
      this.misses++;
      return null;
    }

    const entry = this.cache.get(key);
    const now = Date.now();

    if (entry.expiresAt && entry.expiresAt < now) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Move to end (LRU behavior)
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hits++;
    return entry.value;
  }

  set(key, value, ttlMs) {
    const ttl = typeof ttlMs === 'number' ? ttlMs : this.defaultTtlMs;
    const expiresAt = ttl > 0 ? Date.now() + ttl : null;

    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove o mais antigo (primeira chave da Map)
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, { value, expiresAt });
    return value;
  }

  del(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  stats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
    };
  }
}

// Instância singleton para a runtime da Cloud Function
const globalRiskCache = new RiskCache();

module.exports = {
  RiskCache,
  globalRiskCache,
};
