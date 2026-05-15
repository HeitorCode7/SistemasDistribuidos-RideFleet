// src/routes/audit.js
// Rotas de auditoria e observabilidade

const express = require('express');
const router = express.Router();
const { getClock } = require('../logical-clock/lamport-clock');
const { lockManager } = require('../locks/distributed-lock');
const { registry: cbRegistry } = require('../circuit-breaker/circuit-breaker');
const { rideSaga } = require('../saga/ride-saga');
const config = require('../../config');

// GET /api/audit/causal/:rideId — Log causal de uma corrida
router.get('/causal/:rideId', (req, res) => {
  const clock = getClock(config.serviceId);
  const log = clock.getCausalLog(req.params.rideId);
  const ride = rideSaga.get(req.params.rideId);
  res.json({ rideId: req.params.rideId, ride, causalLog: log });
});

// GET /api/audit/clock — Estado atual do relógio lógico
router.get('/clock', (req, res) => {
  const clock = getClock(config.serviceId);
  res.json({
    serviceId: config.serviceId,
    currentTime: clock.now(),
    recentEvents: clock.getFullLog().slice(-20),
  });
});

// GET /api/audit/locks — Estado dos locks
router.get('/locks', (req, res) => {
  res.json({ locks: lockManager.snapshot() });
});

// GET /api/audit/circuit-breakers — Estado dos circuit breakers
router.get('/circuit-breakers', (req, res) => {
  res.json(cbRegistry.snapshot());
});

// GET /api/audit/status — Status geral do serviço
router.get('/status', (req, res) => {
  const rides = rideSaga.getAll();
  const countByState = {};
  for (const r of rides) {
    countByState[r.state] = (countByState[r.state] || 0) + 1;
  }

  res.json({
    serviceId: config.serviceId,
    uptime: process.uptime(),
    rides: {
      total: rides.length,
      byState: countByState,
    },
    activeLocks: lockManager.snapshot().length,
    circuitBreakers: cbRegistry.snapshot(),
    partners: config.partners.map(p => ({
      id: p.id,
      url: p.url,
      cbState: cbRegistry.get(p.id).state,
    })),
  });
});

module.exports = router;
