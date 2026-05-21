'use strict';

// src/queue/queue-monitor.js
// Worker que drena a RideQueue local e reprocessa corridas enfileiradas.
//
// Responsabilidades:
//   1. Drenagem periódica: tenta processar corridas da fila quando há
//      capacidade (activeRides < MAX_LOCAL_RIDES).
//   2. Política de descarte (Dead-Letter): corridas que ultrapassam
//      MAX_RETRY_COUNT ou MAX_AGE_MS são canceladas via compensação.
//   3. Persistência: persiste o snapshot da fila no banco de dados
//      a cada ciclo, permitindo recuperação após reinício do serviço.
//   4. Recuperação: ao iniciar, restaura corridas persistidas que ainda
//      não foram processadas.

const { rideSaga, RIDE_STATE } = require('../saga/ride-saga');
const { structuredLog }        = require('../logging/logger');
const { metrics }              = require('../middleware/metrics');
const config                   = require('../../config');

// ── Configurações via env ──────────────────────────────────────────────────
const DRAIN_INTERVAL_MS = parseInt(process.env.QUEUE_DRAIN_INTERVAL_MS || '5000',  10);
const MAX_RETRY_COUNT   = parseInt(process.env.QUEUE_MAX_RETRY_COUNT   || '5',     10);
const MAX_AGE_MS        = parseInt(process.env.QUEUE_MAX_AGE_MS        || '300000', 10); // 5 min
const BATCH_SIZE        = parseInt(process.env.QUEUE_DRAIN_BATCH_SIZE  || '3',     10);

let _intervalHandle = null;
let _queue          = null;
let _pool           = null; // pool PostgreSQL (opcional — injetado via start())

// ── Persistência ───────────────────────────────────────────────────────────

async function _persistQueue() {
  if (!_pool) return; // sem banco configurado, pula silenciosamente

  try {
    const snapshot = JSON.stringify(_queue.snapshot().items);

    await _pool.query(`
      INSERT INTO queue_snapshots (service_id, snapshot, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (service_id)
      DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = NOW()
    `, [config.serviceId, snapshot]);

  } catch (err) {
    // Não fatal — persistência é best-effort
    console.warn('[QUEUE-MONITOR] Falha ao persistir fila:', err.message);
  }
}

