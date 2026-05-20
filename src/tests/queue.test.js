// src/tests/queue.test.js
// Testes unitários para RideQueue e OverflowPolicy

jest.mock('../drivers/driverRegistry', () => ({
  driverRegistry: {
    availableCount: jest.fn(() => 5),

    snapshot: jest.fn(() => ({
      total: 10,
      available: 5,
      busy: 5,
    })),
  },
}));

jest.mock('../core/core-client', () => ({
  coreClient: {
    isAvailable: jest.fn(() => true),

    cbSnapshot: jest.fn(() => ({
      state: 'CLOSED',
      failureCount: 0,
    })),
  },
}));

process.env.SERVICE_ID = 'test-service';

// ═════════════════════════════════════════════════════════════════════
// RIDE QUEUE — Testes
// ═════════════════════════════════════════════════════════════════════

describe('Ride Queue — Pool de Corridas', () => {

  let RideQueue;

  beforeEach(() => {
    jest.resetModules();
    ({ RideQueue } = require('../queue/ride-queue'));
  });

  test('cria fila vazia com tamanho máximo', () => {

    const q = new RideQueue(50);

    expect(q.size()).toBe(0);
    expect(q.isEmpty()).toBe(true);
    expect(q.maxSize).toBe(50);

  });

  test('enfileira corrida com sucesso', () => {

    const q = new RideQueue(50);

    const ride = {
      rideId: 'ride-1',
      passengerId: 'p1',
      origin: 'A',
      destination: 'B',
      state: 'request',
    };

    const result = q.enqueue(ride, 'core_unavailable');

    expect(result.queued).toBe(true);
    expect(q.size()).toBe(1);
    expect(result.queueSize).toBe(1);

  });

  test('rejeita enfileiramento quando fila cheia', () => {

    const q = new RideQueue(2);

    const ride1 = {
      rideId: 'ride-1',
      passengerId: 'p1',
      origin: 'A',
      destination: 'B',
      state: 'request',
    };

    const ride2 = {
      rideId: 'ride-2',
      passengerId: 'p2',
      origin: 'A',
      destination: 'B',
      state: 'request',
    };

    const ride3 = {
      rideId: 'ride-3',
      passengerId: 'p3',
      origin: 'A',
      destination: 'B',
      state: 'request',
    };

    q.enqueue(ride1);
    q.enqueue(ride2);

    const result = q.enqueue(ride3);

    expect(result.queued).toBe(false);
    expect(result.reason).toBe('queue_full');
    expect(q.size()).toBe(2);

  });

  test('desenfileira em ordem FIFO', () => {

    const q = new RideQueue(50);

    const ride1 = {
      rideId: 'ride-1',
      passengerId: 'p1',
      origin: 'A',
      destination: 'B',
      state: 'request',
    };

    const ride2 = {
      rideId: 'ride-2',
      passengerId: 'p2',
      origin: 'A',
      destination: 'B',
      state: 'request',
    };

    q.enqueue(ride1);
    q.enqueue(ride2);

    const first = q.dequeue();

    expect(first.rideId).toBe('ride-1');
    expect(q.size()).toBe(1);

    const second = q.dequeue();

    expect(second.rideId).toBe('ride-2');
    expect(q.size()).toBe(0);

  });

  test('peek retorna próxima sem remover', () => {

    const q = new RideQueue(50);

    const ride1 = {
      rideId: 'ride-1',
      passengerId: 'p1',
      origin: 'A',
      destination: 'B',
      state: 'request',
    };

    const ride2 = {
      rideId: 'ride-2',
      passengerId: 'p2',
      origin: 'A',
      destination: 'B',
      state: 'request',
    };

    q.enqueue(ride1);
    q.enqueue(ride2);

    const peeked = q.peek();

    expect(peeked.rideId).toBe('ride-1');
    expect(q.size()).toBe(2);

  });

  test('dequeue retorna null quando vazio', () => {

    const q = new RideQueue(50);

    expect(q.dequeue()).toBeNull();

  });

  test('remove corrida específica por rideId', () => {

    const q = new RideQueue(50);

    const ride1 = {
      rideId: 'ride-1',
      passengerId: 'p1',
      origin: 'A',
      destination: 'B',
      state: 'request',
    };

    const ride2 = {
      rideId: 'ride-2',
      passengerId: 'p2',
      origin: 'A',
      destination: 'B',
      state: 'request',
    };

    q.enqueue(ride1);
    q.enqueue(ride2);

    const removed = q.remove('ride-1');

    expect(removed).toBe(true);
    expect(q.size()).toBe(1);
    expect(q.peek().rideId).toBe('ride-2');

  });

  test('incrementRetryCount incrementa contador de retry', () => {

    const q = new RideQueue(50);

    const ride = {
      rideId: 'ride-1',
      passengerId: 'p1',
      origin: 'A',
      destination: 'B',
      state: 'request',
    };

    q.enqueue(ride);

    const snapshot1 = q.snapshot();

    expect(snapshot1.items[0].retryCount).toBe(0);

    q.incrementRetryCount('ride-1');

    const snapshot2 = q.snapshot();

    expect(snapshot2.items[0].retryCount).toBe(1);

  });

  test('snapshot registra métricas corretas', () => {

    const q = new RideQueue(50);

    const ride1 = {
      rideId: 'ride-1',
      passengerId: 'p1',
      origin: 'A',
      destination: 'B',
      state: 'request',
    };

    const ride2 = {
      rideId: 'ride-2',
      passengerId: 'p2',
      origin: 'A',
      destination: 'B',
      state: 'request',
    };

    q.enqueue(ride1);
    q.enqueue(ride2);

    const s1 = q.snapshot();

    expect(s1.currentSize).toBe(2);
    expect(s1.peakSize).toBe(2);
    expect(s1.totalEnqueued).toBe(2);

    q.dequeue();

    const s2 = q.snapshot();

    expect(s2.currentSize).toBe(1);
    expect(s2.peakSize).toBe(2);
    expect(s2.totalDequeued).toBe(1);

  });

  test('clear esvazia a fila', () => {

    const q = new RideQueue(50);

    const ride = {
      rideId: 'ride-1',
      passengerId: 'p1',
      origin: 'A',
      destination: 'B',
      state: 'request',
    };

    q.enqueue(ride);

    expect(q.size()).toBe(1);

    q.clear();

    expect(q.size()).toBe(0);
    expect(q.isEmpty()).toBe(true);

  });

  test('getAll retorna cópia de todas as corridas', () => {

    const q = new RideQueue(50);

    const ride1 = {
      rideId: 'ride-1',
      passengerId: 'p1',
      origin: 'A',
      destination: 'B',
      state: 'request',
    };

    const ride2 = {
      rideId: 'ride-2',
      passengerId: 'p2',
      origin: 'A',
      destination: 'B',
      state: 'request',
    };

    q.enqueue(ride1);
    q.enqueue(ride2);

    const all = q.getAll();

    expect(all).toHaveLength(2);
    expect(all[0].rideId).toBe('ride-1');
    expect(all[1].rideId).toBe('ride-2');

  });

});

