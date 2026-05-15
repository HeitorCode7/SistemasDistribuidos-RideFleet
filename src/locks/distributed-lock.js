// src/locks/distributed-lock.js
// Req 1 — Travas Distribuídas
//
// Implementação de lock distribuído in-process com TTL (lease).
// Em produção multi-nó, substitua o Map por Redis (Redlock) ou etcd.
// A lógica de aquisição/expiração/contenção está explícita aqui para fins pedagógicos.

const { metrics } = require('../middleware/metrics');

class DistributedLockManager {
  constructor(ttlMs = 5000) {
    this.ttlMs = ttlMs;
    // Map: lockKey -> { owner, expiresAt, timer }
    this._locks = new Map();
  }

  /**
   * Tenta adquirir o lock para uma corrida.
   * @param {string} rideId - identificador da corrida
   * @param {string} owner  - identificador de quem está adquirindo
   * @returns {{ acquired: boolean, owner?: string, expiresAt?: number }}
   */
  acquire(rideId, owner) {
    const now = Date.now();
    const existing = this._locks.get(rideId);

    // Verifica se já existe lock ativo
    if (existing) {
      if (now < existing.expiresAt) {
        // Lock ainda válido — contenção
        metrics.lockContentions.inc({ ride_id: rideId });
        return { acquired: false, owner: existing.owner, expiresAt: existing.expiresAt };
      }
      // Lock expirou — limpa
      this._expireLock(rideId, existing);
    }

    // Adquire o lock
    const expiresAt = now + this.ttlMs;
    const timer = setTimeout(() => {
      this._expireLock(rideId, this._locks.get(rideId));
    }, this.ttlMs);

    this._locks.set(rideId, { owner, expiresAt, timer });
    metrics.locksAcquired.inc({ owner });
    return { acquired: true, owner, expiresAt };
  }

  /**
   * Libera o lock se o solicitante for o dono.
   * @returns {boolean}
   */
  release(rideId, owner) {
    const existing = this._locks.get(rideId);
    if (!existing || existing.owner !== owner) return false;

    clearTimeout(existing.timer);
    this._locks.delete(rideId);
    metrics.locksReleased.inc({ owner });
    return true;
  }

  /**
   * Verifica se o lock está ativo para um dono específico.
   */
  isHeld(rideId, owner) {
    const existing = this._locks.get(rideId);
    if (!existing) return false;
    if (Date.now() >= existing.expiresAt) return false;
    return existing.owner === owner;
  }

  _expireLock(rideId, lock) {
    if (!lock) return;
    clearTimeout(lock.timer);
    this._locks.delete(rideId);
    metrics.locksExpired.inc({ owner: lock.owner });
    console.log(`[LOCK] Lock expirado: ride=${rideId} owner=${lock.owner}`);
  }

  /** Retorna snapshot do estado atual (para observabilidade) */
  snapshot() {
    const now = Date.now();
    const result = [];
    for (const [rideId, lock] of this._locks.entries()) {
      result.push({
        rideId,
        owner: lock.owner,
        expiresAt: lock.expiresAt,
        ttlRemaining: Math.max(0, lock.expiresAt - now),
      });
    }
    return result;
  }
}

// Singleton compartilhado no processo
const lockManager = new DistributedLockManager(
  parseInt(process.env.LOCK_TTL_MS || '5000', 10)
);

module.exports = { lockManager, DistributedLockManager };
