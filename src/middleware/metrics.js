// src/middleware/metrics.js
// Observabilidade — métricas Prometheus

const client = require('prom-client');

client.collectDefaultMetrics({ prefix: 'ridefleet_' });

const metrics = {
  // --- Locks ---
  locksAcquired: new client.Counter({
    name: 'ridefleet_locks_acquired_total',
    help: 'Total de locks adquiridos',
    labelNames: ['owner'],
  }),
  locksReleased: new client.Counter({
    name: 'ridefleet_locks_released_total',
    help: 'Total de locks liberados',
    labelNames: ['owner'],
  }),
  locksExpired: new client.Counter({
    name: 'ridefleet_locks_expired_total',
    help: 'Total de locks expirados (TTL)',
    labelNames: ['owner'],
  }),
  lockContentions: new client.Counter({
    name: 'ridefleet_lock_contentions_total',
    help: 'Tentativas de lock bloqueadas por contenção',
    labelNames: ['ride_id'],
  }),

  // --- Saga / Estados de corrida ---
  rideStateTransitions: new client.Counter({
    name: 'ridefleet_ride_state_transitions_total',
    help: 'Transições de estado das corridas',
    labelNames: ['state'],
  }),
  sagaCompensations: new client.Counter({
    name: 'ridefleet_saga_compensations_total',
    help: 'Total de compensações de saga executadas',
    labelNames: ['reason'],
  }),

  // --- Circuit Breaker ---
  cbFailures: new client.Counter({
    name: 'ridefleet_cb_failures_total',
    help: 'Falhas registradas no circuit breaker',
    labelNames: ['partner'],
  }),
  cbStateChange: new client.Counter({
    name: 'ridefleet_cb_state_changes_total',
    help: 'Transições de estado do circuit breaker',
    labelNames: ['partner', 'state'],
  }),

  // --- Leilão ---
  auctionsCompleted: new client.Counter({
    name: 'ridefleet_auctions_completed_total',
    help: 'Leilões completados com vencedor',
    labelNames: ['winner'],
  }),
  auctionsNoWinner: new client.Counter({
    name: 'ridefleet_auctions_no_winner_total',
    help: 'Leilões sem vencedor',
  }),

  // --- HTTP ---
  httpRequestDuration: new client.Histogram({
    name: 'ridefleet_http_request_duration_seconds',
    help: 'Duração das requisições HTTP',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  }),
  // Alias para compatibilidade com código que usa httpDuration
  get httpDuration() { return this.httpRequestDuration; },

  // --- Corridas: fluxo de roteamento ---
  ridesLocal: new client.Counter({
    name: 'ridefleet_rides_local_total',
    help: 'Corridas atendidas localmente',
  }),
  // ridesDelegated: alias mantido para código legado em routes/rides.js
  ridesDelegated: new client.Counter({
    name: 'ridefleet_rides_delegated_total',
    help: 'Corridas delegadas a parceiros',
    labelNames: ['partner'],
  }),
  ridesDelegatedToCore: new client.Counter({
    name: 'ridefleet_rides_delegated_to_core_total',
    help: 'Corridas delegadas ao Core',
  }),
  ridesReceivedFromCore: new client.Counter({
    name: 'ridefleet_rides_received_from_core_total',
    help: 'Corridas recebidas por delegação do Core',
  }),
  ridesRejected: new client.Counter({
    name: 'ridefleet_rides_rejected_total',
    help: 'Corridas rejeitadas (fila cheia ou sem capacidade)',
  }),
  ridesQueued: new client.Counter({
    name: 'ridefleet_rides_queued_total',
    help: 'Corridas enfileiradas na fila local',
  }),
  ridesDequeued: new client.Counter({
    name: 'ridefleet_rides_dequeued_total',
    help: 'Corridas retiradas da fila para processamento',
  }),

  // --- Drivers ---
  driversAvailable: new client.Gauge({
    name: 'ridefleet_drivers_available',
    help: 'Número de motoristas disponíveis no momento',
  }),
};

function httpMetricsMiddleware(req, res, next) {
  const end = metrics.httpRequestDuration.startTimer();
  res.on('finish', () => {
    end({
      method: req.method,
      route: req.route ? req.route.path : req.path,
      status: res.statusCode,
    });
  });
  next();
}

async function metricsHandler(req, res) {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
}

module.exports = { metrics, httpMetricsMiddleware, metricsHandler, client };
