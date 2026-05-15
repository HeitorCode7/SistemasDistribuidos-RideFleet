// src/routes/rides.js
// Rotas principais de corridas

const express = require('express');
const router = express.Router();
const axios = require('axios');

const { lockManager } = require('../locks/distributed-lock');
const { rideSaga, RIDE_STATE } = require('../saga/ride-saga');
const { auctionService } = require('../consensus/auction');
const { registry: cbRegistry } = require('../circuit-breaker/circuit-breaker');
const { getClock } = require('../logical-clock/lamport-clock');
const { metrics } = require('../middleware/metrics');
const { overflowPolicy } = require('../policy/overflow-policy');
const { RideQueue } = require('../queue/ride-queue');
const config = require('../../config');

const queue = new RideQueue(config.rideQueueMaxSize || 100);

// ─────────────────────────────────────────────
// POST /api/rides — Solicitar nova corrida
// ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { passengerId, origin, destination } = req.body;
  if (!passengerId || !origin || !destination) {
    return res.status(400).json({ error: 'passengerId, origin e destination são obrigatórios' });
  }

  const ride = rideSaga.createLocal({ passengerId, origin, destination });

  const lockResult = lockManager.acquire(ride.rideId, config.serviceId);
  if (!lockResult.acquired) {
    rideSaga.compensate(ride.rideId, 'lock_not_acquired');
    return res.status(409).json({ error: 'Corrida já está sendo processada', ...lockResult });
  }

  try {
    const decision = overflowPolicy.getDecision(ride, queue.snapshot());

    if (decision === 'reject') {
      rideSaga.compensate(ride.rideId, 'rejected_queue_full');
      metrics.ridesRejected.inc();
      return res.status(503).json({ error: 'Serviço sobrecarregado. Tente novamente.' });
    }

    if (decision === 'queue') {
      const enqueued = queue.enqueue(ride, 'overflow_policy');
      metrics.ridesQueued.inc();
      return res.status(202).json({
        message: 'Corrida enfileirada, será processada em breve',
        ride: rideSaga.get(ride.rideId),
        queue: enqueued,
      });
    }

    if (decision === 'local') {
      await _acceptLocally(ride);
      metrics.ridesLocal.inc();
    } else {
      // decision === 'delegate'
      const winner = await auctionService.runAuction(ride);

      if (!winner) {
        // Nenhum parceiro disponível — aceita local
        await _acceptLocally(ride);
        metrics.ridesLocal.inc();
      } else {
        await _delegateToWinner(ride, winner);
        metrics.ridesDelegated.inc({ partner: winner.serviceId });
        metrics.ridesDelegatedToCore.inc();
      }
    }

    res.status(201).json(rideSaga.get(ride.rideId));
  } catch (err) {
    console.error(`[RIDES] Erro ao processar corrida ${ride.rideId}:`, err.message);
    rideSaga.compensate(ride.rideId, err.message);
    res.status(500).json({ error: 'Falha ao processar corrida', detail: err.message });
  } finally {
    lockManager.release(ride.rideId, config.serviceId);
  }
});

// ─────────────────────────────────────────────
// GET /api/rides — Listar corridas
// ─────────────────────────────────────────────
router.get('/', (req, res) => {
  res.json(rideSaga.getAll());
});

// ─────────────────────────────────────────────
// GET /api/rides/:rideId — Detalhes de uma corrida
// ─────────────────────────────────────────────
router.get('/:rideId', (req, res) => {
  const ride = rideSaga.get(req.params.rideId);
  if (!ride) return res.status(404).json({ error: 'Corrida não encontrada' });
  res.json(ride);
});

// ─────────────────────────────────────────────
// POST /api/rides/:rideId/accept — Receber delegação de parceiro
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
    return res.status(409).json({ error: 'Corrida já bloqueada', ...lockResult });
  }

  try {
    await _acceptLocally(ride);
    const clock = getClock(config.serviceId);
    const ackEvent = clock.tick('ride.delegation_accepted', { rideId });

    res.json({
      accepted: true,
      serviceId: config.serviceId,
      ride: rideSaga.get(ride.rideId),
      ackTs: ackEvent.ts,
    });
  } finally {
    lockManager.release(rideId, config.serviceId);
  }
});

// ─────────────────────────────────────────────
// PATCH /api/rides/:rideId/state — Avançar estado (para simulação/testes)
// ─────────────────────────────────────────────
router.patch('/:rideId/state', (req, res) => {
  const { newState } = req.body;
  const ride = rideSaga.transition(req.params.rideId, newState);
  if (!ride) return res.status(400).json({ error: 'Transição inválida ou corrida não encontrada' });
  res.json(ride);
});

// ─────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────

async function _acceptLocally(ride) {
  const { v4: uuidv4 } = require('uuid');
  rideSaga.transition(ride.rideId, RIDE_STATE.MATCH, {
    assignedService: config.serviceId,
    driverId: `driver-${uuidv4().slice(0, 6)}`,
  });
  rideSaga.transition(ride.rideId, RIDE_STATE.CONFIRM);

  setTimeout(() => {
    const r = rideSaga.get(ride.rideId);
    if (r && r.state === RIDE_STATE.CONFIRM) {
      rideSaga.transition(ride.rideId, RIDE_STATE.IN_TRANSIT);
      setTimeout(() => {
        const r2 = rideSaga.get(ride.rideId);
        if (r2 && r2.state === RIDE_STATE.IN_TRANSIT) {
          rideSaga.transition(ride.rideId, RIDE_STATE.COMPLETE);
        }
      }, 8000);
    }
  }, 2000);
}

async function _delegateToWinner(ride, winner) {
  const partner = config.partners.find(p => p.id === winner.serviceId);
  if (!partner) throw new Error(`Parceiro ${winner.serviceId} não encontrado na config`);

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
  rideSaga.transition(ride.rideId, RIDE_STATE.COMPLETE);
}

module.exports = router;
