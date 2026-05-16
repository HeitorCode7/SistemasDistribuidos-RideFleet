const { driverService } = require('../drivers/driverService');
const { driverRegistry } = require('../drivers/driverRegistry');

const { coreClient } = require('../core/core-client');
const config = require('../../config');

class OverflowPolicy {
  constructor(opts = {}) {
    this.minDriversForLocal =
      opts.minDriversForLocal || 1;

    this.minAvailablePercentageForLocal =
      opts.minAvailablePercentageForLocal || 20;

    this.maxQueueSize =
      opts.maxQueueSize || 100;

    this.coreTimeoutThresholdMs =
      opts.coreTimeoutThresholdMs || 5000;

    this._metricsOverloadEvents = 0;
    this._metricsLastDecision = null;
  }

  /**
   * Snapshot dos motoristas
   */
  _getDriverStats() {
    return driverRegistry.snapshot();
  }

  /**
   * Decide ação para corrida
   */
  getDecision(ride, queueSnapshot = {}) {
    // fila cheia
    if (queueSnapshot.isFull) {
      return 'reject';
    }

    const drivers = this._getDriverStats();

    const availablePercentage =
      drivers.total === 0
        ? 0
        : (drivers.available / drivers.total) * 100;

    // aceita local
    if (
      drivers.available >= this.minDriversForLocal &&
      availablePercentage >=
        this.minAvailablePercentageForLocal
    ) {
      this._metricsLastDecision = 'local';

      return 'local';
    }

    // core indisponível
    if (!coreClient.isAvailable()) {
      this._metricsOverloadEvents += 1;

      this._metricsLastDecision = 'queue';

      return 'queue';
    }

    // congestionado
    if (
      drivers.available === 0 &&
      (queueSnapshot.currentSize || 0) > 0
    ) {
      this._metricsOverloadEvents += 1;

      this._metricsLastDecision = 'queue';

      return 'queue';
    }

    // delega
    this._metricsLastDecision = 'delegate';

    return 'delegate';
  }

  /**
   * Serviço sobrecarregado?
   */
  isOverloaded() {
    const drivers = this._getDriverStats();

    const availablePercentage =
      drivers.total === 0
        ? 0
        : (drivers.available / drivers.total) * 100;

    return (
      availablePercentage <
        this.minAvailablePercentageForLocal &&
      !coreClient.isAvailable()
    );
  }

  /**
   * Pode aceitar local?
   */
  canAcceptLocal() {
    const drivers = this._getDriverStats();

    const availablePercentage =
      drivers.total === 0
        ? 0
        : (drivers.available / drivers.total) * 100;

    return (
      drivers.available >= this.minDriversForLocal &&
      availablePercentage >=
        this.minAvailablePercentageForLocal
    );
  }

  /**
   * Pode delegar?
   */
  canDelegate() {
    return coreClient.isAvailable();
  }

  /**
   * Métricas
   */
  getMetrics() {
    const drivers = this._getDriverStats();

    const availablePercentage =
      drivers.total === 0
        ? 0
        : (drivers.available / drivers.total) * 100;

    const cbSnapshot = coreClient.cbSnapshot();

    return {
      drivers: {
        available: drivers.available,
        total: drivers.total,
        busy: drivers.busy,
        availablePercentage:
          availablePercentage.toFixed(1),
      },

      coreCircuitBreaker: {
        state: cbSnapshot.state,
        isAvailable: coreClient.isAvailable(),
        failureCount: cbSnapshot.failureCount,
      },

      policy: {
        lastDecision: this._metricsLastDecision,

        overloadEvents:
          this._metricsOverloadEvents,

        isCurrentlyOverloaded:
          this.isOverloaded(),

        canAcceptLocal:
          this.canAcceptLocal(),

        canDelegate:
          this.canDelegate(),
      },
    };
  }

  /**
   * Reset métricas
   */
  resetMetrics() {
    this._metricsOverloadEvents = 0;
    this._metricsLastDecision = null;
  }
}

const overflowPolicy = new OverflowPolicy({
  minDriversForLocal: parseInt(
    process.env.MIN_DRIVERS_FOR_LOCAL || '1',
    10
  ),

  minAvailablePercentageForLocal:
    parseInt(
      process.env.MIN_AVAILABLE_PERCENT || '20',
      10
    ),

  maxQueueSize: parseInt(
    process.env.RIDE_QUEUE_MAX_SIZE || '100',
    10
  ),

  coreTimeoutThresholdMs: parseInt(
    process.env.CORE_TIMEOUT_THRESHOLD_MS ||
      '5000',
    10
  ),
});

module.exports = {
  overflowPolicy,
  OverflowPolicy,
};