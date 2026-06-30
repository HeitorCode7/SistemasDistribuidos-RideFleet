'use strict';

const amqp = require('amqplib');

let connection = null;
let channel = null;

/*
 * Filas locais
 */
const QUEUE_INPUT = 'pending_rides';
const QUEUE_OUTPUT = 'core_overflow_rides';

/*
 * Filas do Core
 */
const CORE_RIDE_CREATED_QUEUE = 'ridefleet.groups.ride_created';
const CORE_STATUS_QUEUE = 'ridefleet.groups.status';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectRabbitMQ(maxRetries = parseInt(process.env.RABBITMQ_MAX_RETRIES || '60', 10)) {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      console.log(
        `[RabbitMQ] Tentando conexão (${attempt + 1}/${maxRetries})...`
      );

      connection = await amqp.connect(
        process.env.RABBITMQ_URL
      );

      connection.on('error', (err) => {
        console.error(
          '[RabbitMQ] Erro de conexão:',
          err.message
        );
      });

      connection.on('close', () => {
        console.error(
          '[RabbitMQ] Conexão encerrada.'
        );
      });

      channel = await connection.createChannel();

      /*
       * Filas locais
       */
      await channel.assertQueue(
        QUEUE_INPUT,
        {
          durable: true,
        }
      );

      await channel.assertQueue(
        QUEUE_OUTPUT,
        {
          durable: true,
        }
      );

      /*
       * Filas do Core
       */
      await channel.assertQueue(
        CORE_RIDE_CREATED_QUEUE,
        {
          durable: true,
        }
      );

      await channel.assertQueue(
        CORE_STATUS_QUEUE,
        {
          durable: true,
        }
      );

      console.log(
        '[RabbitMQ] Conectado com sucesso.'
      );

      console.log(
        '[RabbitMQ] Filas registradas:',
        [
          QUEUE_INPUT,
          QUEUE_OUTPUT,
          CORE_RIDE_CREATED_QUEUE,
          CORE_STATUS_QUEUE,
        ].join(', ')
      );

      return channel;

    } catch (err) {

      attempt++;

      console.error(
        `[RabbitMQ] Falha na conexão (${attempt}/${maxRetries}): ${err.message}`
      );

      if (attempt >= maxRetries) {
        throw new Error(
          `Não foi possível conectar ao RabbitMQ após ${maxRetries} tentativas.`
        );
      }

      await sleep(parseInt(process.env.RABBITMQ_RETRY_DELAY_MS || '5000', 10));
    }
  }
}

function getChannel() {
  if (!channel) {
    throw new Error(
      'Canal RabbitMQ não inicializado'
    );
  }

  return channel;
}

function getConnection() {
  if (!connection) {
    throw new Error(
      'Conexão RabbitMQ não inicializada'
    );
  }

  return connection;
}

async function closeRabbitMQ() {
  try {

    if (channel) {
      await channel.close();
      channel = null;
    }

    if (connection) {
      await connection.close();
      connection = null;
    }

    console.log(
      '[RabbitMQ] Conexão encerrada com sucesso.'
    );

  } catch (err) {

    console.error(
      '[RabbitMQ] Erro ao encerrar conexão:',
      err.message
    );
  }
}

process.on('SIGINT', async () => {
  await closeRabbitMQ();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeRabbitMQ();
  process.exit(0);
});

module.exports = {
  connectRabbitMQ,
  getChannel,
  getConnection,
  closeRabbitMQ,

  QUEUE_INPUT,
  QUEUE_OUTPUT,

  CORE_RIDE_CREATED_QUEUE,
  CORE_STATUS_QUEUE,
};