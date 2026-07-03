'use strict';

const express = require('express');
const router = express.Router();
const axios = require('axios');

const { lockManager } = require('../locks/distributed-lock');
const { rideSaga, RIDE_STATE } = require('../saga/ride-saga');
const { registry: cbRegistry } = require('../circuit-breaker/circuit-breaker');
const { getClock } = require('../logical-clock/lamport-clock');
const { metrics } = require('../middleware/metrics');
const { structuredLog } = require('../logging/logger');
const { getChannel, QUEUE_INPUT } = require('../rabbitmq');
const config = require('../../config');
const { coreClient } = require('../core/core-client');
const driverService = require('../drivers/driverService');

// Tempo entre transições de estado (ms) — perceptível na UI
const STEP_MS = parseInt(process.env.QUEUE_STEP_MS || '9000', 10);

// ─────────────────────────────────────────────
// Criar corrida
// ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { passengerId, origin, destination } = req.body;

  if (!passengerId || !origin || !destination) {
    return res.status(400).json({
      error: 'passengerId, origin e destination são obrigatórios',
    });
  }

  const ride = rideSaga.createLocal({ passengerId, origin, destination });

  structuredLog({
    nivel: 'INFO',
    evento: 'CORRIDA_CRIADA',
    corrida_id: ride.rideId,
    estado_anterior: null,
    estado_novo: 'REQUEST',
    detalhes: { passengerId, origin, destination },
  });

  const activeRides = rideSaga
    .getAll()
    .filter(r => r.state !== 'complete' && r.state !== 'cancelled').length;

  // ── Congestionamento: tenta Core, cai na fila local se falhar ─────────────
  if (activeRides >= config.maxLocalRides) {

    try {
      const delegacao = await coreClient.solicitarDelegacao({
        passengerId, origin, destination,
        logicalTimestamp: Date.now(),
      });

      metrics.ridesQueued.inc();

      structuredLog({
        nivel: 'WARN',
        evento: 'CORRIDA_DELEGADA_CORE',
        corrida_id: ride.rideId,
        detalhes: { activeRides, rideUuid: delegacao.rideUuid },
      });

      return res.status(202).json({
        message: 'Corrida delegada ao Core por congestionamento',
        localRideId: ride.rideId,
        core: delegacao,
      });

    } catch (coreErr) {
      console.warn(`[RIDES] Core indisponível (${coreErr.response?.status ?? coreErr.code ?? coreErr.message}), enfileirando localmente`);
    }

    // Fallback: fila local
    const rideQueue = global.rideQueue;
    if (!rideQueue) {
      return res.status(503).json({ error: 'Serviço congestionado e fila local não disponível' });
    }

    const result = rideQueue.enqueue({
      rideId:      ride.rideId,
      passengerId: ride.passengerId,
      origin:      ride.origin,
      destination: ride.destination,
      ownerService: config.serviceId,
    }, 'core_unavailable');

    if (!result.queued) {
      return res.status(503).json({
        error: 'Serviço congestionado e fila local cheia',
        detail: result.reason,
      });
    }

    metrics.ridesQueued.inc();

    console.log(`[RIDES] Corrida ${ride.rideId} enfileirada localmente — posição ${result.position + 1}/${result.queueSize}`);

    return res.status(202).json({
      message: 'Serviço congestionado — corrida enfileirada localmente',
      localRideId: ride.rideId,
      queue: { position: result.position, size: result.queueSize },
    });
  }

  // ── Capacidade disponível: aceita com transições temporizadas ─────────────
  const acceptance = await _acceptLocally(ride);
  if (!acceptance.accepted) {
    return res.status(503).json({
      error: 'Nenhum motorista disponivel para aceitar a corrida',
    });
  }

  metrics.ridesLocal.inc();

  return res.status(201).json({
    message: 'Corrida criada e aceita localmente',
    activeRides,
    ride: rideSaga.get(ride.rideId),
  });
});

router.get('/core/health', async (req, res) => {
  try {
    const result = await coreClient.health();
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: 'Falha ao consultar health do Core', detail: err.message });
  }
});

