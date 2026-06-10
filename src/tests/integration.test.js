'use strict';

// mocks estáveis
jest.mock('../core/core-client');
jest.mock('../middleware/metrics', () => ({
  metrics: {
    locksAcquired: { inc: jest.fn() },
    locksReleased: { inc: jest.fn() },
    locksExpired: { inc: jest.fn() },
    lockContentions: { inc: jest.fn() },
    rideStateTransitions: { inc: jest.fn() },
    sagaCompensations: { inc: jest.fn() },
    cbFailures: { inc: jest.fn() },
    cbStateChange: { inc: jest.fn() },
    ridesLocal: { inc: jest.fn() },
    ridesDelegatedToCore: { inc: jest.fn() },
    ridesReceivedFromCore: { inc: jest.fn() },
    ridesRejected: { inc: jest.fn() },
    ridesQueued: { inc: jest.fn() },
    ridesDequeued: { inc: jest.fn() },
    driversAvailable: { set: jest.fn() },
    httpDuration: { startTimer: jest.fn(() => jest.fn()) },
  },
  httpMetricsMiddleware: jest.fn((req, res, next) => next()),
  metricsHandler: jest.fn(),
}));

process.env.SERVICE_ID = 'test-grupo-a';
process.env.MAX_DRIVERS = '3';
process.env.LOCK_TTL_MS = '2000';

describe('Integration Tests — Ciclo Completo de Corridas', () => {

  let rideSaga;
  let RIDE_STATE;
  let driverService;
  let driverRegistry;
  let lockManager;
  let coreClient;

  beforeEach(async () => {

    jest.resetModules();

    const sagaModule = require('../saga/ride-saga');
    rideSaga = sagaModule.rideSaga;
    RIDE_STATE = sagaModule.RIDE_STATE;

    const driverModule = require('../drivers/driverService');
    driverService = driverModule;

    const registryModule = require('../drivers/driverRegistry');
    driverRegistry = registryModule;

    await driverService.reset();

    if (driverRegistry.reset) {
      await driverRegistry.reset();
    }

    // recria motoristas após reset
    if (driverRegistry.register) {

      await driverRegistry.register({
        id: 'driver-1',
        name: 'João',
        available: true,
        online: true,
      });

      await driverRegistry.register({
        id: 'driver-2',
        name: 'Maria',
        available: true,
        online: true,
      });

      await driverRegistry.register({
        id: 'driver-3',
        name: 'Carlos',
        available: true,
        online: true,
      });

    } else if (driverRegistry.addDriver) {

      await driverRegistry.addDriver({
        id: 'driver-1',
        name: 'João',
        available: true,
        online: true,
      });

      await driverRegistry.addDriver({
        id: 'driver-2',
        name: 'Maria',
        available: true,
        online: true,
      });

      await driverRegistry.addDriver({
        id: 'driver-3',
        name: 'Carlos',
        available: true,
        online: true,
      });

    }

    const { DistributedLockManager } = require('../locks/distributed-lock');

    lockManager = new DistributedLockManager(2000);

    const coreModule = require('../core/core-client');
    coreClient = coreModule.coreClient;

  });

  afterEach(() => {

    if (lockManager?.cleanup) {
      lockManager.cleanup();
    }

    if (lockManager?.stop) {
      lockManager.stop();
    }

  });

  test('Fluxo LOCAL completo: request → match → confirm → in_transit → complete', async () => {

    const ride = rideSaga.createLocal({
      passengerId: 'p1',
      origin: 'UFV',
      destination: 'Centro',
    });

    const driver = await driverService.assignDriver(ride.rideId);

    expect(driver).not.toBeNull();

    rideSaga.transition(ride.rideId, RIDE_STATE.MATCH, {
      driverId: driver.id,
    });

    rideSaga.transition(ride.rideId, RIDE_STATE.CONFIRM);

    rideSaga.transition(ride.rideId, RIDE_STATE.IN_TRANSIT);

    rideSaga.transition(ride.rideId, RIDE_STATE.COMPLETE);

    expect(
      rideSaga.get(ride.rideId).state
    ).toBe(RIDE_STATE.COMPLETE);

  });

  test('Múltiplas corridas simultâneas com proteção de locks', async () => {

    const r1 = rideSaga.createLocal({
      passengerId: 'p1',
      origin: 'A',
      destination: 'B'
    });

    const r2 = rideSaga.createLocal({
      passengerId: 'p2',
      origin: 'C',
      destination: 'D'
    });

    const l1 = lockManager.acquire(r1.rideId, 'a');
    const l2 = lockManager.acquire(r2.rideId, 'a');

    expect(l1.acquired).toBe(true);
    expect(l2.acquired).toBe(true);

    const d1 = await driverService.assignDriver(r1.rideId);
    const d2 = await driverService.assignDriver(r2.rideId);

    expect(d1).not.toBeNull();
    expect(d2).not.toBeNull();

    expect(d1.id).not.toBe(d2.id);

  });

  test('Compensação reverte corrida para CANCELLED', async () => {

    const ride = rideSaga.createLocal({
      passengerId: 'p1',
      origin: 'A',
      destination: 'B'
    });

    const driver = await driverService.assignDriver(ride.rideId);

    expect(driver).not.toBeNull();

    rideSaga.transition(ride.rideId, RIDE_STATE.MATCH, {
      driverId: driver.id
    });

    rideSaga.compensate(ride.rideId, 'core_failure');

    await new Promise(r => setTimeout(r, 600));

    expect(
      rideSaga.get(ride.rideId).state
    ).toBe(RIDE_STATE.CANCELLED);

  });

  test('Contenção de locks', () => {

    const ride = rideSaga.createLocal({
      passengerId: 'p1',
      origin: 'A',
      destination: 'B'
    });

    const a = lockManager.acquire(ride.rideId, 's1');
    const b = lockManager.acquire(ride.rideId, 's2');

    expect(a.acquired).toBe(true);
    expect(b.acquired).toBe(false);

  });

  test('Sem motoristas disponíveis retorna falha', async () => {

    const drivers = await driverRegistry.available();

    for (const d of drivers) {
      await driverRegistry.setAvailability(d.id, false);
    }

    const ride = rideSaga.createLocal({
      passengerId: 'p-x',
      origin: 'A',
      destination: 'B'
    });

    const assigned = await driverService.assignDriver(ride.rideId);

    expect(assigned).toBeNull();

  });

});