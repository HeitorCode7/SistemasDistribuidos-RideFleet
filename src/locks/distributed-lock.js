'use strict';

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
    return true;
  }

  reset() {
    this.locks.clear();
  }
}

module.exports = { DistributedLockManager };