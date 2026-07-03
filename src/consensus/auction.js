const axios = require('axios');
const express = require('express');
const { registry: cbRegistry } = require('../circuit-breaker/circuit-breaker');
const { getClock } = require('../logical-clock/lamport-clock');
const { metrics } = require('../middleware/metrics');
const { rideSaga, RIDE_STATE } = require('../saga/ride-saga');
const { coreClient } = require('../core/core-client');
const driverRegistry = require('../drivers/driverRegistry');
const driverService = require('../drivers/driverService');
const config = require('../../config');

class AuctionService {
  async runAuction(ride) {
    const clock = getClock(config.serviceId);
    const auctionTs = clock.tick('auction.started', { rideId: ride.rideId });

    console.log(`[AUCTION] Iniciando leilao para ride=${ride.rideId} ts=${auctionTs.ts}`);

    const proposals = await this._collectProposals(ride, auctionTs.ts);

    if (proposals.length === 0) {
      console.log(`[AUCTION] Nenhuma proposta recebida para ride=${ride.rideId}`);
      metrics.auctionsNoWinner.inc();
      return null;
    }

    const winner = this._selectWinner(proposals);

    clock.tick('auction.winner', {
      rideId: ride.rideId,
      winner: winner.serviceId,
    });

    console.log(
      `[AUCTION] Vencedor: ${winner.serviceId} ETA=${winner.eta}min preco=R$${winner.price}`
    );

    metrics.auctionsCompleted.inc({ winner: winner.serviceId });

    return winner;
  }

  async _collectProposals(ride, auctionTs) {
    const timeout = config.auctionTimeoutMs;

    const requests = config.partners.map(partner =>
      this._requestProposal(partner, ride, auctionTs, timeout)
    );

    const results = await Promise.allSettled(requests);
    const proposals = [];

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        proposals.push(result.value);

        console.log(
          `[AUCTION] Proposta de ${result.value.serviceId}: ETA=${result.value.eta} preco=${result.value.price}`
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

      if (!proposal || proposal.serviceId !== partner.id) return null;

      return proposal;
    } catch (err) {
      console.warn(`[AUCTION] Parceiro ${partner.id} nao respondeu: ${err.message}`);
      return null;
    }
  }

  _selectWinner(proposals) {
    return proposals.sort((a, b) => {
      if (a.eta !== b.eta) return a.eta - b.eta;
      if (a.price !== b.price) return a.price - b.price;
      return a.serviceId.localeCompare(b.serviceId);
    })[0];
  }

  async generateProposal(ride) {
    const activeRides = rideSaga
      .getAll()
      .filter(r => ['match', 'confirm', 'in_transit'].includes(r.state));

    const availableDrivers = await driverRegistry.available();
    const estimatedEta = 180 + activeRides.length * 120;
    const estimatedPrice = parseFloat((Math.random() * 5).toFixed(2));
    const logicalTimestamp = getClock(config.serviceId)
      .tick('auction.proposal_generated', {
        rideId: ride.rideUuid || ride.rideId,
      }).ts;

    return {
      estimatedEta,
      estimatedPrice,
      logicalTimestamp,
      availableDrivers: availableDrivers.length,
    };
  }
}

const router = express.Router();
const auctionService = new AuctionService();

router.post('/rides/incoming', async (req, res) => {
  try {
    const ride = req.body;

    console.log(`[INCOMING] Leilao recebido ride=${ride.rideUuid || ride.rideId}`);

    const proposal = await auctionService.generateProposal(ride);

    return res.status(200).json(proposal);
  } catch (err) {
    console.error('[INCOMING] erro ao gerar proposta:', err.message);
    return res.status(500).json({ error: 'failed to generate proposal' });
  }
});

