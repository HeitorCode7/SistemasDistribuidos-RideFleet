// src/consensus/auction.js
// Req 3 — Consenso / Leilão de Corrida
//
// Quando o serviço está congestionado, faz broadcast para parceiros,
// coleta propostas (ETA + preço) e escolhe o vencedor de forma determinística.

const axios = require('axios');
const { registry: cbRegistry } = require('../circuit-breaker/circuit-breaker');
const { getClock } = require('../logical-clock/lamport-clock');
const { metrics } = require('../middleware/metrics');
const config = require('../../config');

class AuctionService {
  /**
   * Realiza o leilão de uma corrida entre os parceiros disponíveis.
   * @param {object} ride - dados da corrida
   * @returns {object|null} parceiro vencedor ou null se nenhum disponível
   */
  async runAuction(ride) {
    const clock = getClock(config.serviceId);
    const auctionTs = clock.tick('auction.started', { rideId: ride.rideId });

    console.log(`[AUCTION] Iniciando leilão para ride=${ride.rideId} ts=${auctionTs.ts}`);

    const proposals = await this._collectProposals(ride, auctionTs.ts);

    if (proposals.length === 0) {
      console.log(`[AUCTION] Nenhuma proposta recebida para ride=${ride.rideId}`);
      metrics.auctionsNoWinner.inc();
      return null;
    }

    const winner = this._selectWinner(proposals);
    clock.tick('auction.winner', { rideId: ride.rideId, winner: winner.serviceId });

    console.log(
      `[AUCTION] Vencedor: ${winner.serviceId} ETA=${winner.eta}min preço=R$${winner.price}`
    );
    metrics.auctionsCompleted.inc({ winner: winner.serviceId });

    return winner;
  }

  /** Envia broadcast para todos os parceiros e coleta respostas */
  async _collectProposals(ride, auctionTs) {
    const timeout = config.auctionTimeoutMs;
    const requests = config.partners.map(partner =>
      this._requestProposal(partner, ride, auctionTs, timeout)
    );

    // Usa allSettled para não bloquear em caso de timeout/falha parcial
    const results = await Promise.allSettled(requests);
    const proposals = [];

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        proposals.push(result.value);
        console.log(
          `[AUCTION] Proposta de ${result.value.serviceId}: ETA=${result.value.eta} preço=${result.value.price}`
        );
      }
    }

    return proposals;
  }

  async _requestProposal(partner, ride, auctionTs, timeout) {
    const cb = cbRegistry.get(partner.id);

    try {
      const response = await cb.call(() =>
        axios.post(
          `${partner.url}/api/auction/propose`,
          {
            rideId: ride.rideId,
            origin: ride.origin,
            destination: ride.destination,
            auctionTs,
            requesterServiceId: config.serviceId,
          },
          { timeout }
        )
      );

      const proposal = response.data;
      // Proteção contra propostas duplicadas/atrasadas
      if (!proposal || !proposal.serviceId || proposal.serviceId !== partner.id) return null;

      return proposal;
    } catch (err) {
      console.warn(`[AUCTION] Parceiro ${partner.id} não respondeu: ${err.message}`);
      return null;
    }
  }

  /**
   * Critério de seleção determinístico:
   * 1. Menor ETA
   * 2. Em empate: menor preço
   * 3. Em empate: menor serviceId (lexicográfico) — desempate reproduzível
   */
  _selectWinner(proposals) {
    return proposals.sort((a, b) => {
      if (a.eta !== b.eta) return a.eta - b.eta;
      if (a.price !== b.price) return a.price - b.price;
      return a.serviceId.localeCompare(b.serviceId);
    })[0];
  }

  /**
   * Gera proposta local para um leilão recebido de outro serviço.
   */
  generateProposal(ride) {
    const activeRides = require('../saga/ride-saga').rideSaga
      .getAll()
      .filter(r => ['match', 'confirm', 'in_transit'].includes(r.state));

    // ETA baseado na carga local (simplificado)
    const eta = 3 + activeRides.length * 2; // minutos
    const price = parseFloat((5 + Math.random() * 10).toFixed(2));

    return {
      serviceId: config.serviceId,
      eta,
      price,
      availableDrivers: Math.max(0, config.maxLocalRides - activeRides.length),
    };
  }
}

const auctionService = new AuctionService();
module.exports = { auctionService };
