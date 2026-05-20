const { metrics } = require('../middleware/metrics');
const { structuredLog } = require('../logging/logger');

const STATE = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
};

class CircuitBreaker {
  /**
   * @param {string} partnerId
   * @param {object} opts
   * @param {number} opts.failureThreshold  — falhas antes de abrir
   * @param {number} opts.recoveryTimeoutMs — ms antes de testar recuperação
   */
  constructor(partnerId, opts = {}) {
    this.partnerId = partnerId;
    this.failureThreshold = opts.failureThreshold || 3;
    this.recoveryTimeoutMs = opts.recoveryTimeoutMs || 10000;

    this.state = STATE.CLOSED;
    this.failureCount = 0;
    this.lastFailureAt = null;
    this._history = []; // histórico de transições
  }

  /** Executa fn protegida pelo circuit breaker */
  async call(fn) {
    if (this.state === STATE.OPEN) {
      // Verifica se o timeout de recuperação já passou
      if (Date.now() - this.lastFailureAt >= this.recoveryTimeoutMs) {
        this._transition(STATE.HALF_OPEN);
      } else {
        throw new Error(`CircuitBreaker OPEN para ${this.partnerId}`);
      }
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure();
      throw err;
    }
  }

  _onSuccess() {
    if (this.state === STATE.HALF_OPEN) {
      // Teste bem-sucedido: fecha o circuito
      this._transition(STATE.CLOSED);
    }
    this.failureCount = 0;
  }

  _onFailure() {
    this.failureCount += 1;
    this.lastFailureAt = Date.now();

    metrics.cbFailures.inc({ partner: this.partnerId });

    if (this.state === STATE.HALF_OPEN) {
      // Teste falhou: volta a abrir
      this._transition(STATE.OPEN);
    } else if (
      this.state === STATE.CLOSED &&
      this.failureCount >= this.failureThreshold
    ) {
      this._transition(STATE.OPEN);
    }
  }

  _transition(newState) {
    const prev = this.state;
    this.state = newState;
    if (newState === STATE.CLOSED) this.failureCount = 0;

    this._history.push({
      from: prev,
      to: newState,
      at: Date.now(),
      failureCount: this.failureCount,
    });

    metrics.cbStateChange.inc({ partner: this.partnerId, state: newState });
    console.log(`[CB] ${this.partnerId}: ${prev} -> ${newState}`);
    
    structuredLog({
  nivel: newState === STATE.OPEN ? 'ERROR' : 'INFO',
  evento: newState === STATE.OPEN
    ? 'CIRCUIT_BREAKER_OPEN'
    : 'CIRCUIT_BREAKER_STATE_CHANGED',

  detalhes: {
    partnerId: this.partnerId,
    estado_anterior: prev,
    estado_novo: newState,
    failureCount: this.failureCount
  }
});
  }

  isAvailable() {
    if (this.state === STATE.CLOSED || this.state === STATE.HALF_OPEN) return true;
    return Date.now() - this.lastFailureAt >= this.recoveryTimeoutMs;
  }

  snapshot() {
    return {
      partnerId: this.partnerId,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureAt: this.lastFailureAt,
      history: this._history.slice(-10),
    };
  }
}

/** Registry de circuit breakers por parceiro */
class CircuitBreakerRegistry {
  constructor(opts = {}) {
    this._opts = opts;
    this._breakers = new Map();
  }

  get(partnerId) {
    if (!this._breakers.has(partnerId)) {
      this._breakers.set(partnerId, new CircuitBreaker(partnerId, this._opts));
    }
    return this._breakers.get(partnerId);
  }

  snapshot() {
    const result = {};
    for (const [id, cb] of this._breakers.entries()) {
      result[id] = cb.snapshot();
    }
    return result;
  }
}

const registry = new CircuitBreakerRegistry({
  failureThreshold: parseInt(process.env.CB_FAILURE_THRESHOLD || '3', 10),
  recoveryTimeoutMs: parseInt(process.env.CB_RECOVERY_TIMEOUT_MS || '10000', 10),
});

module.exports = { CircuitBreaker, CircuitBreakerRegistry, registry, STATE };