router.post('/rides/:rideUuid/assigned', async (req, res) => {
  try {
    const { rideUuid } = req.params;
    const assignment = req.body;
    const rideId = assignment.rideUuid || rideUuid;

    console.log(`[CORE] Corrida atribuida pelo Core: ${rideId}`);

    let ride = rideSaga.get(rideId);

    if (!ride) {
      ride = rideSaga.createDelegated({
        rideId,
        passengerId: assignment.passengerId,
        origin: assignment.origin,
        destination: assignment.destination,
        ownerServiceId: assignment.originServiceId || 'core',
        lamportTs: assignment.logicalTimestamp || Date.now(),
      });
    }

    if (ride.state === RIDE_STATE.REQUEST) {
      const driver = await driverService.assignDriver(rideId);

      if (!driver) {
        console.warn(`[CORE] Corrida ${rideId} recusada: nenhum motorista disponivel`);
        return res.status(409).json({
          accepted: false,
          serviceId: config.serviceId,
          error: 'no_available_drivers',
        });
      }

      rideSaga.transition(rideId, RIDE_STATE.MATCH, {
        assignedService: config.serviceId,
        driverId: driver.id,
        lockExpiresAt: assignment.lockExpiresAt,
      });
    }

    metrics.ridesReceivedFromCore.inc();

    if (typeof global.wsBroadcast === 'function') {
      global.wsBroadcast('ride.assigned', rideSaga.get(rideId));
    }

    scheduleCoreStatusPipeline(rideId);

    return res.status(200).json({
      accepted: true,
      serviceId: config.serviceId,
      ride: rideSaga.get(rideId),
    });
  } catch (err) {
    console.error('[CORE ASSIGNED] erro ao aceitar corrida:', err.message);
    return res.status(500).json({
      error: 'failed to accept assigned ride',
      detail: err.message,
    });
  }
});

const CORE_STATUS_PIPELINE = [
  RIDE_STATE.CONFIRM,
  RIDE_STATE.IN_TRANSIT,
  RIDE_STATE.COMPLETE,
];

const activeCorePipelines = new Set();

function scheduleCoreStatusPipeline(rideId) {
  if (activeCorePipelines.has(rideId)) return;

  activeCorePipelines.add(rideId);
  runCoreStatusPipeline(rideId)
    .catch(err => {
      console.error(
        `[CORE] Pipeline da corrida ${rideId} falhou:`,
        err.response?.data || err.message
      );
    })
    .finally(() => activeCorePipelines.delete(rideId));
}

async function runCoreStatusPipeline(rideId) {
  const stepMs = parseInt(process.env.QUEUE_STEP_MS || '9000', 10);

  for (const state of CORE_STATUS_PIPELINE) {
    await delay(stepMs);

    const ride = rideSaga.get(rideId);
    if (!ride) return;

    if (isPastState(ride.state, state)) {
      continue;
    }

    await coreClient.adquirirLock(rideId, 60);

    const ts = getClock(config.serviceId)
      .tick(`core.status.${state}`, { rideId }).ts;

    await coreClient.atualizarStatus(rideId, state, ts);

    const current = rideSaga.get(rideId);
    const transitioned = current?.state === state
      ? current
      : rideSaga.transition(rideId, state);

    if (!transitioned) {
      throw new Error(`Estado local nao avancou para ${state} na corrida ${rideId}`);
    }

    if (typeof global.wsBroadcast === 'function') {
      global.wsBroadcast('ride.status.changed', {
        rideId,
        state,
      });
    }

    if (state === RIDE_STATE.COMPLETE && transitioned.driverId) {
      await driverService.releaseDriver(transitioned.driverId);
    }
  }
}

function isPastState(currentState, targetState) {
  const currentIndex = CORE_STATUS_PIPELINE.indexOf(currentState);
  const targetIndex = CORE_STATUS_PIPELINE.indexOf(targetState);

  return currentIndex !== -1 && targetIndex !== -1 && currentIndex >= targetIndex;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
module.exports = {
  auctionService,
  auctionRouter: router,
};
