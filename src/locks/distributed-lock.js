<<<<<<< HEAD
const { structuredLog } = require('../logging/logger');

=======
>>>>>>> ddc3a7e168756d911d3ae9d9d201e64c0b58a594
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

<<<<<<< HEAD
    structuredLog({
  nivel: 'INFO',
  evento: 'LOCK_ADQUIRIDO',

  detalhes: {
    resource,
    owner
  }
});

=======
>>>>>>> ddc3a7e168756d911d3ae9d9d201e64c0b58a594
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
<<<<<<< HEAD

    structuredLog({
     nivel: 'INFO',
     evento: 'LOCK_LIBERADO',

     detalhes: {
      resource,
      owner
  }
});
    return true;
  
=======
    return true;
>>>>>>> ddc3a7e168756d911d3ae9d9d201e64c0b58a594
  }

  reset() {
    this.locks.clear();
  }
}

module.exports = { DistributedLockManager };