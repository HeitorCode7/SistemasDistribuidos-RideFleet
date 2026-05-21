'use strict';

const express = require('express');
const router  = express.Router();

const { getClock }            = require('../logical-clock/lamport-clock');
const { lockManager }         = require('../locks/distributed-lock');
const { registry: cbRegistry }= require('../circuit-breaker/circuit-breaker');
const { rideSaga }            = require('../saga/ride-saga');
const config                  = require('../../config');


// ─────────────────────────────────────────────
// Log causal de uma corrida (Relógio de Lamport)
// ─────────────────────────────────────────────
router.get('/causal/:rideId', (req, res) => {
  const clock = getClock(config.serviceId);
  const log   = clock.getCausalLog(req.params.rideId);
  const ride  = rideSaga.get(req.params.rideId);

  res.json({
    rideId:    req.params.rideId,
    ride,
    causalLog: log,
  });
});


// ─────────────────────────────────────────────
// Estado atual do relógio lógico
// ─────────────────────────────────────────────
router.get('/clock', (req, res) => {
  const clock = getClock(config.serviceId);

  res.json({
    serviceId:    config.serviceId,
    currentTime:  clock.now(),
    recentEvents: clock.getFullLog().slice(-20),
  });
});


// ─────────────────────────────────────────────
// Locks distribuídos ativos
// ─────────────────────────────────────────────
router.get('/locks', (req, res) => {
  res.json({
    locks: lockManager.snapshot(),
  });
});


// ─────────────────────────────────────────────
// Estado dos circuit breakers
// ─────────────────────────────────────────────
router.get('/circuit-breakers', (req, res) => {
  res.json(cbRegistry?.snapshot?.() || {});
});


// ─────────────────────────────────────────────
// Status geral do serviço
// ─────────────────────────────────────────────
router.get('/status', (req, res) => {
  const rides = rideSaga?.getAll?.() || [];

  const countByState = {};
  for (const r of rides) {
    countByState[r.state] = (countByState[r.state] || 0) + 1;
  }

  const partners = config.partners.map(p => {
    const cb = cbRegistry?.get?.(p.id);
    return {
      id:      p.id,
      url:     p.url,
      cbState: cb?.state || 'UNKNOWN',
    };
  });

  const activeLocks = lockManager.snapshot();

  res.json({
    serviceId: config.serviceId,
    uptime:    process.uptime(),
    rides: {
      total:   rides.length,
      byState: countByState,
    },
    activeLocks: {
      count: activeLocks.length,
      items: activeLocks,
    },
    circuitBreakers: cbRegistry?.snapshot?.() || {},
    partners,
  });
});

module.exports = router;