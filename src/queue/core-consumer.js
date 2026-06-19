'use strict';

const {
  getChannel,
  CORE_RIDE_CREATED_QUEUE,
  CORE_STATUS_QUEUE
} = require('../rabbitmq');

const { rideSaga } = require('../saga/ride-saga');
const { metrics } = require('../middleware/metrics');
const config = require('../../config');

async function processRideCreated(payload) {

  const rideId =
    payload.rideUuid ||
    payload.rideId;

  if (!rideId) {
    console.warn('[CORE] Evento sem rideId');
    return;
  }

  const existing = rideSaga.get(rideId);

  if (existing) {
    console.log(
      `[CORE] Corrida ${rideId} já existe localmente`
    );
    return;
  }

  const ride = rideSaga.createDelegated({
    rideId,
    passengerId: payload.passengerId,
    origin: payload.origin,
    destination: payload.destination,
    ownerServiceId:
      payload.originServiceId || 'core',
    lamportTs:
      payload.logicalTimestamp || Date.now(),
  });

  /*
   * Aceita automaticamente a corrida
   */
  rideSaga.transition(
    ride.rideId,
    'match',
    {
      assignedService: config.serviceId,
      driverId: `driver-core-${ride.rideId.slice(0, 6)}`
    }
  );

  metrics.ridesReceivedFromCore.inc();

  console.log(
    `[CORE] Corrida recebida do Core: ${ride.rideId}`
  );

  if (typeof global.wsBroadcast === 'function') {
    global.wsBroadcast(
      'ride.received',
      rideSaga.get(ride.rideId)
    );
  }
}

async function processStatus(payload) {

  const rideId =
    payload.rideUuid ||
    payload.rideId;

  if (!rideId) {
    return;
  }

  const ride = rideSaga.get(rideId);

  if (!ride) {
    console.warn(
      `[CORE] Status recebido para corrida inexistente: ${rideId}`
    );
    return;
  }

  if (payload.newState) {

    rideSaga.transition(
      rideId,
      payload.newState
    );

    console.log(
      `[CORE] ${rideId} -> ${payload.newState}`
    );

    if (typeof global.wsBroadcast === 'function') {
      global.wsBroadcast(
        'ride.status.changed',
        {
          rideId,
          state: payload.newState,
        }
      );
    }
  }
}

async function startCoreConsumer() {

  const channel = getChannel();

  await channel.assertQueue(
    CORE_RIDE_CREATED_QUEUE,
    {
      durable: true
    }
  );

  await channel.assertQueue(
    CORE_STATUS_QUEUE,
    {
      durable: true
    }
  );

  channel.consume(
    CORE_RIDE_CREATED_QUEUE,
    async (msg) => {

      if (!msg) return;

      try {

        const payload = JSON.parse(
          msg.content.toString()
        );

        await processRideCreated(payload);

        channel.ack(msg);

      } catch (err) {

        console.error(
          '[CORE] erro ride_created:',
          err
        );

        channel.nack(
          msg,
          false,
          true
        );
      }
    }
  );

  channel.consume(
    CORE_STATUS_QUEUE,
    async (msg) => {

      if (!msg) return;

      try {

        const payload = JSON.parse(
          msg.content.toString()
        );

        await processStatus(payload);

        channel.ack(msg);

      } catch (err) {

        console.error(
          '[CORE] erro status:',
          err
        );

        channel.nack(
          msg,
          false,
          true
        );
      }
    }
  );

  console.log(
    '[CORE] Consumers iniciados'
  );
}

module.exports = {
  startCoreConsumer,
};