// ═════════════════════════════════════════════════════════════════════
// OVERFLOW POLICY — Testes
// ═════════════════════════════════════════════════════════════════════

describe('Overflow Policy — Decisão de Congestionamento', () => {

  let OverflowPolicy;
  let driverRegistry;
  let coreClient;

  beforeEach(() => {

    jest.resetModules();

    ({ OverflowPolicy } = require('../policy/overflow-policy'));

    ({ driverRegistry } =
      require('../drivers/driverRegistry'));

    ({ coreClient } =
      require('../core/core-client'));

  });

  test('retorna local quando há motoristas disponíveis', () => {

    driverRegistry.availableCount.mockReturnValue(3);

    driverRegistry.snapshot.mockReturnValue({
      total: 10,
      available: 3,
      busy: 7,
    });

    coreClient.isAvailable.mockReturnValue(true);

    const policy = new OverflowPolicy();

    const decision = policy.getDecision(
      {},
      { isFull: false }
    );

    expect(decision).toBe('local');

  });

  test('retorna delegate quando Core está disponível e há congestionamento', () => {

    driverRegistry.availableCount.mockReturnValue(1);

    driverRegistry.snapshot.mockReturnValue({
      total: 10,
      available: 1,
      busy: 9,
    });

    coreClient.isAvailable.mockReturnValue(true);

    const policy = new OverflowPolicy({
      minAvailablePercentageForLocal: 20,
      minDriversForLocal: 2,
    });

    const decision = policy.getDecision(
      {},
      { isFull: false }
    );

    expect(decision).toBe('delegate');

  });

  test('retorna queue quando Core está indisponível', () => {

    driverRegistry.availableCount.mockReturnValue(1);

    driverRegistry.snapshot.mockReturnValue({
      total: 10,
      available: 1,
      busy: 9,
    });

    coreClient.isAvailable.mockReturnValue(false);

    const policy = new OverflowPolicy({
      minDriversForLocal: 2,
    });

    const decision = policy.getDecision(
      {},
      { isFull: false }
    );

    expect(decision).toBe('queue');

  });

  test('retorna reject quando fila está cheia', () => {

    const policy = new OverflowPolicy();

    const decision = policy.getDecision(
      {},
      { isFull: true }
    );

    expect(decision).toBe('reject');

  });

  test('isOverloaded retorna true quando congestionado', () => {

    driverRegistry.availableCount.mockReturnValue(1);

    driverRegistry.snapshot.mockReturnValue({
      total: 10,
      available: 1,
      busy: 9,
    });

    coreClient.isAvailable.mockReturnValue(false);

    const policy = new OverflowPolicy();

    const overloaded = policy.isOverloaded();

    expect(overloaded).toBe(true);

  });

  test('isOverloaded retorna false quando há capacidade', () => {

    driverRegistry.availableCount.mockReturnValue(5);

    driverRegistry.snapshot.mockReturnValue({
      total: 10,
      available: 5,
      busy: 5,
    });

    coreClient.isAvailable.mockReturnValue(true);

    const policy = new OverflowPolicy();

    const overloaded = policy.isOverloaded();

    expect(overloaded).toBe(false);

  });

  test('canAcceptLocal retorna true com motoristas disponíveis', () => {

    driverRegistry.availableCount.mockReturnValue(2);

    driverRegistry.snapshot.mockReturnValue({
      total: 10,
      available: 2,
      busy: 8,
    });

    const policy = new OverflowPolicy();

    const result = policy.canAcceptLocal();

    expect(result).toBe(true);

  });

  test('canAcceptLocal retorna false sem motoristas', () => {

    driverRegistry.availableCount.mockReturnValue(0);

    driverRegistry.snapshot.mockReturnValue({
      total: 10,
      available: 0,
      busy: 10,
    });

    const policy = new OverflowPolicy();

    const result = policy.canAcceptLocal();

    expect(result).toBe(false);

  });

  test('canDelegate retorna true quando Core está disponível', () => {

    coreClient.isAvailable.mockReturnValue(true);

    const policy = new OverflowPolicy();

    expect(policy.canDelegate()).toBe(true);

  });

  test('canDelegate retorna false quando Core está indisponível', () => {

    coreClient.isAvailable.mockReturnValue(false);

    const policy = new OverflowPolicy();

    expect(policy.canDelegate()).toBe(false);

  });

  test('getMetrics retorna estado completo da política', () => {

    driverRegistry.snapshot.mockReturnValue({
      total: 10,
      available: 3,
      busy: 7,
    });

    coreClient.isAvailable.mockReturnValue(true);

    coreClient.cbSnapshot.mockReturnValue({
      state: 'CLOSED',
      failureCount: 0,
    });

    const policy = new OverflowPolicy();

    const metrics = policy.getMetrics();

    expect(metrics.drivers).toBeDefined();
    expect(metrics.drivers.available).toBe(3);
    expect(metrics.drivers.total).toBe(10);

    expect(metrics.coreCircuitBreaker).toBeDefined();
    expect(metrics.policy).toBeDefined();

  });

  test('resetMetrics reseta contadores', () => {

    const policy = new OverflowPolicy();

    policy._metricsOverloadEvents = 5;
    policy._metricsLastDecision = 'queue';

    policy.resetMetrics();

    expect(policy._metricsOverloadEvents).toBe(0);
    expect(policy._metricsLastDecision).toBeNull();

  });

});