router.post('/core/incoming', async (req, res) => {
  try {
    const delegatedRide = req.body;
    console.log('[CORE] Corrida recebida:', delegatedRide);

    const ride = rideSaga.createDelegated({
      rideId:         delegatedRide.rideUuid,
      passengerId:    delegatedRide.passengerId,
      origin:         delegatedRide.origin,
      destination:    delegatedRide.destination,
      ownerServiceId: delegatedRide.originServiceId || 'core',
      lamportTs:      delegatedRide.logicalTimestamp || Date.now(),
    });

    const acceptance = await _acceptLocally(ride);
    if (!acceptance.accepted) {
      return res.status(409).json({
        accepted: false,
        serviceId: config.serviceId,
        error: 'no_available_drivers',
      });
    }

    metrics.ridesReceivedFromCore.inc();

    return res.status(202).json({
      accepted: true,
      serviceId: config.serviceId,
      ride: rideSaga.get(ride.rideId),
      message: 'Corrida delegada recebida e aceita',
    });
  } catch (err) {
    console.error('[CORE INCOMING ERROR]', err);
    return res.status(500).json({ error: 'Falha ao receber corrida delegada', detail: err.message });
  }
});

router.post('/core/register', async (req, res) => {
  try {
    const result = await coreClient.registrarGrupo();
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: 'Falha ao registrar grupo no Core', detail: err.response?.data || err.message });
  }
});

router.post('/core/delegar', async (req, res) => {
  try {
    const result = await coreClient.solicitarDelegacao(req.body);
    res.status(202).json(result);
  } catch (err) {
    res.status(502).json({ error: 'Falha ao solicitar delegação ao Core', detail: err.response?.data || err.message });
  }
});

router.get('/core/:rideUuid/proposals', async (req, res) => {
  try {
    const result = await coreClient.consultarPropostas(req.params.rideUuid);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: 'Falha ao consultar propostas no Core', detail: err.response?.data || err.message });
  }
});

router.get('/core/:rideUuid/status', async (req, res) => {
  try {
    const result = await coreClient.consultarStatus(req.params.rideUuid);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: 'Falha ao consultar status no Core', detail: err.response?.data || err.message });
  }
});

router.patch('/core/:rideUuid/status', async (req, res) => {
  try {
    const { newState, logicalTimestamp } = req.body;
    const result = await coreClient.atualizarStatus(req.params.rideUuid, newState, logicalTimestamp || Date.now());
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: 'Falha ao atualizar status no Core', detail: err.response?.data || err.message });
  }
});

router.get('/core/:rideUuid/audit', async (req, res) => {
  try {
    const result = await coreClient.consultarAuditLog(req.params.rideUuid);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: 'Falha ao consultar audit log no Core', detail: err.response?.data || err.message });
  }
});

// ─────────────────────────────────────────────
// Listar corridas
// ─────────────────────────────────────────────
router.get('/', (req, res) => {
  res.json(rideSaga.getAll());
});

// ─────────────────────────────────────────────
// Buscar corrida específica
// ─────────────────────────────────────────────
router.get('/:rideId', (req, res) => {
  const ride = rideSaga.get(req.params.rideId);
  if (!ride) return res.status(404).json({ error: 'Corrida não encontrada' });
  res.json(ride);
});

// ─────────────────────────────────────────────
// Alterar estado da corrida
// ─────────────────────────────────────────────
router.patch('/:rideId/state', async (req, res) => {
  const { newState } = req.body;
  const ride = rideSaga.transition(req.params.rideId, newState);
  if (!ride) return res.status(400).json({ error: 'Transição inválida ou corrida não encontrada' });
  if (newState === RIDE_STATE.COMPLETE && ride.driverId) {
    await driverService.releaseDriver(ride.driverId);
  }
  res.json(ride);
});

