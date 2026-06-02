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

  const ride = rideSaga.createLocal({
    passengerId,
    origin,
    destination,
  });

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

  if (activeRides >= 1) {

  try {

    const delegacao = await coreClient.solicitarDelegacao({
      passengerId,
      origin,
      destination,
      logicalTimestamp: Date.now()
    });

    metrics.ridesQueued.inc();

    structuredLog({
      nivel: 'WARN',
      evento: 'CORRIDA_DELEGADA_CORE',
      corrida_id: ride.rideId,
      estado_anterior: 'REQUEST',
      estado_novo: 'DELEGATED',
      detalhes: {
        activeRides,
        rideUuid: delegacao.rideUuid
      },
    });

    return res.status(202).json({
      message: 'Corrida delegada ao Core por congestionamento',
      localRideId: ride.rideId,
      core: delegacao
    });

  } catch (err) {

    console.error('[CORE] Falha ao delegar');
    console.error('MESSAGE:', err.message);
    console.error('STATUS:', err.response?.status);
    console.error('DATA:', err.response?.data);
    console.error('FULL ERROR:', err);

    return res.status(502).json({
      error: 'Falha ao delegar corrida ao Core',
      detail: err.response?.data || err.message
    });
  }
}

  _acceptLocally(ride);
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
    res.status(502).json({
      error: 'Falha ao consultar health do Core',
      detail: err.message,
    });
  }
});

router.post('/core/incoming', async (req, res) => {

  try {

    const delegatedRide = req.body;

    console.log('[CORE] Corrida recebida:', delegatedRide);

    const ride = rideSaga.createDelegated({
      rideId: delegatedRide.rideUuid,
      passengerId: delegatedRide.passengerId,
      origin: delegatedRide.origin,
      destination: delegatedRide.destination,
      ownerServiceId: delegatedRide.originServiceId || 'core',
      lamportTs: delegatedRide.logicalTimestamp || Date.now()
    });

    _acceptLocally(ride);

    metrics.ridesReceivedFromCore.inc();

    return res.status(202).json({
      accepted: true,
      serviceId: config.serviceId,
      ride: rideSaga.get(ride.rideId),
      message: 'Corrida delegada recebida e aceita'
    });

  } catch (err) {

    console.error('[CORE INCOMING ERROR]', err);

    return res.status(500).json({
      error: 'Falha ao receber corrida delegada',
      detail: err.message
    });
  }
});

router.post('/core/register', async (req, res) => {
  try {
    const result = await coreClient.registrarGrupo();
    res.json(result);
  } catch (err) {
    res.status(502).json({
      error: 'Falha ao registrar grupo no Core',
      detail: err.response?.data || err.message,
    });
  }
});

router.post('/core/delegar', async (req, res) => {
  try {
    const result = await coreClient.solicitarDelegacao(req.body);
    res.status(202).json(result);
  } catch (err) {
    res.status(502).json({
      error: 'Falha ao solicitar delegação ao Core',
      detail: err.response?.data || err.message,
    });
  }
});

router.get('/core/:rideUuid/proposals', async (req, res) => {
  try {
    const result = await coreClient.consultarPropostas(req.params.rideUuid);
    res.json(result);
  } catch (err) {
    res.status(502).json({
      error: 'Falha ao consultar propostas no Core',
      detail: err.response?.data || err.message,
    });
  }
});

router.get('/core/:rideUuid/status', async (req, res) => {
  try {
    const result = await coreClient.consultarStatus(req.params.rideUuid);
    res.json(result);
  } catch (err) {
    res.status(502).json({
      error: 'Falha ao consultar status no Core',
      detail: err.response?.data || err.message,
    });
  }
});

router.patch('/core/:rideUuid/status', async (req, res) => {
  try {
    const { newState, logicalTimestamp } = req.body;

    const result = await coreClient.atualizarStatus(
      req.params.rideUuid,
      newState,
      logicalTimestamp || Date.now()
    );

    res.json(result);
  } catch (err) {
    res.status(502).json({
      error: 'Falha ao atualizar status no Core',
      detail: err.response?.data || err.message,
    });
  }
});

router.get('/core/:rideUuid/audit', async (req, res) => {
  try {
    const result = await coreClient.consultarAuditLog(req.params.rideUuid);
    res.json(result);
  } catch (err) {
    res.status(502).json({
      error: 'Falha ao consultar audit log no Core',
      detail: err.response?.data || err.message,
    });
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

  if (!ride) {
    return res.status(404).json({ error: 'Corrida não encontrada' });
  }

  res.json(ride);
});

// ─────────────────────────────────────────────
// Alterar estado da corrida
// ─────────────────────────────────────────────
router.patch('/:rideId/state', (req, res) => {
  const { newState } = req.body;

  const ride = rideSaga.transition(req.params.rideId, newState);

  if (!ride) {
    return res.status(400).json({
      error: 'Transição inválida ou corrida não encontrada',
    });
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
      rideId,
      passengerId,
      origin,
      destination,
      ownerServiceId: ownerServiceId || req.body.ownerService,
      lamportTs,
    });
  }

  metrics.ridesReceivedFromCore.inc();

  const lockResult = lockManager.acquire(rideId, config.serviceId);

  if (!lockResult.acquired) {
    return res.status(409).json({
      error: 'Corrida já bloqueada',
      ...lockResult,
    });
  }

  try {
    _acceptLocally(ride);

    const clock = getClock(config.serviceId);
    const ackEvent = clock.tick('ride.delegation_accepted', { rideId });

    return res.json({
      accepted: true,
      serviceId: config.serviceId,
      ride: rideSaga.get(ride.rideId),
      ackTs: ackEvent.ts,
    });

  } catch (err) {
    return res.status(500).json({
      error: 'Erro ao aceitar corrida delegada',
      detail: err.message,
    });
  } finally {
    lockManager.release(rideId, config.serviceId);
  }
});

// ─────────────────────────────────────────────
// Aceite local
// ─────────────────────────────────────────────
function _acceptLocally(ride) {
  const { v4: uuidv4 } = require('uuid');

  rideSaga.transition(ride.rideId, RIDE_STATE.MATCH, {
    assignedService: config.serviceId,
    driverId: `driver-${uuidv4().slice(0, 6)}`,
  });

  structuredLog({
    nivel: 'INFO',
    evento: 'CORRIDA_ACEITA_LOCALMENTE',
    corrida_id: ride.rideId,
    estado_anterior: 'REQUEST',
    estado_novo: 'MATCH',
    detalhes: { serviceId: config.serviceId },
  });

  rideSaga.transition(ride.rideId, RIDE_STATE.CONFIRM);
}

// ─────────────────────────────────────────────
// Delegação para parceiro vencedor
// ─────────────────────────────────────────────
async function _delegateToWinner(ride, winner) {
  const partner = config.partners?.find(p => p.id === winner.serviceId);

  if (!partner) {
    throw new Error(`Parceiro ${winner.serviceId} não encontrado`);
  }

  const cb = cbRegistry.get(winner.serviceId);
  const clock = getClock(config.serviceId);
  const delegateTs = clock.tick('ride.delegating', {
    rideId: ride.rideId,
    to: winner.serviceId,
  });

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