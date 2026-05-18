const express = require('express');

const router = express.Router();

const {
  getClock
} = require('../logical-clock/lamport-clock');

const {
  lockManager
} = require('../locks/distributed-lock');

const {
  registry: cbRegistry
} = require('../circuit-breaker/circuit-breaker');

const {
  rideSaga
} = require('../saga/ride-saga');

const config = require('../../config');


// ─────────────────────────────────────────────
// Causal Log
// ─────────────────────────────────────────────
router.get('/causal/:rideId', (req, res) => {

  const clock = getClock(
    config.serviceId
  );

  const log = clock.getCausalLog(
    req.params.rideId
  );

  const ride = rideSaga.get(
    req.params.rideId
  );

  res.json({
    rideId: req.params.rideId,
    ride,
    causalLog: log
  });
});


// ─────────────────────────────────────────────
// Lamport Clock
// ─────────────────────────────────────────────
router.get('/clock', (req, res) => {

  const clock = getClock(
    config.serviceId
  );

  res.json({
    serviceId: config.serviceId,

    currentTime: clock.now(),

    recentEvents: clock
      .getFullLog()
      .slice(-20),
  });
});


// ─────────────────────────────────────────────
// Distributed Locks
// ─────────────────────────────────────────────
router.get('/locks', (req, res) => {

  res.json({
    locks:
      lockManager?.snapshot?.() || []
  });
});


// ─────────────────────────────────────────────
// Circuit Breakers
// ─────────────────────────────────────────────
router.get('/circuit-breakers', (req, res) => {

  res.json(
    cbRegistry?.snapshot?.() || {}
  );
});


// ─────────────────────────────────────────────
// Service Status
// ─────────────────────────────────────────────
router.get('/status', (req, res) => {

  const rides =
    rideSaga?.getAll?.() || [];

  const countByState = {};

  for (const r of rides) {

    countByState[r.state] =
      (countByState[r.state] || 0) + 1;
  }

  const partners =
    config.partners.map(p => {

      const cb =
        cbRegistry?.get?.(p.id);

      return {
        id: p.id,
        url: p.url,
        cbState: cb?.state || 'UNKNOWN',
      };
    });

  res.json({

    serviceId: config.serviceId,

    uptime: process.uptime(),

    rides: {
      total: rides.length,
      byState: countByState,
    },

    activeLocks:
      lockManager?.snapshot?.()?.length || 0,

    circuitBreakers:
      cbRegistry?.snapshot?.() || {},

    partners,
  });
});

module.exports = router;
