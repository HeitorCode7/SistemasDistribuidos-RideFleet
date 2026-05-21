const amqp = require("amqplib");

let channel;

const QUEUE_INPUT = "pending_rides";
const QUEUE_OUTPUT = "core_overflow_rides";

async function connectRabbitMQ() {
  const connection = await amqp.connect(process.env.RABBITMQ_URL);
  channel = await connection.createChannel();

  await channel.assertQueue(QUEUE_INPUT, { durable: true });
  await channel.assertQueue(QUEUE_OUTPUT, { durable: true });

  console.log("RabbitMQ conectado e filas criadas.");
}

function getChannel() {
  if (!channel) {
    throw new Error("Canal RabbitMQ não inicializado");
  }
  return channel;
}

module.exports = {
  connectRabbitMQ,
  getChannel,
  QUEUE_INPUT,
  QUEUE_OUTPUT,
};