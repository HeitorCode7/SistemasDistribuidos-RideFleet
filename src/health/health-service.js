'use strict';

// src/health/health-service.js
// Calcula o estado de saúde do serviço: UP | DEGRADED | DOWN
//
// Regras:
//   UP       — tudo dentro dos limites normais
//   DEGRADED — fila acima de 70% OU latência p95 > 2s OU motoristas abaixo de 20%
//   DOWN     — fila cheia (100%) OU nenhum motorista disponível E fila não vazia

const { getLatencyStats } = require('../middleware/latency');

// Limites configuráveis via env
const QUEUE_DEGRADED_RATIO   = parseFloat(process.env.HEALTH_QUEUE_DEGRADED_RATIO   || '0.7');
const LATENCY_DEGRADED_MS    = parseInt(process.env.HEALTH_LATENCY_DEGRADED_MS      || '2000', 10);
const DRIVERS_DEGRADED_RATIO = parseFloat(process.env.HEALTH_DRIVERS_DEGRADED_RATIO || '0.2');

/**
 * Calcula o estado de saúde com base nos snapshots atuais.
 *
 * @param {object} queueSnapshot   — resultado de rideQueue.snapshot()
 * @param {object} driversSnapshot — { total, available, busy }
 * @returns {{ status: 'UP'|'DEGRADED'|'DOWN', reasons: string[], details: object }}
 */
function computeHealth(queueSnapshot, driversSnapshot) {
  const reasons = [];
  const latency = getLatencyStats();

  // ── Análise da fila ──────────────────────────────────────────────────────
  const queueRatio =
    queueSnapshot.maxSize > 0
      ? queueSnapshot.currentSize / queueSnapshot.maxSize
      : 0;

  const queueFull = queueSnapshot.isFull || queueRatio >= 1.0;

  if (queueFull) {
    reasons.push('queue_full');
  } else if (queueRatio >= QUEUE_DEGRADED_RATIO) {
    reasons.push(`queue_high (${Math.round(queueRatio * 100)}%)`);
  }

  // ── Análise de motoristas ────────────────────────────────────────────────
  const totalDrivers     = driversSnapshot.total     || 0;
  const availableDrivers = driversSnapshot.available || 0;

  const driverRatio =
    totalDrivers > 0 ? availableDrivers / totalDrivers : 1;

  const noDrivers = availableDrivers === 0 && queueSnapshot.currentSize > 0;

  if (noDrivers) {
    reasons.push('no_drivers_available');
  } else if (driverRatio < DRIVERS_DEGRADED_RATIO) {
    reasons.push(`drivers_low (${Math.round(driverRatio * 100)}% available)`);
  }

  // ── Análise de latência ──────────────────────────────────────────────────
  if (latency.p95 > LATENCY_DEGRADED_MS) {
    reasons.push(`latency_high (p95=${latency.p95}ms)`);
  }

  // ── Determinação do status ───────────────────────────────────────────────
  let status;

  if (queueFull || noDrivers) {
    status = 'DOWN';
  } else if (reasons.length > 0) {
    status = 'DEGRADED';
  } else {
    status = 'UP';
  }

  return {
    status,
    reasons,
    details: {
      queue: {
        current:  queueSnapshot.currentSize,
        max:      queueSnapshot.maxSize,
        ratio:    parseFloat((queueRatio * 100).toFixed(1)),
        isFull:   queueFull,
        peak:     queueSnapshot.peakSize,
      },
      drivers: {
        available: availableDrivers,
        total:     totalDrivers,
        busy:      driversSnapshot.busy || 0,
        ratio:     parseFloat((driverRatio * 100).toFixed(1)),
      },
      latency: {
        avg_ms:    latency.avg,
        p95_ms:    latency.p95,
        p99_ms:    latency.p99,
        error_rate: latency.errorRate,
        samples:   latency.samples,
      },
    },
  };
}

module.exports = { computeHealth };