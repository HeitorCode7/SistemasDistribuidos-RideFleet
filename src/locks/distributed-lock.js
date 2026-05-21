'use strict';

const { structuredLog } = require('../logging/logger');

class DistributedLockManager {
  constructor(ttlMs = 2000) {
    this.ttlMs = ttlMs;
    this.locks = new Map();
  }

  acquire(resource, owner) {
    const now = Date.now();
    const current = this.locks.get(resource);

    if (current) {
      const expired = now - current.ts > this.ttlMs;

      if (!expired && current.owner !== owner) {
        return {
          acquired: false,
          owner: current.owner,
        };
      }

      if (!expired && current.owner === owner) {
        return {
          acquired: true,
          owner,
        };
      }
    }

    this.locks.set(resource, {
      owner,
      ts: now,
    });

    structuredLog({
      nivel: 'INFO',
      evento: 'LOCK_ADQUIRIDO',
      detalhes: { resource, owner },
    });

    return {
      acquired: true,
      owner,
    };
  }

  release(resource, owner) {
    const current = this.locks.get(resource);

    if (!current) return false;
    if (current.owner !== owner) return false;

    this.locks.delete(resource);

    structuredLog({
      nivel: 'INFO',
      evento: 'LOCK_LIBERADO',
      detalhes: { resource, owner },
    });

    return true;
  }

  /**
   * Retorna snapshot dos locks ativos para observabilidade.
   */
  snapshot() {
    const now = Date.now();
    const items = [];

    for (const [resource, lock] of this.locks.entries()) {
      const age = now - lock.ts;
      const expired = age > this.ttlMs;

      items.push({
        resource,
        owner: lock.owner,
        acquiredAt: lock.ts,
        ageMs: age,
        expired,
        ttlMs: this.ttlMs,
      });
    }

    return items;
  }

  reset() {
    this.locks.clear();
  }
}

// ── Singleton compartilhado entre rides.js e audit.js ─────────────────────────
const config = require('../../config');
const lockManager = new DistributedLockManager(config.lock?.ttlMs || 5000);

module.exports = { DistributedLockManager, lockManager };