async function _restoreQueue() {
  if (!_pool) return;

  try {
    // Garante que a tabela existe
    await _pool.query(`
      CREATE TABLE IF NOT EXISTS queue_snapshots (
        service_id  TEXT PRIMARY KEY,
        snapshot    JSONB NOT NULL DEFAULT '[]',
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows } = await _pool.query(
      `SELECT snapshot FROM queue_snapshots WHERE service_id = $1`,
      [config.serviceId]
    );

    if (!rows.length || !rows[0].snapshot?.length) return;

    let restored = 0;

    for (const item of rows[0].snapshot) {
      // Só restaura corridas que não estejam em estado terminal
      const existingRide = rideSaga.get(item.rideId);
      if (existingRide) continue; // já na memória

      const result = _queue.enqueue(item, item.queueReason || 'restored_after_restart');
      if (result.queued) restored++;
    }

    if (restored > 0) {
      structuredLog({
        nivel:   'INFO',
        evento:  'FILA_RESTAURADA',
        detalhes: { restored, serviceId: config.serviceId },
      });
      console.log(`[QUEUE-MONITOR] ${restored} corrida(s) restaurada(s) do banco`);
    }

  } catch (err) {
    console.warn('[QUEUE-MONITOR] Falha ao restaurar fila:', err.message);
  }
}

// ── Política de descarte (Dead-Letter) ────────────────────────────────────

function _shouldDiscard(item) {
  if (item.retryCount >= MAX_RETRY_COUNT) {
    return { discard: true, reason: `max_retries_exceeded (${item.retryCount})` };
  }

  const ageMs = Date.now() - new Date(item.enqueuedAt).getTime();
  if (ageMs > MAX_AGE_MS) {
    return { discard: true, reason: `max_age_exceeded (${Math.round(ageMs / 1000)}s)` };
  }

  return { discard: false };
}

// ── Processamento de uma corrida da fila ───────────────────────────────────

async function _processItem(item) {
  const { discard, reason } = _shouldDiscard(item);

  if (discard) {
    _queue.remove(item.rideId);

    // Garante que a corrida existe na saga antes de compensar
    const existing = rideSaga.get(item.rideId);
    if (existing && !['complete', 'cancelled'].includes(existing.state)) {
      rideSaga.compensate(item.rideId, `queue_discard:${reason}`);
    }

    structuredLog({
      nivel:      'WARN',
      evento:     'CORRIDA_DESCARTADA_FILA',
      corrida_id: item.rideId,
      detalhes:   { reason, retryCount: item.retryCount },
    });

    console.warn(`[QUEUE-MONITOR] Descartando corrida ${item.rideId}: ${reason}`);
    return;
  }

  try {
    // Verifica se ainda há capacidade local
    const activeRides = rideSaga
      .getAll()
      .filter(r => r.state !== 'complete' && r.state !== 'cancelled').length;

    if (activeRides >= config.maxLocalRides) {
      // Serviço ainda congestionado — deixa na fila
      _queue.incrementRetryCount(item.rideId);
      return;
    }

    // Remove da fila antes de processar (evita duplo processamento)
    _queue.remove(item.rideId);

    // Garante que a corrida existe na saga (pode ter sido perdida no reinício)
    let ride = rideSaga.get(item.rideId);

    if (!ride) {
      ride = rideSaga.createDelegated({
        rideId:         item.rideId,
        passengerId:    item.passengerId,
        origin:         item.origin,
        destination:    item.destination,
        ownerServiceId: item.ownerService || config.serviceId,
        lamportTs:      0,
      });
    }

    // Avança para MATCH + CONFIRM
    rideSaga.transition(ride.rideId, RIDE_STATE.MATCH, {
      assignedService: config.serviceId,
      driverId:        `driver-queue-${item.rideId.slice(0, 6)}`,
    });

    rideSaga.transition(ride.rideId, RIDE_STATE.CONFIRM);

    metrics.ridesDequeued.inc();

    structuredLog({
      nivel:           'INFO',
      evento:          'CORRIDA_DESENFILEIRADA',
      corrida_id:      item.rideId,
      estado_anterior: 'QUEUED',
      estado_novo:     'CONFIRM',
      detalhes:        { retryCount: item.retryCount },
    });

    console.log(`[QUEUE-MONITOR] Corrida ${item.rideId} processada da fila`);

    // Broadcast WebSocket (se disponível)
    if (typeof global.wsBroadcast === 'function') {
      global.wsBroadcast('ride.dequeued', { rideId: item.rideId });
    }

  } catch (err) {
    // Recoloca na fila com retry incrementado
    _queue.incrementRetryCount(item.rideId);

    structuredLog({
      nivel:      'ERROR',
      evento:     'ERRO_PROCESSAMENTO_FILA',
      corrida_id: item.rideId,
      detalhes:   { erro: err.message },
    });

    console.error(`[QUEUE-MONITOR] Erro ao processar ${item.rideId}:`, err.message);
  }
}

// ── Ciclo de drenagem ──────────────────────────────────────────────────────

async function _drain() {
  if (!_queue || _queue.isEmpty()) return;

  const snapshot  = _queue.snapshot();
  const items     = snapshot.items.slice(0, BATCH_SIZE); // pega até BATCH_SIZE por ciclo

  for (const item of items) {
    await _processItem(item);
  }

  // Persiste o estado da fila após cada ciclo de drenagem
  await _persistQueue();
}

// ── API pública ────────────────────────────────────────────────────────────

/**
 * Inicia o worker de drenagem da fila.
 *
 * @param {RideQueue}   queue  — instância da RideQueue (obrigatório)
 * @param {pg.Pool|null} pool  — pool PostgreSQL para persistência (opcional)
 */
async function start(queue, pool = null) {
  if (_intervalHandle) return; // já iniciado

  _queue = queue;
  _pool  = pool;

  // Restaura corridas persistidas do banco
  await _restoreQueue();

  _intervalHandle = setInterval(async () => {
    try {
      await _drain();
    } catch (err) {
      console.error('[QUEUE-MONITOR] Erro no ciclo de drenagem:', err.message);
    }
  }, DRAIN_INTERVAL_MS);

  // Não impede encerramento do processo
  if (_intervalHandle.unref) _intervalHandle.unref();

  console.log(
    `[QUEUE-MONITOR] Iniciado — intervalo: ${DRAIN_INTERVAL_MS}ms | ` +
    `maxRetries: ${MAX_RETRY_COUNT} | maxAge: ${MAX_AGE_MS / 1000}s | batch: ${BATCH_SIZE}`
  );
}

/**
 * Para o worker (usado em testes).
 */
function stop() {
  if (_intervalHandle) {
    clearInterval(_intervalHandle);
    _intervalHandle = null;
    _queue          = null;
    _pool           = null;
  }
}

/**
 * Snapshot do estado atual do monitor (para observabilidade).
 */
function snapshot() {
  return {
    running:         !!_intervalHandle,
    drainIntervalMs: DRAIN_INTERVAL_MS,
    maxRetryCount:   MAX_RETRY_COUNT,
    maxAgeMs:        MAX_AGE_MS,
    batchSize:       BATCH_SIZE,
    queue:           _queue ? _queue.snapshot() : null,
  };
}

module.exports = { start, stop, snapshot };