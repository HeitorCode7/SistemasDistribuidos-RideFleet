'use strict';

const express          = require('express');
const router           = express.Router();
const { auctionService } = require('../consensus/auction');
const { getClock }     = require('../logical-clock/lamport-clock');
const { structuredLog }= require('../logging/logger');
const config           = require('../../config');


// POST /api/auction/propose
// Recebe solicitação de proposta de outro serviço durante um leilão
router.post('/propose', (req, res) => {
  const { rideId, origin, destination, auctionTs, requesterServiceId } = req.body;

  structuredLog({
    nivel:      'INFO',
    evento:     'PROPOSTA_LEILAO_RECEBIDA',
    corrida_id: rideId || null,
    detalhes:   { parceiro: requesterServiceId, serviceId: config.serviceId },
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