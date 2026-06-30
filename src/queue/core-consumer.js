'use strict';

const {
  getChannel,
  CORE_RIDE_CREATED_QUEUE,
  CORE_STATUS_QUEUE
} = require('../rabbitmq');

const { rideSaga } = require('../saga/ride-saga');

async function processRideCreated(payload) {
  const rideId = payload.rideUuid || payload.rideId;

  if (!rideId) {
    console.warn('[CORE] Evento ride_created sem rideId');
    return;
  }

  const existing = rideSaga.get(rideId);

  if (existing) {
    console.log(`[CORE] Corrida ${rideId} ja observada localmente`);
    return;
  }

  const ride = rideSaga.createDelegated({
    rideId,
    passengerId: payload.passengerId,
    origin: payload.origin,
    destination: payload.destination,
    ownerServiceId: payload.originServiceId || 'core',
    lamportTs: payload.logicalTimestamp || Date.now(),
  });

  console.log(`[CORE] Corrida anunciada pelo Core: ${ride.rideId}`);

  if (typeof global.wsBroadcast === 'function') {
    global.wsBroadcast('ride.announced', rideSaga.get(ride.rideId));
  }
}

async function processStatus(payload) {
  const rideId = payload.rideUuid || payload.rideId;

  if (!rideId) return;

  const ride = rideSaga.get(rideId);

  if (!ride) {
    console.warn(`[CORE] Status recebido para corrida inexistente: ${rideId}`);
    return;
  }

  const newState = payload.newState || payload.status || payload.state;

  if (!newState) return;

  if (ride.state !== newState) {
    const transitioned = rideSaga.transition(rideId, newState, {
      assignedService: payload.assignedServiceId || ride.assignedService,
    });

    if (!transitioned) {
      console.warn(`[CORE] Status ${newState} ignorado para ${rideId}; estado local atual: ${ride.state}`);
      return;
    }
  }

  console.log(`[CORE] ${rideId} -> ${newState}`);

  if (typeof global.wsBroadcast === 'function') {
    global.wsBroadcast('ride.status.changed', {
      rideId,
      state: newState,
    });
  }
}

async function startCoreConsumer() {
  const channel = getChannel();

  await channel.assertQueue(CORE_RIDE_CREATED_QUEUE, { durable: true });
  await channel.assertQueue(CORE_STATUS_QUEUE, { durable: true });

  channel.consume(CORE_RIDE_CREATED_QUEUE, async (msg) => {
    if (!msg) return;

    try {
      const payload = JSON.parse(msg.content.toString());
      await processRideCreated(payload);
      channel.ack(msg);
    } catch (err) {
      console.error('[CORE] erro ride_created:', err);
      channel.nack(msg, false, true);
    }
  });

  channel.consume(CORE_STATUS_QUEUE, async (msg) => {
    if (!msg) return;

    try {
      const payload = JSON.parse(msg.content.toString());
      await processStatus(payload);
      channel.ack(msg);
    } catch (err) {
      console.error('[CORE] erro status:', err);
      channel.nack(msg, false, true);
    }
  });

  console.log('[CORE] Consumers iniciados');
}

module.exports = {
  startCoreConsumer,
  processRideCreated,
  processStatus,
};
