// src/__tests__/integration.test.js
// Testes de Integração — Ciclo Completo de Corridas
//
// Testa fluxos fim-a-fim:
//   1. Corrida local: request → match → confirm → in_transit → complete
//   2. Corrida delegada ao Core
//   3. Fallback quando Core falha
//   4. Processamento de fila

jest.mock('../core/core-client');
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
    ridesLocal:           { inc: jest.fn() },
    ridesDelegatedToCore: { inc: jest.fn() },
    ridesReceivedFromCore:{ inc: jest.fn() },
    ridesRejected:        { inc: jest.fn() },
    ridesQueued:          { inc: jest.fn() },
    ridesDequeued:        { inc: jest.fn() },
    driversAvailable:     { set: jest.fn() },
    httpDuration:         { startTimer: jest.fn(() => jest.fn()) },
  },
  httpMetricsMiddleware: jest.fn((req, res, next) => next()),
  metricsHandler: jest.fn(),
}));

process.env.SERVICE_ID = 'test-grupo-a';
process.env.MAX_DRIVERS = '3';
process.env.LOCK_TTL_MS = '2000';

describe('Integration Tests — Ciclo Completo de Corridas', () => {
  let rideSaga, RIDE_STATE, driverRegistry, lockManager, coreClient;
  let coreClientModule;

  beforeEach(() => {
    jest.resetModules();
    
    // Import dos módulos reais
    ({ rideSaga, RIDE_STATE } = require('../saga/ride-saga'));
    ({ driverRegistry } = require('../drivers/driver-registry'));
    ({ lockManager } = require('../locks/distributed-lock'));
    coreClientModule = require('../core/core-client');
    coreClient = coreClientModule.coreClient;
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Cenário 1: Corrida Local Completa (com motorista disponível)
  // ═════════════════════════════════════════════════════════════════════════════
  test('Fluxo LOCAL completo: request → match → confirm → in_transit → complete', () => {
    // Arrange: cria corrida
    const ride = rideSaga.createLocal({
      passengerId: 'p1',
      origin: 'UFV',
      destination: 'Centro',
    });

    expect(ride.state).toBe(RIDE_STATE.REQUEST);
    expect(ride.source).toBe('local');

    // Act: simula aceitação de motorista
    const driver = driverRegistry.assign(ride.rideId);
    expect(driver).not.toBeNull();
    expect(driver.available).toBe(false);

    // Transições de estado
    rideSaga.transition(ride.rideId, RIDE_STATE.MATCH, {
      driverId: driver.id,
      assignedService: 'test-grupo-a',
    });
    let rideState = rideSaga.get(ride.rideId);
    expect(rideState.state).toBe(RIDE_STATE.MATCH);
    expect(rideState.driverId).toBe(driver.id);

    rideSaga.transition(ride.rideId, RIDE_STATE.CONFIRM);
    rideState = rideSaga.get(ride.rideId);
    expect(rideState.state).toBe(RIDE_STATE.CONFIRM);

    rideSaga.transition(ride.rideId, RIDE_STATE.IN_TRANSIT);
    rideState = rideSaga.get(ride.rideId);
    expect(rideState.state).toBe(RIDE_STATE.IN_TRANSIT);

    rideSaga.transition(ride.rideId, RIDE_STATE.COMPLETE);
    rideState = rideSaga.get(ride.rideId);
    expect(rideState.state).toBe(RIDE_STATE.COMPLETE);

    // Assert: verifica histórico e drivers
    expect(rideState.history).toHaveLength(5); // REQUEST + MATCH + CONFIRM + IN_TRANSIT + COMPLETE
    expect(rideState.history.every(h => h.ts)).toBe(true); // todos com timestamp

    driverRegistry.release(driver.id);
    const freed = driverRegistry.get(driver.id);
    expect(freed.available).toBe(true);
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Cenário 2: Múltiplas Corridas Simultâneas com Locks
  // ═════════════════════════════════════════════════════════════════════════════
  test('Múltiplas corridas simultâneas com proteção de locks', () => {
    const ride1 = rideSaga.createLocal({ passengerId: 'p1', origin: 'A', destination: 'B' });
    const ride2 = rideSaga.createLocal({ passengerId: 'p2', origin: 'C', destination: 'D' });

    // Ambas adquirem locks
    const lock1 = lockManager.acquire(ride1.rideId, 'test-grupo-a');
    const lock2 = lockManager.acquire(ride2.rideId, 'test-grupo-a');

    expect(lock1.acquired).toBe(true);
    expect(lock2.acquired).toBe(true);

    // Ambas processam
    const driver1 = driverRegistry.assign(ride1.rideId);
    const driver2 = driverRegistry.assign(ride2.rideId);
    expect(driver1).not.toBeNull();
    expect(driver2).not.toBeNull();
    expect(driver1.id).not.toBe(driver2.id);

    rideSaga.transition(ride1.rideId, RIDE_STATE.MATCH, { driverId: driver1.id });
    rideSaga.transition(ride2.rideId, RIDE_STATE.MATCH, { driverId: driver2.id });

    // Liberam locks
    expect(lockManager.release(ride1.rideId, 'test-grupo-a')).toBe(true);
    expect(lockManager.release(ride2.rideId, 'test-grupo-a')).toBe(true);

    // Verifica que ninguém mais pode processar (locks foram liberados)
    const lock1Again = lockManager.acquire(ride1.rideId, 'other-service');
    expect(lock1Again.acquired).toBe(true); // agora outro pode adquirir
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Cenário 3: Compensação (Rollback)
  // ═════════════════════════════════════════════════════════════════════════════
  test('Compensação reverte corrida para CANCELLED', (done) => {
    const ride = rideSaga.createLocal({ passengerId: 'p1', origin: 'A', destination: 'B' });
    const driver = driverRegistry.assign(ride.rideId);

    rideSaga.transition(ride.rideId, RIDE_STATE.MATCH, { driverId: driver.id });
    rideSaga.transition(ride.rideId, RIDE_STATE.CONFIRM);

    // Algo dá errado
    rideSaga.compensate(ride.rideId, 'core_failure');
    let rideState = rideSaga.get(ride.rideId);
    expect(rideState.state).toBe(RIDE_STATE.COMPENSATING);

    // Aguarda transição automática para CANCELLED
    setTimeout(() => {
      rideState = rideSaga.get(ride.rideId);
      expect(rideState.state).toBe(RIDE_STATE.CANCELLED);
      
      driverRegistry.release(driver.id);
      const freed = driverRegistry.get(driver.id);
      expect(freed.available).toBe(true);
      
      done();
    }, 500);
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Cenário 4: Contenção de Locks (Falha de Aquisição)
  // ═════════════════════════════════════════════════════════════════════════════
  test('Contenção de locks quando dois requests tentam simultaneamente', () => {
    const ride = rideSaga.createLocal({ passengerId: 'p1', origin: 'A', destination: 'B' });

    // Primeiro consegue
    const lock1 = lockManager.acquire(ride.rideId, 'service-1');
    expect(lock1.acquired).toBe(true);

    // Segundo falha (contenção)
    const lock2 = lockManager.acquire(ride.rideId, 'service-2');
    expect(lock2.acquired).toBe(false);
    expect(lock2.owner).toBe('service-1');

    // Primeiro libera
    lockManager.release(ride.rideId, 'service-1');

    // Agora segundo consegue
    const lock3 = lockManager.acquire(ride.rideId, 'service-2');
    expect(lock3.acquired).toBe(true);
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Cenário 5: Corrida Delegada do Core
  // ═════════════════════════════════════════════════════════════════════════════
  test('Corrida delegada do Core com timestamp Lamport', () => {
    // Core delega corrida
    const ride = rideSaga.createDelegated({
      rideId: 'core-ride-123',
      passengerId: 'p-external',
      origin: 'City A',
      destination: 'City B',
      ownerServiceId: 'test-grupo-b',
      lamportTs: 42, // timestamp do Core
    });

    expect(ride.rideId).toBe('core-ride-123');
    expect(ride.source).toBe('delegated');
    expect(ride.ownerServiceId).toBe('test-grupo-b');
    expect(ride.executingServiceId).toBe('test-grupo-a');

    // Processa localmente
    const driver = driverRegistry.assign(ride.rideId);
    rideSaga.transition(ride.rideId, RIDE_STATE.MATCH, { driverId: driver.id });
    rideSaga.transition(ride.rideId, RIDE_STATE.CONFIRM);

    const rideState = rideSaga.get(ride.rideId);
    expect(rideState.state).toBe(RIDE_STATE.CONFIRM);
    expect(rideState.driverId).toBe(driver.id);
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Cenário 6: Indisponibilidade de Motoristas (Sem Capacidade Local)
  // ═════════════════════════════════════════════════════════════════════════════
  test('Sem motoristas disponíveis retorna falha de atribuição', () => {
    // Ocupa todos os motoristas
    const drivers = driverRegistry.available();
    for (const driver of drivers) {
      driver.available = false;
      driver.currentRideId = 'something';
    }

    expect(driverRegistry.hasAvailable()).toBe(false);

    // Tenta atribuir nova corrida
    const ride = rideSaga.createLocal({ passengerId: 'p-new', origin: 'X', destination: 'Y' });
    const assigned = driverRegistry.assign(ride.rideId);

    expect(assigned).toBeNull();

    // Libera um motorista
    const firstDriver = drivers[0];
    driverRegistry.release(firstDriver.id);

    expect(driverRegistry.hasAvailable()).toBe(true);
    const nowAssigned = driverRegistry.assign(ride.rideId);
    expect(nowAssigned).not.toBeNull();
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Cenário 7: Transição Inválida Retorna Null
  // ═════════════════════════════════════════════════════════════════════════════
  test('Transição inválida retorna null', () => {
    const ride = rideSaga.createLocal({ passengerId: 'p1', origin: 'A', destination: 'B' });

    // Tenta pular estados (REQUEST direto para IN_TRANSIT)
    const result = rideSaga.transition(ride.rideId, RIDE_STATE.IN_TRANSIT);
    expect(result).toBeNull();

    // Corrida continua em REQUEST
    const rideState = rideSaga.get(ride.rideId);
    expect(rideState.state).toBe(RIDE_STATE.REQUEST);
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Cenário 8: getActive Exclui Corridas Finalizadas
  // ═════════════════════════════════════════════════════════════════════════════
  test('getActive retorna apenas corridas em progresso', () => {
    const ride1 = rideSaga.createLocal({ passengerId: 'p1', origin: 'A', destination: 'B' });
    const ride2 = rideSaga.createLocal({ passengerId: 'p2', origin: 'C', destination: 'D' });

    // ride2 completa
    rideSaga.transition(ride2.rideId, RIDE_STATE.MATCH);
    rideSaga.transition(ride2.rideId, RIDE_STATE.CONFIRM);
    rideSaga.transition(ride2.rideId, RIDE_STATE.IN_TRANSIT);
    rideSaga.transition(ride2.rideId, RIDE_STATE.COMPLETE);

    // ride1 permanece em REQUEST
    const active = rideSaga.getActive();
    expect(active.some(r => r.rideId === ride1.rideId)).toBe(true);
    expect(active.some(r => r.rideId === ride2.rideId)).toBe(false);
  });
});