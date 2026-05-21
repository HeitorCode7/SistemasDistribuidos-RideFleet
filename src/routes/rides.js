'use strict';

const express = require('express');
const router  = express.Router();
const axios   = require('axios');

const { lockManager }           = require('../locks/distributed-lock');
const { rideSaga, RIDE_STATE }  = require('../saga/ride-saga');
const { auctionService }        = require('../consensus/auction');
const { registry: cbRegistry }  = require('../circuit-breaker/circuit-breaker');
const { getClock }              = require('../logical-clock/lamport-clock');
const { metrics }               = require('../middleware/metrics');
const { structuredLog }         = require('../logging/logger');
const { getChannel, QUEUE_INPUT } = require('../rabbitmq');
const config                    = require('../../config');


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

  // ── Criar corrida na saga ──────────────────────────────────────────────
  const ride = rideSaga.createLocal({ passengerId, origin, destination });

  structuredLog({
    nivel:           'INFO',
    evento:          'CORRIDA_CRIADA',
    corrida_id:      ride.rideId,
    estado_anterior: null,
    estado_novo:     'REQUEST',
    detalhes:        { passengerId, origin, destination },
  });

  // ── Lock distribuído ───────────────────────────────────────────────────
  const lockResult = lockManager.acquire(ride.rideId, config.serviceId);

  if (!lockResult.acquired) {
    rideSaga.compensate(ride.rideId, 'lock_not_acquired');
    return res.status(409).json({
      error: 'Corrida já está sendo processada',
      ...lockResult,
    });
  }

  try {

    // ── Contagem de corridas ativas ────────────────────────────────────
    const activeRides = rideSaga
      .getAll()
      .filter(r => r.state !== 'complete' && r.state !== 'cancelled').length;

    // ── Política de congestionamento (20+ → rejeita, 10+ → fila) ──────
    if (activeRides >= 20) {
      rideSaga.compensate(ride.rideId, 'rejected_queue_full');
      metrics.ridesRejected.inc();

      structuredLog({
        nivel:           'ERROR',
        evento:          'CORRIDA_REJEITADA',
        corrida_id:      ride.rideId,
        estado_anterior: 'REQUEST',
        estado_novo:     'REJECTED',
        detalhes:        { motivo: 'sobrecarga', activeRides },
      });

      return res.status(503).json({
        error: 'Serviço sobrecarregado. Tente novamente.',
      });
    }

    if (activeRides >= 10) {
  try {
    const channel = getChannel();

    const queuedRide = {
      ...ride,
      state: 'QUEUED',
      queuedAt: new Date().toISOString(),
      retries: 0,
      sourceServiceId: config.serviceId,
      reason: 'congestionamento',
    };

   channel.sendToQueue(
  QUEUE_INPUT,
  Buffer.from(JSON.stringify(queuedRide)),
  { persistent: true }
  );

    metrics.ridesQueued.inc();

    structuredLog({
      nivel:           'WARN',
      evento:          'CORRIDA_ENFILEIRADA',
      corrida_id:      ride.rideId,
      estado_anterior: 'REQUEST',
      estado_novo:     'QUEUED',
      detalhes:        { activeRides },
    });

    console.log('[RABBITMQ] Corrida enviada para fila:', ride.rideId);

    return res.status(202).json({
      message: 'Corrida enfileirada por congestionamento',
      queue: 'pending_rides',
      ride: queuedRide,
    });

  } catch (rabbitErr) {
    console.error('[RABBITMQ] Erro ao publicar:', rabbitErr.message);

    rideSaga.compensate(ride.rideId, 'rabbitmq_publish_failed');

    return res.status(500).json({
      error: 'Falha ao publicar corrida na fila',
      detail: rabbitErr.message,
    });
  }
}

  } finally {
    lockManager.release(ride.rideId, config.serviceId);
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
// Aceitar corrida delegada (chamado por parceiros)
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
    await _acceptLocally(ride);

    const clock    = getClock(config.serviceId);
    const ackEvent = clock.tick('ride.delegation_accepted', { rideId });

    return res.json({
      accepted:  true,
      serviceId: config.serviceId,
      ride:      rideSaga.get(ride.rideId),
      ackTs:     ackEvent.ts,
    });

  } finally {
    lockManager.release(rideId, config.serviceId);
  }
});


// ─────────────────────────────────────────────
// Aceite local (interno)
// ─────────────────────────────────────────────
async function _acceptLocally(ride) {
  const { v4: uuidv4 } = require('uuid');

  rideSaga.transition(ride.rideId, RIDE_STATE.MATCH, {
    assignedService: config.serviceId,
    driverId:        `driver-${uuidv4().slice(0, 6)}`,
  });

  structuredLog({
    nivel:           'INFO',
    evento:          'CORRIDA_ACEITA_LOCALMENTE',
    corrida_id:      ride.rideId,
    estado_anterior: 'REQUEST',
    estado_novo:     'MATCH',
    detalhes:        { serviceId: config.serviceId },
  });

  rideSaga.transition(ride.rideId, RIDE_STATE.CONFIRM);
  // NÃO completa automaticamente — permite simulação de congestionamento
}


// ─────────────────────────────────────────────
// Delegação para parceiro vencedor do leilão
// ─────────────────────────────────────────────
async function _delegateToWinner(ride, winner) {
  const partner = config.partners?.find(p => p.id === winner.serviceId);

  if (!partner) {
    throw new Error(`Parceiro ${winner.serviceId} não encontrado`);
  }

  const cb         = cbRegistry.get(winner.serviceId);
  const clock      = getClock(config.serviceId);
  const delegateTs = clock.tick('ride.delegating', {
    rideId: ride.rideId,
    to:     winner.serviceId,
  });

  await cb.call(() =>
    axios.post(
      `${partner.url}/api/rides/${ride.rideId}/accept`,
      {
        rideId:         ride.rideId,
        origin:         ride.origin,
        destination:    ride.destination,
        passengerId:    ride.passengerId,
        ownerServiceId: config.serviceId,
        lamportTs:      delegateTs.ts,
      },
      { timeout: 5000 }
    )
  );

  rideSaga.transition(ride.rideId, RIDE_STATE.MATCH, {
    assignedService: winner.serviceId,
    driverId:        `${winner.serviceId}-driver`,
  });

  rideSaga.transition(ride.rideId, RIDE_STATE.CONFIRM);
}

module.exports = router;