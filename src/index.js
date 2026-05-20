// src/index.js
// Ponto de entrada do servidor RideFleet

try { require('fs').readFileSync('.env'); } catch (_) {}

try {
  const lines = require('fs')
    .readFileSync('.env', 'utf8')
    .split('\n');

  for (const line of lines) {

    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const idx = trimmed.indexOf('=');

    if (idx === -1) {
      continue;
    }

    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();

    if (!process.env[key]) {
      process.env[key] = val;
    }
  }

} catch (_) {}

const express   = require('express');
const cors      = require('cors');
const http      = require('http');
const WebSocket = require('ws');

const config = require('../config');

const { connectRabbitMQ } = require('./rabbitmq');

const { getClock } = require('./logical-clock/lamport-clock');

const {
  httpMetricsMiddleware,
  metricsHandler
} = require('./middleware/metrics');

const { latencyMiddleware, getLatencyStats } = require('./middleware/latency');

const { computeHealth }    = require('./health/health-service');
const { getAlertsSnapshot, startAlertLoop } = require('./health/alerts');
const { registry: cbRegistry } = require('./circuit-breaker/circuit-breaker');

const ridesRouter   = require('./routes/rides');
const auctionRouter = require('./routes/auction');
const auditRouter   = require('./routes/audit');
const driversRouter = require('./routes/drivers');

const driverRegistry = require('./drivers/driverRegistry');

const { RideQueue } = require('./queue/ride-queue');

const rideQueue = new RideQueue(
  config.queueMaxSize || 100
);

global.driverRegistry = driverRegistry;
global.rideQueue      = rideQueue;

const app = express();

app.use(cors());

app.use(express.json());

app.use(httpMetricsMiddleware);

app.use(latencyMiddleware);

app.use(express.static('frontend/public'));

app.use('/api/rides',   ridesRouter);

app.use('/api/auction', auctionRouter);

app.use('/api/audit',   auditRouter);

app.use('/api/drivers', driversRouter(driverRegistry));

app.get('/metrics', metricsHandler);

app.get('/health', async (req, res) => {

  try {
    const queueSnapshot   = rideQueue.snapshot();
    const driversSnapshot = await driverRegistry.snapshot();
    const health          = computeHealth(queueSnapshot, driversSnapshot);
    const alerts          = getAlertsSnapshot();

    // HTTP status reflete o estado do serviço
    const httpStatus =
      health.status === 'UP'       ? 200 :
      health.status === 'DEGRADED' ? 200 :  // ainda responde, mas degradado
      503;

    res.status(httpStatus).json({
      status:    health.status,
      serviceId: config.serviceId,
      ts:        getClock(config.serviceId).now(),
      uptime:    Math.floor(process.uptime()),
      reasons:   health.reasons,
      details:   health.details,
      alerts: {
        active: alerts.activeCount,
        items:  alerts.active,
      },
    });

  } catch (err) {
    res.status(503).json({
      status:    'DOWN',
      serviceId: config.serviceId,
      error:     err.message,
    });
  }
});

const server = http.createServer(app);

const wss = new WebSocket.Server({
  server
});

const clients = new Set();

wss.on('connection', ws => {

  clients.add(ws);

  ws.on('close', () => {
    clients.delete(ws);
  });
});

function broadcast(event, data) {

  const msg = JSON.stringify({
    event,
    data,
    serviceId: config.serviceId
  });

  for (const ws of clients) {

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

global.wsBroadcast = broadcast;

async function start() {

  try {

    // ─────────────────────────────────────────────
    // RabbitMQ
    // ─────────────────────────────────────────────
    await connectRabbitMQ();

    // ─────────────────────────────────────────────
    // Start HTTP Server
    // ─────────────────────────────────────────────
    server.listen(config.port, () => {

      getClock(config.serviceId).tick(
        'service.started',
        {
          port: config.port
        }
      );

      // ─────────────────────────────────────────────
      // Loop de alertas de saúde
      // ─────────────────────────────────────────────
      startAlertLoop(async () => {
        const queue   = rideQueue.snapshot();
        const drivers = await driverRegistry.snapshot();
        const latency = getLatencyStats();
        const cb      = cbRegistry.snapshot();
        return { queue, drivers, latency, cb };
      });

      console.log(
        `RideFleet Service | ID: ${config.serviceId} | Porta: ${config.port}`
      );
    });

  } catch (err) {

    console.error(
      'Erro ao iniciar serviço:',
      err
    );

    process.exit(1);
  }
}

start();

module.exports = {
  app,
  server
};