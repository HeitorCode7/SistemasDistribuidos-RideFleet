// src/saga/ride-saga.js
// Req 2 — Commit Distribuído / Saga Pattern

const { v4: uuidv4 } = require('uuid');
const { getClock } = require('../logical-clock/lamport-clock');
const { metrics } = require('../middleware/metrics');
const config = require('../../config');

const RIDE_STATE = {
  REQUEST:      'request',
  MATCH:        'match',
  CONFIRM:      'confirm',
  IN_TRANSIT:   'in_transit',
  COMPLETE:     'complete',
  CANCELLED:    'cancelled',
  COMPENSATING: 'compensating',
};

const TERMINAL_STATES = new Set([
  RIDE_STATE.COMPLETE,
  RIDE_STATE.CANCELLED,
]);

class RideSaga {
  constructor() {
    this._rides = new Map();
  }

  /** Cria nova corrida originada localmente */
  createLocal({ passengerId, origin, destination }) {
    return this._createRide({ passengerId, origin, destination, source: 'local' });
  }

  /**
   * Cria corrida recebida por delegação de outro serviço.
   * Preserva o rideId original e registra metadados de causalidade.
   */
  createDelegated({ rideId, passengerId, origin, destination, ownerServiceId, lamportTs }) {
    const clock = getClock(config.serviceId);
    clock.receive(lamportTs || 0, 'ride.delegation_received', { rideId });

    const event = clock.tick('ride.delegated_created', { rideId });

    const ride = {
      rideId,
      passengerId,
      origin,
      destination,
      source:             'delegated',
      ownerServiceId,
      executingServiceId: config.serviceId,
      assignedService:    null,
      driverId:           null,
      state:              RIDE_STATE.REQUEST,
      history: [
        { state: RIDE_STATE.REQUEST, ts: event.ts, at: Date.now() },
      ],
    };

    this._rides.set(rideId, ride);
    metrics.rideStateTransitions.inc({ state: RIDE_STATE.REQUEST });
    return ride;
  }

  /** Cria corrida genérica (compatibilidade com routes/rides.js) */
  create({ passengerId, origin, destination, serviceId }) {
    return this._createRide({
      passengerId,
      origin,
      destination,
      source: 'local',
      ownerService: serviceId || config.serviceId,
    });
  }

  /** Retorna corridas que ainda não terminaram */
  getActive() {
    return Array.from(this._rides.values()).filter(
      (r) => !TERMINAL_STATES.has(r.state)
    );
  }

  /** Transição de estado com log causal */
transition(rideId, newState, extra = {}) {
  const ride = this._rides.get(rideId);

  if (!ride) return null;

  const allowed = this._allowedTransitions(ride.state);

  if (!allowed.includes(newState)) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        `[SAGA] Transição inválida: ${ride.state} -> ${newState}`
      );
    }

    return null;
  }

  const clock = getClock(config.serviceId);

  const event = clock.tick(`ride.${newState}`, {
    rideId,
    ...extra,
  });

  ride.state = newState;

  Object.assign(ride, extra);

  ride.history.push({
    state: newState,
    ts: event.ts,
    at: Date.now(),
    ...extra,
  });

  metrics.rideStateTransitions.inc({
    state: newState,
  });

  return ride;
}

  compensate(rideId, reason) {
    const ride = this._rides.get(rideId);
    if (!ride) return null;

    const clock = getClock(config.serviceId);
    const event = clock.tick('ride.compensating', { rideId, reason });

    ride.state = RIDE_STATE.COMPENSATING;
    ride.history.push({
      state: RIDE_STATE.COMPENSATING,
      ts: event.ts,
      at: Date.now(),
      reason,
    });

    setTimeout(() => {
      if (this._rides.has(rideId)) {
        this.transition(rideId, RIDE_STATE.CANCELLED, { reason });
      }
    }, 500);

    metrics.sagaCompensations.inc({ reason });
    return ride;
  }

  get(rideId) {
    return this._rides.get(rideId) || null;
  }

  getAll() {
    return Array.from(this._rides.values());
  }

  // ── Interno ──────────────────────────────────────────────────────────────

  _createRide({ passengerId, origin, destination, source, ownerService }) {
    const clock = getClock(config.serviceId);
    const rideId = uuidv4();
    const event = clock.tick('ride.created', { rideId, passengerId });

    const ride = {
      rideId,
      passengerId,
      origin,
      destination,
      source:          source || 'local',
      ownerService:    ownerService || config.serviceId,
      assignedService: null,
      driverId:        null,
      state:           RIDE_STATE.REQUEST,
      history: [
        { state: RIDE_STATE.REQUEST, ts: event.ts, at: Date.now() },
      ],
    };

    this._rides.set(rideId, ride);
    metrics.rideStateTransitions.inc({ state: RIDE_STATE.REQUEST });
    console.log(`[SAGA] Corrida criada: ${rideId} source=${source} ts=${event.ts}`);
    return ride;
  }

  _allowedTransitions(currentState) {
    const map = {
      [RIDE_STATE.REQUEST]:      [RIDE_STATE.MATCH, RIDE_STATE.CANCELLED, RIDE_STATE.COMPENSATING],
      [RIDE_STATE.MATCH]:        [RIDE_STATE.CONFIRM, RIDE_STATE.CANCELLED, RIDE_STATE.COMPENSATING],
      [RIDE_STATE.CONFIRM]:      [RIDE_STATE.IN_TRANSIT, RIDE_STATE.CANCELLED, RIDE_STATE.COMPENSATING],
      [RIDE_STATE.IN_TRANSIT]:   [RIDE_STATE.COMPLETE, RIDE_STATE.COMPENSATING],
      [RIDE_STATE.COMPLETE]:     [],
      [RIDE_STATE.CANCELLED]:    [],
      [RIDE_STATE.COMPENSATING]: [RIDE_STATE.CANCELLED],
    };
    return map[currentState] || [];
  }
}

const rideSaga = new RideSaga();
module.exports = { rideSaga, RideSaga, RIDE_STATE };
