'use strict';

// src/health/alerts.js
// Sistema de alertas básicos: detecta condições anômalas e registra/notifica.
//
// Alertas implementados:
//   QUEUE_ABOVE_LIMIT  — fila acima do limiar configurado
//   HIGH_ERROR_RATE    — taxa de erro HTTP >= limiar
//   NO_DRIVERS         — nenhum motorista disponível com fila não vazia
//   CIRCUIT_BREAKER    — algum parceiro com CB aberto

const { structuredLog } = require('../logging/logger');

// Limiares configuráveis
const QUEUE_ALERT_RATIO   = parseFloat(process.env.ALERT_QUEUE_RATIO   || '0.8');  // 80% cheio
const ERROR_RATE_THRESHOLD = parseFloat(process.env.ALERT_ERROR_RATE    || '10');   // 10% de erros
const CHECK_INTERVAL_MS   = parseInt(process.env.ALERT_INTERVAL_MS      || '15000', 10); // 15s

// Histórico de alertas ativos (evita spam de logs)
const _activeAlerts = new Map();
// Histórico completo (últimos 50)
const _alertHistory = [];
const MAX_HISTORY = 50;

/**
 * Registra ou atualiza um alerta.
 * Só loga se o alerta for novo ou se mudou de estado.
 */
function _fire(alertId, message, nivel = 'WARN', detalhes = {}) {
  const wasActive = _activeAlerts.has(alertId);

  _activeAlerts.set(alertId, { message, firedAt: Date.now(), detalhes });

  const entry = {
    alertId,
    message,
    nivel,
    detalhes,
    ts: new Date().toISOString(),
  };

  _alertHistory.push(entry);
  if (_alertHistory.length > MAX_HISTORY) _alertHistory.shift();

  if (!wasActive) {
    structuredLog({
      nivel,
      evento: 'ALERT_FIRED',
      detalhes: { alertId, message, ...detalhes },
    });
  }
}

/**
 * Limpa um alerta que não está mais ativo.
 */
function _resolve(alertId) {
  if (_activeAlerts.has(alertId)) {
    _activeAlerts.delete(alertId);

    structuredLog({
      nivel: 'INFO',
      evento: 'ALERT_RESOLVED',
      detalhes: { alertId },
    });
  }
}

/**
 * Executa a verificação de todos os alertas.
 *
 * @param {object} queueSnapshot   — rideQueue.snapshot()
 * @param {object} driversSnapshot — { total, available }
 * @param {object} latencyStats    — getLatencyStats()
 * @param {object} cbSnapshot      — cbRegistry.snapshot()
 */
function checkAlerts(queueSnapshot, driversSnapshot, latencyStats, cbSnapshot = {}) {

  // ── Alerta: fila acima do limite ─────────────────────────────────────────
  const queueRatio =
    queueSnapshot.maxSize > 0
      ? queueSnapshot.currentSize / queueSnapshot.maxSize
      : 0;

  if (queueRatio >= QUEUE_ALERT_RATIO) {
    _fire(
      'QUEUE_ABOVE_LIMIT',
      `Fila em ${Math.round(queueRatio * 100)}% da capacidade`,
      'WARN',
      {
        current:   queueSnapshot.currentSize,
        max:       queueSnapshot.maxSize,
        threshold: `${Math.round(QUEUE_ALERT_RATIO * 100)}%`,
      }
    );
  } else {
    _resolve('QUEUE_ABOVE_LIMIT');
  }

  // ── Alerta: fila completamente cheia ─────────────────────────────────────
  if (queueSnapshot.isFull) {
    _fire(
      'QUEUE_FULL',
      'Fila de corridas está cheia — novas corridas sendo rejeitadas',
      'ERROR',
      { max: queueSnapshot.maxSize }
    );
  } else {
    _resolve('QUEUE_FULL');
  }

  // ── Alerta: taxa de erro elevada ─────────────────────────────────────────
  if (latencyStats.samples >= 10 && latencyStats.errorRate >= ERROR_RATE_THRESHOLD) {
    _fire(
      'HIGH_ERROR_RATE',
      `Taxa de erro HTTP em ${latencyStats.errorRate}%`,
      'ERROR',
      {
        error_rate: `${latencyStats.errorRate}%`,
        threshold:  `${ERROR_RATE_THRESHOLD}%`,
        samples:    latencyStats.samples,
      }
    );
  } else {
    _resolve('HIGH_ERROR_RATE');
  }

  // ── Alerta: sem motoristas disponíveis ───────────────────────────────────
  const noDrivers =
    (driversSnapshot.available || 0) === 0 &&
    queueSnapshot.currentSize > 0;

  if (noDrivers) {
    _fire(
      'NO_DRIVERS',
      'Nenhum motorista disponível com corridas na fila',
      'ERROR',
      {
        available: driversSnapshot.available,
        total:     driversSnapshot.total,
        queued:    queueSnapshot.currentSize,
      }
    );
  } else {
    _resolve('NO_DRIVERS');
  }

  // ── Alerta: circuit breaker aberto ───────────────────────────────────────
  for (const [partnerId, cb] of Object.entries(cbSnapshot)) {
    const alertId = `CB_OPEN_${partnerId}`;

    if (cb.state === 'OPEN') {
      _fire(
        alertId,
        `Circuit Breaker OPEN para parceiro ${partnerId}`,
        'WARN',
        {
          partnerId,
          failureCount: cb.failureCount,
          lastFailureAt: cb.lastFailureAt,
        }
      );
    } else {
      _resolve(alertId);
    }
  }
}

/**
 * Retorna snapshot do estado atual dos alertas.
 */
function getAlertsSnapshot() {
  const active = [];
  for (const [id, alert] of _activeAlerts.entries()) {
    active.push({ id, ...alert });
  }

  return {
    activeCount: active.length,
    active,
    recentHistory: _alertHistory.slice(-20),
  };
}

// ── Inicialização do loop de verificação ──────────────────────────────────

let _intervalHandle = null;

/**
 * Inicia o loop de verificação periódica de alertas.
 * Deve ser chamado após a inicialização dos serviços.
 *
 * @param {Function} getContext — função que retorna { queue, drivers, latency, cb }
 */
function startAlertLoop(getContext) {
  if (_intervalHandle) return;

 _intervalHandle = setInterval(async () => {
  try {
    const ctx = await getContext();
    if (!ctx || !ctx.queue || !ctx.drivers) return; // aguarda serviços prontos
    checkAlerts(ctx.queue, ctx.drivers, ctx.latency || {}, ctx.cb || {});
  } catch (err) {
    console.error('[ALERTS] Erro na verificação:', err.message);
  }
}, CHECK_INTERVAL_MS);

  // Não impedir que o processo encerre
  if (_intervalHandle.unref) _intervalHandle.unref();

  console.log(`[ALERTS] Loop iniciado (intervalo: ${CHECK_INTERVAL_MS}ms)`);
}

/**
 * Para o loop (usado em testes).
 */
function stopAlertLoop() {
  if (_intervalHandle) {
    clearInterval(_intervalHandle);
    _intervalHandle = null;
  }
}

module.exports = {
  checkAlerts,
  getAlertsSnapshot,
  startAlertLoop,
  stopAlertLoop,
  // Expõe para testes unitários
  _resolve,
  _fire,
};