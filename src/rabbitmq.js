'use strict';

const amqp = require('amqplib');

let connection = null;
let channel = null;

const QUEUE_INPUT = 'pending_rides';
const QUEUE_OUTPUT = 'core_overflow_rides';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectRabbitMQ(maxRetries = 20) {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      console.log(
        `[RabbitMQ] Tentando conexão (${attempt + 1}/${maxRetries})...`
      );

      connection = await amqp.connect(process.env.RABBITMQ_URL);

      connection.on('error', (err) => {
        console.error('[RabbitMQ] Erro de conexão:', err.message);
      });

      connection.on('close', () => {
        console.error('[RabbitMQ] Conexão encerrada.');
      });

      channel = await connection.createChannel();

      await channel.assertQueue(QUEUE_INPUT, {
        durable: true,
      });

      await channel.assertQueue(QUEUE_OUTPUT, {
        durable: true,
      });

      console.log('[RabbitMQ] Conectado com sucesso.');
      console.log(
        `[RabbitMQ] Filas disponíveis: ${QUEUE_INPUT}, ${QUEUE_OUTPUT}`
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

      await sleep(5000);
    }
  }
}

function getChannel() {
  if (!channel) {
    throw new Error('Canal RabbitMQ não inicializado');
  }

  return channel;
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

    console.log('[RabbitMQ] Conexão encerrada com sucesso.');

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
  closeRabbitMQ,
  QUEUE_INPUT,
  QUEUE_OUTPUT,
};