// ─────────────────────────────────────────────
// Aceitar corrida delegada
// ─────────────────────────────────────────────
router.post('/:rideId/accept', async (req, res) => {
  const { rideId } = req.params;
  const { origin, destination, passengerId, ownerServiceId, lamportTs } = req.body;

  let ride = rideSaga.get(rideId);
  if (!ride) {
    ride = rideSaga.createDelegated({
      rideId, passengerId, origin, destination,
      ownerServiceId: ownerServiceId || req.body.ownerService,
      lamportTs,
    });
  }

  metrics.ridesReceivedFromCore.inc();

  const lockResult = lockManager.acquire(rideId, config.serviceId);
  if (!lockResult.acquired) {
    return res.status(409).json({ error: 'Corrida já bloqueada', ...lockResult });
  }

  try {
    const acceptance = await _acceptLocally(ride);
    if (!acceptance.accepted) {
      return res.status(409).json({
        accepted: false,
        serviceId: config.serviceId,
        error: 'no_available_drivers',
      });
    }

    const clock = getClock(config.serviceId);
    const ackEvent = clock.tick('ride.delegation_accepted', { rideId });
    return res.json({
      accepted: true,
      serviceId: config.serviceId,
      ride: rideSaga.get(ride.rideId),
      ackTs: ackEvent.ts,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao aceitar corrida delegada', detail: err.message });
  } finally {
    lockManager.release(rideId, config.serviceId);
  }
});

// ─────────────────────────────────────────────
// Aceite local com transições temporizadas
// REQUEST → MATCH (imediato) → CONFIRM → IN_TRANSIT → COMPLETE
// cada passo separado por STEP_MS para ser perceptível na UI
// ─────────────────────────────────────────────
async function _acceptLocally(ride) {
  const driver = await driverService.assignDriver(ride.rideId);

  if (!driver) {
    console.warn(`[RIDES] ${ride.rideId}: nenhum motorista disponivel`);
    return { accepted: false };
  }

  // REQUEST → MATCH (imediato)
  rideSaga.transition(ride.rideId, RIDE_STATE.MATCH, {
    assignedService: config.serviceId,
    driverId: driver.id,
  });

  console.log(`[RIDES] ${ride.rideId} -> MATCH`);

  structuredLog({
    nivel: 'INFO',
    evento: 'CORRIDA_ACEITA_LOCALMENTE',
    corrida_id: ride.rideId,
    estado_anterior: 'REQUEST',
    estado_novo: 'MATCH',
    detalhes: { serviceId: config.serviceId },
  });

  // MATCH → CONFIRM → IN_TRANSIT → COMPLETE com STEP_MS entre cada passo
  _schedulePipeline(ride.rideId);
  return { accepted: true, driverId: driver.id };
}

// Pipeline idêntico ao do queue-monitor, reutilizável para corridas locais
const TRANSITION_PIPELINE = [
  { from: RIDE_STATE.MATCH,      to: RIDE_STATE.CONFIRM    },
  { from: RIDE_STATE.CONFIRM,    to: RIDE_STATE.IN_TRANSIT },
  { from: RIDE_STATE.IN_TRANSIT, to: RIDE_STATE.COMPLETE   },
];

function _schedulePipeline(rideId) {
  const ride = rideSaga.get(rideId);
  if (!ride) return;

  const startIndex = TRANSITION_PIPELINE.findIndex(p => p.from === ride.state);
  if (startIndex === -1) return;

  function runStep(index) {
    if (index >= TRANSITION_PIPELINE.length) return;
    const { from, to } = TRANSITION_PIPELINE[index];

    setTimeout(() => {
      const current = rideSaga.get(rideId);
      if (!current) {
        console.warn(`[RIDES] ${rideId}: corrida sumiu antes de ${from} -> ${to}`);
        return;
      }
      if (current.state !== from) {
        console.warn(`[RIDES] ${rideId}: esperava ${from} para -> ${to}, estado atual: ${current.state}`);
        return;
      }

      const result = rideSaga.transition(rideId, to);
      if (!result) {
        console.warn(`[RIDES] ${rideId}: transition() recusou ${from} -> ${to}`);
        return;
      }

      console.log(`[RIDES] ${rideId} -> ${to}`);

      if (to === RIDE_STATE.COMPLETE) {
        if (result.driverId) {
          driverService.releaseDriver(result.driverId).catch(err => {
            console.error(`[RIDES] Falha ao liberar motorista ${result.driverId}:`, err.message);
          });
        }

        structuredLog({
          nivel: 'INFO',
          evento: 'CORRIDA_CONCLUIDA',
          corrida_id: rideId,
          detalhes: { estadoFinal: RIDE_STATE.COMPLETE },
        });
        if (typeof global.wsBroadcast === 'function') {
          global.wsBroadcast('ride.completed', { rideId });
        }
      }

      runStep(index + 1);
    }, STEP_MS);
  }

  runStep(startIndex);
}

// ─────────────────────────────────────────────
// Delegação para parceiro vencedor
// ─────────────────────────────────────────────
async function _delegateToWinner(ride, winner) {
  const partner = config.partners?.find(p => p.id === winner.serviceId);
  if (!partner) throw new Error(`Parceiro ${winner.serviceId} não encontrado`);

  const cb = cbRegistry.get(winner.serviceId);
  const clock = getClock(config.serviceId);
  const delegateTs = clock.tick('ride.delegating', { rideId: ride.rideId, to: winner.serviceId });

  await cb.call(() =>
    axios.post(
      `${partner.url}/api/rides/${ride.rideId}/accept`,
      {
        rideId: ride.rideId,
        origin: ride.origin,
        destination: ride.destination,
        passengerId: ride.passengerId,
        ownerServiceId: config.serviceId,
        lamportTs: delegateTs.ts,
      },
      { timeout: 5000 }
    )
  );

  rideSaga.transition(ride.rideId, RIDE_STATE.MATCH, {
    assignedService: winner.serviceId,
    driverId: `${winner.serviceId}-driver`,
  });

  rideSaga.transition(ride.rideId, RIDE_STATE.CONFIRM);
}

module.exports = router;
