const { structuredLog } = require('../logging/logger');
const express = require('express');
const router = express.Router();
const { auctionService } = require('../consensus/auction');
const { getClock } = require('../logical-clock/lamport-clock');
const config = require('../../config');

router.post('/propose', (req, res) => {
  const { rideId, origin, destination, auctionTs, requesterServiceId } = req.body;

  structuredLog({
    nivel: 'INFO',
    evento: 'PROPOSTA_LEILAO_RECEBIDA',

    corrida_id: req.body.rideId || req.body.ride_id || null,

    detalhes: {
        parceiro: process.env.SERVICE_ID
    }
});

  if (!rideId || !auctionTs) {
    return res.status(400).json({ error: 'rideId e auctionTs são obrigatórios' });
  }

  // Atualiza relógio lógico ao receber evento externo
  const clock = getClock(config.serviceId);
  clock.receive(auctionTs, 'auction.propose_received', {
    rideId,
    from: requesterServiceId,
  });

  const proposal = auctionService.generateProposal({ rideId, origin, destination });

  const replyTs = clock.tick('auction.propose_replied', { rideId });
  res.json({ ...proposal, replyTs: replyTs.ts });
});

module.exports = router;
