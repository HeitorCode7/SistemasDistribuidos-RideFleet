const {
  getChannel,
  QUEUE_INPUT,
  QUEUE_OUTPUT
} = require("../rabbitmq");

const MAX_RETRIES = 3;
const MAX_WAIT_TIME = 5 * 60 * 1000;

async function startRideConsumer() {
  const channel = getChannel();

  channel.consume(QUEUE_INPUT, async (msg) => {
    if (!msg) return;

    try {
      const ride = JSON.parse(msg.content.toString());

      const now = Date.now();
      const createdAt = ride.createdAt
        ? new Date(ride.createdAt).getTime()
        : now;

      const retries = ride.retries || 0;
      const waitingTooLong = now - createdAt > MAX_WAIT_TIME;

      if (waitingTooLong || retries >= MAX_RETRIES) {
        channel.sendToQueue(
          QUEUE_OUTPUT,
          Buffer.from(JSON.stringify({
            ...ride,
            reason: "overflow_or_max_retries",
            sentToCoreAt: new Date()
          })),
          { persistent: true }
        );

        console.log("Corrida enviada para fila de saída/Core:", ride.id);
        channel.ack(msg);
        return;
      }

      console.log("Processando corrida da fila:", ride.id);

      channel.ack(msg);

    } catch (error) {
      console.error("Erro ao processar corrida:", error.message);
      channel.nack(msg, false, true);
    }
  });

  console.log("Consumidor da fila de corridas iniciado.");
}

module.exports = {
  startRideConsumer
};