<<<<<<< HEAD
const { structuredLog } = require('../logging/logger');
=======
>>>>>>> ddc3a7e168756d911d3ae9d9d201e64c0b58a594
const express = require('express');
const router = express.Router();
const axios = require('axios');

const { DistributedLockManager } = require('../locks/distributed-lock');
const lockManager = new DistributedLockManager();

const { rideSaga, RIDE_STATE } = require('../saga/ride-saga');
const { auctionService } = require('../consensus/auction');
const { registry: cbRegistry } = require('../circuit-breaker/circuit-breaker');
const { getClock } = require('../logical-clock/lamport-clock');
const { metrics } = require('../middleware/metrics');

const config = require('../../config');

const { getChannel } = require('../rabbitmq');


// ─────────────────────────────────────────────
// Criar corrida
// ─────────────────────────────────────────────
router.post('/', async (req, res) => {

  const {
    passengerId,
    origin,
    destination
  } = req.body;

  if (
    !passengerId ||
    !origin ||
    !destination
  ) {
    return res.status(400).json({
      error: 'passengerId, origin e destination são obrigatórios'
    });
  }

  // ─────────────────────────────────────────
  // Criar corrida
  // ─────────────────────────────────────────
  const ride = rideSaga.createLocal({
    passengerId,
    origin,
    destination
  });
<<<<<<< HEAD
  
  structuredLog({
    nivel: 'INFO',
    evento: 'CORRIDA_CRIADA',

    corrida_id: ride.id,

    estado_anterior: null,
    estado_novo: 'REQUEST',

    detalhes: {
        passengerId,
        origin,
        destination
    }
});
=======
>>>>>>> ddc3a7e168756d911d3ae9d9d201e64c0b58a594

  // ─────────────────────────────────────────
  // Lock distribuído
  // ─────────────────────────────────────────
  const lockResult = lockManager.acquire(
    ride.rideId,
    config.serviceId
  );

  if (!lockResult.acquired) {

    rideSaga.compensate(
      ride.rideId,
      'lock_not_acquired'
    );

    return res.status(409).json({
      error: 'Corrida já está sendo processada',
      ...lockResult
    });
  }

  try {

    // ─────────────────────────────────────────
    // Política de congestionamento
    // Sistema suporta até 10 corridas ativas
    // ─────────────────────────────────────────
    const activeRides =
      rideSaga
        .getAll()
        .filter(r =>
          r.state !== 'complete' &&
          r.state !== 'cancelled'
        ).length;

    let decision = 'local';

    // ─────────────────────────────────────────
    // Serviço congestionado
    // ─────────────────────────────────────────
    if (activeRides >= 10) {

      decision = 'queue';
<<<<<<< HEAD
    structuredLog({
    nivel: 'WARN',
    evento: 'CORRIDA_ENFILEIRADA',

    corrida_id: ride.id,

    estado_anterior: 'REQUEST',
    estado_novo: 'QUEUED',

    detalhes: {
        activeRides
    }
})};
=======
    }
>>>>>>> ddc3a7e168756d911d3ae9d9d201e64c0b58a594

    // ─────────────────────────────────────────
    // Fila cheia
    // ─────────────────────────────────────────
    if (activeRides >= 20) {

      decision = 'reject';
<<<<<<< HEAD
    structuredLog({
    nivel: 'ERROR',
    evento: 'CORRIDA_REJEITADA',

    corrida_id: ride.id,

    estado_anterior: 'REQUEST',
    estado_novo: 'REJECTED',

    detalhes: {
        motivo: 'sobrecarga'
    }
})};
=======
    }
>>>>>>> ddc3a7e168756d911d3ae9d9d201e64c0b58a594

    // ─────────────────────────────────────────
    // Rejeitar
    // ─────────────────────────────────────────
    if (decision === 'reject') {

      rideSaga.compensate(
        ride.rideId,
        'rejected_queue_full'
      );

      metrics.ridesRejected.inc();

      return res.status(503).json({
        error: 'Serviço sobrecarregado. Tente novamente.'
      });
    }

    // ─────────────────────────────────────────
    // Enfileirar no RabbitMQ
    // ─────────────────────────────────────────
    if (decision === 'queue') {

      try {

        const channel = getChannel();

        channel.sendToQueue(
          'pending_rides',

          Buffer.from(
            JSON.stringify(ride)
          ),

          {
            persistent: true
          }
        );

        console.log(
          '[RABBITMQ] Corrida enviada para fila:',
          ride.rideId
        );

      } catch (rabbitErr) {

        console.error(
          '[RABBITMQ] Erro ao publicar:',
          rabbitErr.message
        );

        return res.status(500).json({
          error: 'Falha ao publicar na fila'
        });
      }

      metrics.ridesQueued.inc();

      return res.status(202).json({
        message: 'Corrida enfileirada por congestionamento',
        ride
      });
    }

    // ─────────────────────────────────────────
    // Processar localmente
    // ─────────────────────────────────────────
    if (decision === 'local') {

      await _acceptLocally(ride);

      metrics.ridesLocal.inc();
    }

    // ─────────────────────────────────────────
    // Resposta
    // ─────────────────────────────────────────
    return res.status(201).json(
      rideSaga.get(ride.rideId)
    );

  } catch (err) {

<<<<<<< HEAD
    structuredLog({
        nivel: 'ERROR',
        evento: 'ERRO_INTERNO',

        corrida_id: ride?.rideId,

        detalhes: {
            erro: err.message
        }
    });
    
=======
>>>>>>> ddc3a7e168756d911d3ae9d9d201e64c0b58a594
    console.error(
      `[RIDES] Erro ao processar corrida ${ride.rideId}:`,
      err.message
    );

    rideSaga.compensate(
      ride.rideId,
      err.message
    );

    return res.status(500).json({
      error: 'Falha ao processar corrida',
      detail: err.message
    });

  } finally {

    lockManager.release(
      ride.rideId,
      config.serviceId
    );
  }
});


