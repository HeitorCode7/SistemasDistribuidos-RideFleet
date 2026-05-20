// src/tests/mechanisms.test.js
// Testes dos mecanismos distribuídos

jest.mock('../middleware/metrics', () => ({
  metrics: {
    locksAcquired:        { inc: jest.fn() },
    locksReleased:        { inc: jest.fn() },
    locksExpired:         { inc: jest.fn() },
    lockContentions:      { inc: jest.fn() },

    rideStateTransitions: { inc: jest.fn() },
    sagaCompensations:    { inc: jest.fn() },

    cbFailures:           { inc: jest.fn() },
    cbStateChange:        { inc: jest.fn() },

    auctionsCompleted:    { inc: jest.fn() },
    auctionsNoWinner:     { inc: jest.fn() },

    ridesLocal:           { inc: jest.fn() },
    ridesDelegated:       { inc: jest.fn() },
    ridesDelegatedToCore: { inc: jest.fn() },
    ridesReceivedFromCore:{ inc: jest.fn() },
    ridesRejected:        { inc: jest.fn() },
    ridesQueued:          { inc: jest.fn() },
    ridesDequeued:        { inc: jest.fn() },

    driversAvailable:     { set: jest.fn() },

    httpRequestDuration:  {
      startTimer: jest.fn(() => jest.fn()),
    },

    httpDuration:  {
      startTimer: jest.fn(() => jest.fn()),
    },
  },

  httpMetricsMiddleware: jest.fn((req, res, next) => next()),
  metricsHandler: jest.fn(),
}));

process.env.SERVICE_ID = 'test-service';
process.env.LOCK_TTL_MS = '500';

//
// ─────────────────────────────────────────────────────────────
// REQ 1 — Distributed Lock
// ─────────────────────────────────────────────────────────────
//

describe('Req 1 — Distributed Lock', () => {
  let DistributedLockManager;

  beforeEach(() => {
    jest.resetModules();

    ({ DistributedLockManager } =
      require('../locks/distributed-lock'));
  });

  test('adquire lock com sucesso quando livre', () => {
    const mgr = new DistributedLockManager(1000);

    const result =
      mgr.acquire('ride-1', 'service-a');

    expect(result.acquired).toBe(true);
    expect(result.owner).toBe('service-a');
  });

  test('bloqueia segundo solicitante (contenção)', () => {
    const mgr = new DistributedLockManager(1000);

    mgr.acquire('ride-1', 'service-a');

    const result =
      mgr.acquire('ride-1', 'service-b');

    expect(result.acquired).toBe(false);
    expect(result.owner).toBe('service-a');
  });

  test('libera lock corretamente', () => {
    const mgr = new DistributedLockManager(1000);

    mgr.acquire('ride-1', 'service-a');

    const released =
      mgr.release('ride-1', 'service-a');

    expect(released).toBe(true);

    const second =
      mgr.acquire('ride-1', 'service-b');

    expect(second.acquired).toBe(true);
  });

  test('não libera lock de outro dono', () => {
    const mgr = new DistributedLockManager(1000);

    mgr.acquire('ride-1', 'service-a');

    const released =
      mgr.release('ride-1', 'service-b');

    expect(released).toBe(false);
  });

  test('lock expira após TTL', done => {
    const mgr = new DistributedLockManager(100);

    mgr.acquire('ride-ttl', 'service-a');

    setTimeout(() => {
      const result =
        mgr.acquire('ride-ttl', 'service-b');

      expect(result.acquired).toBe(true);

      done();
    }, 200);
  });
});

//
// ─────────────────────────────────────────────────────────────
// REQ 2 — Saga / Commit Distribuído
// ─────────────────────────────────────────────────────────────
//

describe('Req 2 — Saga / Commit Distribuído', () => {
  let RideSaga;
  let RIDE_STATE;

  beforeEach(() => {
    jest.resetModules();

    ({ RideSaga, RIDE_STATE } =
      require('../saga/ride-saga'));
  });

  test('cria corrida no estado REQUEST', () => {
    const saga = new RideSaga();

    const ride = saga.create({
      passengerId: 'p1',
      origin: 'A',
      destination: 'B',
    });

    expect(ride.state).toBe(RIDE_STATE.REQUEST);
    expect(ride.rideId).toBeDefined();
  });

  test('transição válida REQUEST -> MATCH', () => {
    const saga = new RideSaga();

    const ride = saga.create({
      passengerId: 'p1',
      origin: 'A',
      destination: 'B',
    });

    const updated =
      saga.transition(
        ride.rideId,
        RIDE_STATE.MATCH
      );

    expect(updated.state).toBe(RIDE_STATE.MATCH);
  });

  test('transição inválida é rejeitada', () => {
    const saga = new RideSaga();

    const ride = saga.create({
      passengerId: 'p1',
      origin: 'A',
      destination: 'B',
    });

    saga.transition(
      ride.rideId,
      RIDE_STATE.MATCH
    );

    saga.transition(
      ride.rideId,
      RIDE_STATE.CONFIRM
    );

    saga.transition(
      ride.rideId,
      RIDE_STATE.IN_TRANSIT
    );

    saga.transition(
      ride.rideId,
      RIDE_STATE.COMPLETE
    );

    const invalid =
      saga.transition(
        ride.rideId,
        RIDE_STATE.REQUEST
      );

    expect(invalid).toBeNull();
  });

  test('compensação leva ao estado COMPENSATING', () => {
    const saga = new RideSaga();

    const ride = saga.create({
      passengerId: 'p1',
      origin: 'A',
      destination: 'B',
    });

    saga.transition(
      ride.rideId,
      RIDE_STATE.MATCH
    );

    const compensated =
      saga.compensate(
        ride.rideId,
        'partner_failed'
      );

    expect(compensated.state)
      .toBe(RIDE_STATE.COMPENSATING);
  });

  test('histórico registra transições', () => {
    const saga = new RideSaga();

    const ride = saga.create({
      passengerId: 'p1',
      origin: 'A',
      destination: 'B',
    });

    saga.transition(
      ride.rideId,
      RIDE_STATE.MATCH
    );

    saga.transition(
      ride.rideId,
      RIDE_STATE.CONFIRM
    );

    const result =
      saga.get(ride.rideId);

    expect(result.history.length).toBe(3);
  });
});

