'use strict';

const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');

const config = require('../config');

const { connectRabbitMQ } = require('./rabbitmq');
const { startCoreConsumer } = require('./queue/core-consumer');
const { startQueueMonitor } = require('./queue/queue-monitor');

const { getClock } = require('./logical-clock/lamport-clock');

const {
  httpMetricsMiddleware,
  metricsHandler
} = require('./middleware/metrics');

const {
  latencyMiddleware,
  getLatencyStats
} = require('./middleware/latency');

const {
  computeHealth
} = require('./health/health-service');

const {
  getAlertsSnapshot,
  startAlertLoop
} = require('./health/alerts');

const {
  registry: cbRegistry
} = require('./circuit-breaker/circuit-breaker');

const ridesRouter = require('./routes/rides');
const auditRouter = require('./routes/audit');
const driversRouterFactory = require('./routes/drivers');

const driverRegistry = require('./drivers/driverRegistry');
const { RideQueue } = require('./queue/ride-queue');

const { coreClient } = require('./core/core-client');

/**
 * ⚠️ IMPORTANTE: router do auction corrigido
 * precisa expor POST /rides/incoming
 */
const { auctionRouter } = require('./consensus/auction');

const rideQueue = new RideQueue(config.queueMaxSize);

/*
 * Globals
 */
global.driverRegistry = driverRegistry;
global.rideQueue = rideQueue;

/*
 * Express
 */
const app = express();

app.use(cors());
app.use(express.json());
app.use(httpMetricsMiddleware);
app.use(latencyMiddleware);

/*
 * Routes
 */
app.use('/api/v1/rides', ridesRouter);

/**
 * FIX CRÍTICO:
 * NÃO usar prefixo /api/v1/auction
 * porque o Core chama /rides/incoming diretamente
 */
app.use('/', auctionRouter);

app.use('/api/v1/audit', auditRouter);
app.use('/api/v1/drivers', driversRouterFactory(driverRegistry));

/*
 * Metrics
 */
app.get('/metrics', metricsHandler);

/*
 * Health
 */
app.get('/api/v1/health', async (req, res) => {
  try {
    const queueSnapshot = rideQueue.snapshot();
    const driversSnapshot = await driverRegistry.snapshot();

    const health = computeHealth(queueSnapshot, driversSnapshot);
    const alerts = getAlertsSnapshot();

    return res.status(200).json({
      status: health.status,
      serviceId: config.serviceId,
      ts: getClock(config.serviceId).now(),
      uptime: Math.floor(process.uptime()),
      reasons: health.reasons,
      details: health.details,
      alerts: {
        active: alerts.activeCount,
        items: alerts.active,
      },
    });

  } catch (err) {
    return res.status(503).json({
      status: 'DOWN',
      error: err.message,
    });
  }
});

/*
 * HTTP + WebSocket
 */
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
});

global.wsBroadcast = (event, data) => {
  const message = JSON.stringify({
    event,
    data,
    serviceId: config.serviceId,
    timestamp: Date.now(),
  });

  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
};

/*
 * Registro no Core
 */
async function registerOnCore() {
  try {
    const result = await coreClient.registrarGrupo();

    console.log(`[CORE] Grupo registrado: ${config.serviceId}`);

    return result;

  } catch (err) {
    console.error(
      '[CORE] Falha ao registrar grupo:',
      err.response?.data || err.message
    );

    return null;
  }
}

/*
 * Startup
 */
async function start() {
  try {
    console.log('[BOOT] Conectando RabbitMQ...');
    await connectRabbitMQ();

    console.log('[BOOT] Iniciando Core Consumer...');
    await startCoreConsumer();

    console.log('[BOOT] Garantindo motoristas locais...');
    await driverRegistry.ensureDefaultDrivers();

    console.log('[BOOT] Iniciando Queue Monitor...');
    startQueueMonitor();

    console.log('[BOOT] Registrando grupo no Core...');
    await registerOnCore();

    server.listen(config.port, () => {
      getClock(config.serviceId).tick('service.started', {
        port: config.port,
      });

      startAlertLoop(async () => ({
        queue: rideQueue.snapshot(),
        drivers: await driverRegistry.snapshot(),
        latency: getLatencyStats(),
        cb: cbRegistry.snapshot(),
      }));

      console.log(
        `RideFleet Service | ID=${config.serviceId} | PORT=${config.port}`
      );
    });

    setInterval(async () => {
      await registerOnCore();
    }, 30000);

  } catch (err) {
    console.error('[BOOT] Erro ao iniciar serviço:', err);
    process.exit(1);
  }
}

start();

module.exports = {
  app,
  server,
};
