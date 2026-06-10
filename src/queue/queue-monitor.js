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

const TERMINAL_STATES = new Set([RIDE_STATE.COMPLETE, RIDE_STATE.CANCELLED]);

// ── Configurações via env ──────────────────────────────────────────────────
const DRAIN_INTERVAL_MS = parseInt(process.env.QUEUE_DRAIN_INTERVAL_MS || '5000',  10);
const MAX_RETRY_COUNT   = parseInt(process.env.QUEUE_MAX_RETRY_COUNT   || '5',     10);
const MAX_AGE_MS        = parseInt(process.env.QUEUE_MAX_AGE_MS        || '300000', 10); // 5 min
const BATCH_SIZE        = parseInt(process.env.QUEUE_DRAIN_BATCH_SIZE  || '3',     10);

// Tempo (ms) entre cada transição de estado — perceptível na prática
const STEP_MS = parseInt(process.env.QUEUE_STEP_MS || '9000', 10); // 9 s por etapa

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

// ── Transições sequenciais encadeadas ─────────────────────────────────────
//
// Cada etapa só dispara após a anterior ser confirmada. Isso evita que um
// timeout chegue e encontre o estado errado porque o passo anterior ainda
// não havia concluído (o bug original).

// Pipeline de transições: cada entrada define de qual estado sai e para qual vai.
const TRANSITION_PIPELINE = [
  { from: RIDE_STATE.MATCH,      to: RIDE_STATE.CONFIRM    },
  { from: RIDE_STATE.CONFIRM,    to: RIDE_STATE.IN_TRANSIT },
  { from: RIDE_STATE.IN_TRANSIT, to: RIDE_STATE.COMPLETE   },
];

/**
 * Agenda as transições restantes a partir do estado atual da corrida.
 * Encadeia os passos sequencialmente — cada um só dispara após o anterior
 * concluir, evitando condições de corrida com retries ou múltiplos ciclos.
 */
function _scheduleTransitions(rideId) {
  const ride = rideSaga.get(rideId);
  if (!ride) return;

  // Descobre em qual passo do pipeline estamos agora
  const startIndex = TRANSITION_PIPELINE.findIndex(p => p.from === ride.state);

  if (startIndex === -1) {
    // Estado atual não faz parte do pipeline (ex: já COMPLETE ou CANCELLED)
    return;
  }

  // Executa os passos restantes de forma encadeada
  function runStep(index) {
    if (index >= TRANSITION_PIPELINE.length) return;

    const { from, to } = TRANSITION_PIPELINE[index];

    setTimeout(() => {
      const current = rideSaga.get(rideId);

      if (!current) {
        console.warn(`[QUEUE-MONITOR] ${rideId}: corrida não encontrada na saga ao tentar ${from} -> ${to}`);
        return;
      }

      if (current.state !== from) {
        console.warn(`[QUEUE-MONITOR] ${rideId}: esperava ${from} para -> ${to}, estado atual: ${current.state} — abortando pipeline`);
        return;
      }

      const result = rideSaga.transition(rideId, to);

      if (!result) {
        console.warn(`[QUEUE-MONITOR] ${rideId}: transition() recusou ${from} -> ${to}`);
        return;
      }

      console.log(`[QUEUE-MONITOR] ${rideId} -> ${to}`);

      if (to === RIDE_STATE.COMPLETE) {
        structuredLog({
          nivel:      'INFO',
          evento:     'CORRIDA_CONCLUIDA_FILA',
          corrida_id: rideId,
          detalhes:   { estadoFinal: RIDE_STATE.COMPLETE },
        });

        if (typeof global.wsBroadcast === 'function') {
          global.wsBroadcast('ride.completed', { rideId });
        }
      }

      // Agenda o próximo passo somente após este ter sido confirmado
      runStep(index + 1);

    }, STEP_MS);
  }

  runStep(startIndex);
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

    // Se a corrida já passou do REQUEST (ex: retry de um ciclo anterior que
    // avançou parcialmente), não recomeça do zero — retoma do estado atual.
    // Isso evita dois conjuntos de timeouts brigando pelo mesmo rideId.
    if (TERMINAL_STATES.has(ride.state)) {
      console.log(`[QUEUE-MONITOR] ${ride.rideId} já em estado terminal (${ride.state}), ignorando`);
      return;
    }

    if (ride.state === RIDE_STATE.REQUEST) {
      // Caminho normal: corrida nova → MATCH
      rideSaga.transition(ride.rideId, RIDE_STATE.MATCH, {
        assignedService: config.serviceId,
        driverId: `driver-queue-${item.rideId.slice(0, 6)}`,
      });
      console.log(`[QUEUE-MONITOR] ${ride.rideId} -> MATCH`);
    } else {
      // Corrida já em andamento (MATCH, CONFIRM, IN_TRANSIT) — apenas
      // reagenda as transições restantes a partir do estado atual,
      // sem criar um novo ponto de partida duplicado.
      console.log(`[QUEUE-MONITOR] ${ride.rideId} retomando do estado ${ride.state}`);
    }

    // Agenda as transições seguintes de forma encadeada e sequencial,
    // partindo do estado em que a corrida se encontra agora.
    _scheduleTransitions(ride.rideId);

    metrics.ridesDequeued.inc();

    structuredLog({
      nivel:           'INFO',
      evento:          'CORRIDA_DESENFILEIRADA',
      corrida_id:      ride.rideId,
      estado_anterior: 'QUEUED',
      estado_novo:     'MATCH',
      detalhes: {
        retryCount: item.retryCount,
        stepMs:     STEP_MS,
      },
    });

    console.log(`[QUEUE-MONITOR] Corrida ${ride.rideId} processada da fila — próximas etapas a cada ${STEP_MS / 1000}s`);

    if (typeof global.wsBroadcast === 'function') {
      global.wsBroadcast('ride.dequeued', { rideId: ride.rideId });
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
    `maxRetries: ${MAX_RETRY_COUNT} | maxAge: ${MAX_AGE_MS / 1000}s | ` +
    `batch: ${BATCH_SIZE} | stepMs: ${STEP_MS}`
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
    stepMs:          STEP_MS,
    queue:           _queue ? _queue.snapshot() : null,
  };
}

/**
 * Alias para compatibilidade com index.js.
 * Lê a rideQueue do global (definido antes de chamar esta função)
 * e o pool do config, se disponível.
 */
function startQueueMonitor(queue, pool) {
  const q = queue || global.rideQueue;
  if (!q) throw new Error('[QUEUE-MONITOR] rideQueue não encontrada — passe como argumento ou defina global.rideQueue antes de chamar startQueueMonitor()');
  return start(q, pool || null);
}

module.exports = {
  start,
  stop,
  snapshot,
  startQueueMonitor,
};