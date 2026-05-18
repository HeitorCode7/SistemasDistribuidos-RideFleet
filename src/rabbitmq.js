'use strict';

const amqp = require('amqplib');

let connection;
let channel;

async function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

async function connectRabbitMQ() {

  while (!channel) {

    try {

      console.log(
        '[RabbitMQ] Tentando conectar...'
      );

      connection = await amqp.connect(
        process.env.RABBITMQ_URL || 'amqp://rabbitmq'
      );

      channel = await connection.createChannel();

      await channel.assertQueue(
        'pending_rides',
        {
          durable: true
        }
      );

      console.log(
        '[RabbitMQ] Conectado com sucesso'
      );

    } catch (err) {

      console.error(
        '[RabbitMQ] Falha ao conectar:',
        err.message
      );

      console.log(
        '[RabbitMQ] Tentando novamente em 5s...'
      );

      await sleep(5000);
    }
  }
}

function getChannel() {

  if (!channel) {
    throw new Error(
      'RabbitMQ channel não inicializado'
    );
  }

  return channel;
}

module.exports = {
  connectRabbitMQ,
  getChannel
};