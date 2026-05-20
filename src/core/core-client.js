'use strict';

/**
 * CoreClient
 *
 * HTTP client for delegating rides to the Core service.
 * Includes a three-state circuit breaker (CLOSED → OPEN → HALF_OPEN).
 *
 * Expected by: overflow-policy/policy.js · queue.test.js · integration.test.js
 */

const STATES = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' };

class CoreClient {
  /**
   * @param {object} opts
   * @param {string}  opts.baseUrl            Core service base URL
   * @param {number}  [opts.timeout=5000]     Request timeout in ms
   * @param {number}  [opts.failureThreshold=5]  Failures before opening
   * @param {number}  [opts.successThreshold=2]  Successes to close from HALF_OPEN
   * @param {number}  [opts.openDuration=30000]  How long to stay OPEN (ms)
   * @param {Function} [opts.fetchFn]         Injected fetch (for testing)
   */
  constructor(opts = {}) {
    this._baseUrl = (opts.baseUrl || process.env.CORE_SERVICE_URL || 'http://localhost:4000').replace(/\/$/, '');
    this._timeout = opts.timeout ?? 5000;
    this._failureThreshold = opts.failureThreshold ?? 5;
    this._successThreshold = opts.successThreshold ?? 2;
    this._openDuration = opts.openDuration ?? 30_000;
    this._fetch = opts.fetchFn || fetch;

    // Circuit breaker state
    this._state = STATES.CLOSED;
    this._failureCount = 0;
    this._successCount = 0;
    this._openedAt = null;
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Check whether the Core service is reachable and the circuit is closed.
   * Returns false immediately when the circuit is OPEN (and not due for probe).
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    if (this._isCircuitOpen()) return false;

    try {
      const res = await this._request('GET', '/health');
      this._onSuccess();
      return res.ok;
    } catch {
      this._onFailure();
      return false;
    }
  }

  /**
   * Delegate a ride to the Core service.
   * @param {{ id: string, origin: string, destination: string, [key: string]: any }} ride
   * @returns {Promise<{ success: boolean, coreRideId?: string, error?: string }>}
   */
  async delegateRide(ride) {
    if (this._isCircuitOpen()) {
      return { success: false, error: 'Circuit open – Core service unavailable' };
    }

    try {
      const res = await this._request('POST', '/rides', ride);
      const body = await res.json();

      if (!res.ok) {
        this._onFailure();
        return { success: false, error: body.message || `HTTP ${res.status}` };
      }

      this._onSuccess();
      return { success: true, coreRideId: body.id ?? body.rideId };
    } catch (err) {
      this._onFailure();
      return { success: false, error: err.message };
    }
  }

  /**
   * Return an immutable snapshot of the circuit breaker state.
   * @returns {{ state: string, failureCount: number, successCount: number, openedAt: string|null }}
   */
  cbSnapshot() {
    return {
      state: this._state,
      failureCount: this._failureCount,
      successCount: this._successCount,
      openedAt: this._openedAt,
    };
  }

  // ─── Circuit Breaker Internals ───────────────────────────────────────────

  _isCircuitOpen() {
    if (this._state === STATES.OPEN) {
      const elapsed = Date.now() - this._openedAt;
      if (elapsed >= this._openDuration) {
        // Transition to HALF_OPEN to probe the service
        this._state = STATES.HALF_OPEN;
        this._successCount = 0;
        return false; // allow probe
      }
      return true; // still open
    }
    return false;
  }

  _onSuccess() {
    this._failureCount = 0;

    if (this._state === STATES.HALF_OPEN) {
      this._successCount += 1;
      if (this._successCount >= this._successThreshold) {
        this._state = STATES.CLOSED;
        this._successCount = 0;
        this._openedAt = null;
      }
    }
  }

  _onFailure() {
    this._failureCount += 1;
    this._successCount = 0;

    if (
      this._state === STATES.CLOSED &&
      this._failureCount >= this._failureThreshold
    ) {
      this._trip();
    } else if (this._state === STATES.HALF_OPEN) {
      // Probe failed — back to open
      this._trip();
    }
  }

  _trip() {
    this._state = STATES.OPEN;
    this._openedAt = new Date().toISOString();
  }

  // ─── HTTP helper ─────────────────────────────────────────────────────────

  async _request(method, path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeout);

    try {
      const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      };
      if (body) opts.body = JSON.stringify(body);

      return await this._fetch(`${this._baseUrl}${path}`, opts);
    } finally {
      clearTimeout(timer);
    }
  }
}

CoreClient.STATES = STATES;

const coreClient = new CoreClient();
module.exports = { CoreClient, coreClient };
