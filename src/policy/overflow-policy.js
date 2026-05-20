const { driverRegistry } = require('../drivers/driverRegistry');
const { coreClient } = require('../core/core-client');
const config = require('../../config');

class OverflowPolicy {
  constructor(opts = {}) {
    // Limiares configuráveis
    this.minDriversForLocal = opts.minDriversForLocal || 1;        // mín de motoristas para aceitar local
    this.minAvailablePercentageForLocal = opts.minAvailablePercentageForLocal || 20; // % mín disponível
    this.maxQueueSize = opts.maxQueueSize || 100;
    this.coreTimeoutThresholdMs = opts.coreTimeoutThresholdMs || 5000;

    // Métricas
    this._metricsOverloadEvents = 0;
    this._metricsLastDecision = null;
  }

  /**
   * Obtém a decisão para uma nova requisição de corrida.
   * 
   * @param {object} ride — objeto da corrida a processar
   * @param {object} queueSnapshot — snapshot atual da fila
   * @returns {string} 'local' | 'delegate' | 'queue' | 'reject'
   */
  getDecision(ride, queueSnapshot) {
    // 1. Verifica se fila está cheia
    if (queueSnapshot && queueSnapshot.isFull) {
      return 'reject';
    }

    // 2. Verifica motoristas disponíveis
    const availableCount = driverRegistry.availableCount();
    const totalCount = driverRegistry.snapshot().total;
    const availablePercentage = (availableCount / totalCount) * 100;

    // 3. Se há motoristas suficientes, aceita localmente
    if (availableCount >= this.minDriversForLocal && 
        availablePercentage >= this.minAvailablePercentageForLocal) {
      this._metricsLastDecision = 'local';
      return 'local';
    }

    // 4. Se circuit breaker está aberto, enfileira
    if (!coreClient.isAvailable()) {
      this._metricsOverloadEvents += 1;
      this._metricsLastDecision = 'queue';
      return 'queue';
    }

    // 5. Se serviço está muito sobrecarregado, enfileira
    if (availableCount === 0 && (queueSnapshot?.currentSize || 0) > 0) {
      this._metricsOverloadEvents += 1;
      this._metricsLastDecision = 'queue';
      return 'queue';
    }

    // 6. Por padrão, tenta delegar ao Core
    this._metricsLastDecision = 'delegate';
    return 'delegate';
  }

  /**
   * Verifica se o serviço está congestionado (método booleano simples).
   * @returns {boolean}
   */
  isOverloaded() {
    const availableCount = driverRegistry.availableCount();
    const totalCount = driverRegistry.snapshot().total;
    const availablePercentage = (availableCount / totalCount) * 100;

    // Considerado sobrecarregado se:
    // - Menos de 20% de motoristas disponíveis, E
    // - Core não está disponível
    return (availablePercentage < this.minAvailablePercentageForLocal) &&
           !coreClient.isAvailable();
  }

  /**
   * Verifica se é possível aceitar uma corrida localmente agora.
   * @returns {boolean}
   */
  canAcceptLocal() {
    const availableCount = driverRegistry.availableCount();
    const totalCount = driverRegistry.snapshot().total;
    const availablePercentage = (availableCount / totalCount) * 100;

    return availableCount >= this.minDriversForLocal &&
           availablePercentage >= this.minAvailablePercentageForLocal;
  }

  /**
   * Verifica se é seguro delegar ao Core.
   * @returns {boolean}
   */
  canDelegate() {
    return coreClient.isAvailable();
  }

  /**
   * Obtém métricas sobre decisões e estado de congestionamento.
   * @returns {object}
   */
  getMetrics() {
    const drivers = driverRegistry.snapshot();
    const availablePercentage = (drivers.available / drivers.total) * 100;
    const cbSnapshot = coreClient.cbSnapshot();

    return {
      drivers: {
        available: drivers.available,
        total: drivers.total,
        availablePercentage: availablePercentage.toFixed(1),
        busy: drivers.busy,
      },
      coreCircuitBreaker: {
        state: cbSnapshot.state,
        isAvailable: coreClient.isAvailable(),
        failureCount: cbSnapshot.failureCount,
      },
      policy: {
        lastDecision: this._metricsLastDecision,
        overloadEvents: this._metricsOverloadEvents,
        isCurrentlyOverloaded: this.isOverloaded(),
        canAcceptLocal: this.canAcceptLocal(),
        canDelegate: this.canDelegate(),
      },
    };
  }

  /**
   * Reseta contadores de métricas (para testes ou reset periódico).
   */
  resetMetrics() {
    this._metricsOverloadEvents = 0;
    this._metricsLastDecision = null;
  }
}

const overflowPolicy = new OverflowPolicy({
  minDriversForLocal: parseInt(process.env.MIN_DRIVERS_FOR_LOCAL || '1', 10),
  minAvailablePercentageForLocal: parseInt(process.env.MIN_AVAILABLE_PERCENT || '20', 10),
  maxQueueSize: parseInt(process.env.RIDE_QUEUE_MAX_SIZE || '100', 10),
  coreTimeoutThresholdMs: parseInt(process.env.CORE_TIMEOUT_THRESHOLD_MS || '5000', 10),
});

module.exports = { overflowPolicy, OverflowPolicy };