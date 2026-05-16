
const express = require('express');
const router = express.Router();
const { getClock } = require('../logical-clock/lamport-clock');
const { lockManager } = require('../locks/distributed-lock');
const { registry: cbRegistry } = require('../circuit-breaker/circuit-breaker');
const { rideSaga } = require('../saga/ride-saga');
const config = require('../../config');

router.get('/causal/:rideId', (req, res) => {
  const clock = getClock(config.serviceId);
  const log = clock.getCausalLog(req.params.rideId);
  const ride = rideSaga.get(req.params.rideId);
  res.json({ rideId: req.params.rideId, ride, causalLog: log });
});


router.get('/clock', (req, res) => {
  const clock = getClock(config.serviceId);
  res.json({
    serviceId: config.serviceId,
    currentTime: clock.now(),
    recentEvents: clock.getFullLog().slice(-20),
  });
});

router.get('/locks', (req, res) => {
  res.json({ locks: lockManager.snapshot() });
});

router.get('/circuit-breakers', (req, res) => {
  res.json(cbRegistry.snapshot());
});

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
