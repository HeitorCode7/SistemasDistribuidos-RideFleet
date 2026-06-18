'use strict';

const express = require('express');
const router = express.Router();

const { auctionService } = require('../consensus/auction');

// guarda propostas em memória dentro do próprio service atual
router.post('/propose', (req, res) => {
  const { rideId, serviceId, score, latency, driverId, callbackUrl } = req.body;

  if (!rideId || !serviceId) {
    return res.status(400).json({ error: 'rideId e serviceId obrigatórios' });
  }

  // se não existir service, cria local simples
  if (!auctionService.proposals) {
    auctionService.proposals = new Map();
  }

  if (!auctionService.proposals.has(rideId)) {
    auctionService.proposals.set(rideId, []);
  }

  auctionService.proposals.get(rideId).push({
    serviceId,
    score: score ?? 0,
    latency: latency ?? 9999,
    driverId,
    callbackUrl,
    receivedAt: Date.now(),
  });

  return res.json({ ok: true });
});

module.exports = router;