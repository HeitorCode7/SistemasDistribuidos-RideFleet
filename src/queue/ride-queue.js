'use strict';

/**
 * RideQueue — FIFO queue of pending rides (local pool).
 * Used when overflow policy decides to hold a ride locally.
 */
class RideQueue {
  /**
   * @param {number} [maxSize=100]
   */
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this._items = [];
    this._peakSize = 0;
    this._totalEnqueued = 0;
    this._totalDequeued = 0;
  }

  /**
   * Add a ride to the end of the queue.
   * @param {{ rideId: string, [key: string]: any }} ride
   * @param {string} [reason] — reason for queuing (e.g. 'core_unavailable')
   * @returns {{ queued: boolean, reason?: string, queueSize?: number, position?: number }}
   */
  enqueue(ride, reason) {
    if (!ride || !ride.rideId) {
      return { queued: false, reason: 'ride_invalid' };
    }
    if (this._items.length >= this.maxSize) {
      return { queued: false, reason: 'queue_full' };
    }
    const entry = {
      ...ride,
      rideId: String(ride.rideId),
      retryCount: 0,
      enqueuedAt: new Date().toISOString(),
      queueReason: reason || null,
    };
    this._items.push(entry);
    this._totalEnqueued += 1;
    if (this._items.length > this._peakSize) {
      this._peakSize = this._items.length;
    }
    return { queued: true, queueSize: this._items.length, position: this._items.length - 1 };
  }

  /**
   * Remove and return the ride at the front.
   * @returns {object|null}
   */
  dequeue() {
    if (this._items.length === 0) return null;
    this._totalDequeued += 1;
    return this._items.shift();
  }

  /**
   * Return the ride at the front without removing it.
   * @returns {object|null}
   */
  peek() {
    return this._items.length > 0 ? { ...this._items[0] } : null;
  }

  /**
   * Remove a specific ride by rideId.
   * @param {string} rideId
   * @returns {boolean}
   */
  remove(rideId) {
    const idx = this._items.findIndex((r) => r.rideId === String(rideId));
    if (idx === -1) return false;
    this._items.splice(idx, 1);
    return true;
  }

  size() { return this._items.length; }
  isEmpty() { return this._items.length === 0; }

  clear() { this._items = []; }

  getAll() { return this._items.map((r) => ({ ...r })); }

  /**
   * Increment retry counter for a ride.
   * @param {string} rideId
   * @returns {number|null}
   */
  incrementRetryCount(rideId) {
    const ride = this._items.find((r) => r.rideId === String(rideId));
    if (!ride) return null;
    ride.retryCount += 1;
    return ride.retryCount;
  }

  /**
   * Snapshot for metrics/debugging.
   */
  snapshot() {
    return {
      currentSize:    this._items.length,
      maxSize:        this.maxSize,
      peakSize:       this._peakSize,
      totalEnqueued:  this._totalEnqueued,
      totalDequeued:  this._totalDequeued,
      isFull:         this._items.length >= this.maxSize,
      items:          this.getAll(),
    };
  }
}

module.exports = { RideQueue };