//
// ─────────────────────────────────────────────────────────────
// REQ 4 — Circuit Breaker
// ─────────────────────────────────────────────────────────────
//

describe('Req 4 — Circuit Breaker', () => {
  let CircuitBreaker;
  let STATE;

  beforeEach(() => {
    jest.resetModules();

    ({ CircuitBreaker, STATE } =
      require('../circuit-breaker/circuit-breaker'));
  });

  test('inicia no estado CLOSED', () => {
    const cb =
      new CircuitBreaker('partner-x', {
        failureThreshold: 3,
      });

    expect(cb.state).toBe(STATE.CLOSED);
  });

  test('abre após atingir threshold de falhas', async () => {
    const cb =
      new CircuitBreaker('partner-x', {
        failureThreshold: 3,
      });

    const failFn = () =>
      Promise.reject(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      try {
        await cb.call(failFn);
      } catch (_) {}
    }

    expect(cb.state).toBe(STATE.OPEN);
  });

  test('bloqueia chamadas quando OPEN', async () => {
    const cb =
      new CircuitBreaker('partner-x', {
        failureThreshold: 1,
      });

    try {
      await cb.call(() =>
        Promise.reject(new Error('fail'))
      );
    } catch (_) {}

    await expect(
      cb.call(() => Promise.resolve('ok'))
    ).rejects.toThrow('CircuitBreaker OPEN');
  });

  test('fecha após sucesso em HALF_OPEN', async () => {
    const cb =
      new CircuitBreaker('partner-x', {
        failureThreshold: 1,
        recoveryTimeoutMs: 50,
      });

    try {
      await cb.call(() =>
        Promise.reject(new Error('fail'))
      );
    } catch (_) {}

    expect(cb.state).toBe(STATE.OPEN);

    await new Promise(resolve =>
      setTimeout(resolve, 100)
    );

    await cb.call(() =>
      Promise.resolve('ok')
    );

    expect(cb.state).toBe(STATE.CLOSED);
  });
});

//
// ─────────────────────────────────────────────────────────────
// REQ 5 — Relógio de Lamport
// ─────────────────────────────────────────────────────────────
//

describe('Req 5 — Relógio de Lamport', () => {
  let LamportClock;

  beforeEach(() => {
    jest.resetModules();

    ({ LamportClock } =
      require('../logical-clock/lamport-clock'));
  });

  test('incrementa a cada evento local', () => {
    const clock =
      new LamportClock('svc-a');

    const e1 =
      clock.tick('event.a');

    const e2 =
      clock.tick('event.b');

    expect(e2.ts).toBeGreaterThan(e1.ts);
  });

  test('aplica regra max+1 ao receber evento externo', () => {
    const clock =
      new LamportClock('svc-a');

    clock.tick('local');

    const received =
      clock.receive(10, 'remote.event');

    expect(received.ts).toBe(11);
  });

  test('relógio remoto maior prevalece', () => {
    const clockA =
      new LamportClock('svc-a');

    const clockB =
      new LamportClock('svc-b');

    clockA.tick('a1');
    clockA.tick('a2');

    clockB.tick('b1');

    const recv =
      clockB.receive(
        clockA.now(),
        'from-a'
      );

    expect(recv.ts).toBe(3);
  });

  test('log causal filtrado por rideId preserva ordem', () => {
    const clock =
      new LamportClock('svc-a');

    clock.tick(
      'ride.created',
      { rideId: 'r1' }
    );

    clock.tick(
      'other.event',
      { rideId: 'r2' }
    );

    clock.tick(
      'ride.matched',
      { rideId: 'r1' }
    );

    const log =
      clock.getCausalLog('r1');

    expect(log.length).toBe(2);

    expect(log[0].ts)
      .toBeLessThan(log[1].ts);
  });
});