// ─────────────────────────────────────────────
// Listar corridas
// ─────────────────────────────────────────────
router.get('/', (req, res) => {

  res.json(
    rideSaga.getAll()
  );
});


// ─────────────────────────────────────────────
// Buscar corrida específica
// ─────────────────────────────────────────────
router.get('/:rideId', (req, res) => {

  const ride = rideSaga.get(
    req.params.rideId
  );

  if (!ride) {

    return res.status(404).json({
      error: 'Corrida não encontrada'
    });
  }

  res.json(ride);
});


// ─────────────────────────────────────────────
// Alterar estado da corrida
// ─────────────────────────────────────────────
router.patch('/:rideId/state', (req, res) => {

  const { newState } = req.body;

  const ride = rideSaga.transition(
    req.params.rideId,
    newState
  );

  if (!ride) {

    return res.status(400).json({
      error: 'Transição inválida ou corrida não encontrada'
    });
  }

  res.json(ride);
});


// ─────────────────────────────────────────────
// Aceitar corrida delegada
// ─────────────────────────────────────────────
router.post('/:rideId/accept', async (req, res) => {

  const { rideId } = req.params;

  const {
    origin,
    destination,
    passengerId,
    ownerServiceId,
    lamportTs
  } = req.body;

  let ride = rideSaga.get(rideId);

  if (!ride) {

    ride = rideSaga.createDelegated({

      rideId,

      passengerId,

      origin,

      destination,

      ownerServiceId:
        ownerServiceId ||
        req.body.ownerService,

      lamportTs,
    });
  }

  metrics.ridesReceivedFromCore.inc();

  const lockResult = lockManager.acquire(
    rideId,
    config.serviceId
  );

  if (!lockResult.acquired) {

    return res.status(409).json({
      error: 'Corrida já bloqueada',
      ...lockResult
    });
  }

  try {

    await _acceptLocally(ride);

    const clock = getClock(
      config.serviceId
    );

    const ackEvent = clock.tick(
      'ride.delegation_accepted',
      { rideId }
    );

    return res.json({

      accepted: true,

      serviceId:
        config.serviceId,

      ride:
        rideSaga.get(
          ride.rideId
        ),

      ackTs:
        ackEvent.ts,
    });

  } finally {

    lockManager.release(
      rideId,
      config.serviceId
    );
  }
});


// ─────────────────────────────────────────────
// Aceite local
// ─────────────────────────────────────────────
async function _acceptLocally(ride) {

  const {
    v4: uuidv4
  } = require('uuid');

  rideSaga.transition(
    ride.rideId,
    RIDE_STATE.MATCH,
    {
      assignedService:
        config.serviceId,

      driverId:
        `driver-${uuidv4().slice(0, 6)}`,
    }
  );

<<<<<<< HEAD
  structuredLog({
    nivel: 'INFO',
    evento: 'CORRIDA_ACEITA_LOCALMENTE',

    corrida_id: ride.rideId,

    estado_anterior: 'REQUEST',
    estado_novo: 'MATCH',

    detalhes: {
        serviceId: config.serviceId
    }
});

=======
>>>>>>> ddc3a7e168756d911d3ae9d9d201e64c0b58a594
  rideSaga.transition(
    ride.rideId,
    RIDE_STATE.CONFIRM
  );

  // NÃO completar automaticamente
  // para permitir simulação de congestionamento
}


// ─────────────────────────────────────────────
// Delegação futura
// ─────────────────────────────────────────────
async function _delegateToWinner(
  ride,
  winner
) {

  const partner =
    config.partners?.find(
      p => p.id === winner.serviceId
    );

  if (!partner) {

    throw new Error(
      `Parceiro ${winner.serviceId} não encontrado`
    );
  }

  const cb =
    cbRegistry.get(
      winner.serviceId
    );

  const clock =
    getClock(config.serviceId);

  const delegateTs =
    clock.tick(
      'ride.delegating',
      {
        rideId: ride.rideId,
        to: winner.serviceId
      }
    );

  await cb.call(() =>
    axios.post(
      `${partner.url}/api/rides/${ride.rideId}/accept`,
      {
        rideId: ride.rideId,

        origin: ride.origin,

        destination:
          ride.destination,

        passengerId:
          ride.passengerId,

        ownerServiceId:
          config.serviceId,

        lamportTs:
          delegateTs.ts,
      },
      {
        timeout: 5000
      }
    )
  );

  rideSaga.transition(
    ride.rideId,
    RIDE_STATE.MATCH,
    {
      assignedService:
        winner.serviceId,

      driverId:
        `${winner.serviceId}-driver`,
    }
  );

  rideSaga.transition(
    ride.rideId,
    RIDE_STATE.CONFIRM
  );
}

module.exports = router;