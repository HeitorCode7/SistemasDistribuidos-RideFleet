// src/logical-clock/lamport-clock.js
// Req 5 — Relógios Lógicos e Ordenação Causal
//
// Implementação do Relógio de Lamport.
// Regras:
//   - Ao enviar evento: incrementa e carimba
//   - Ao receber evento: clock = max(local, recebido) + 1
//   - Happened-before: se a(ts) < b(ts) E a precede b causalmente

class LamportClock {
  constructor(serviceId) {
    this.serviceId = serviceId;
    this.time = 0;
    // Log de eventos causais: [{ ts, serviceId, eventType, payload }]
    this._log = [];
  }

  /** Incrementa e retorna o timestamp para um evento local */
  tick(eventType, payload = {}) {
    this.time += 1;
    const entry = {
      ts: this.time,
      serviceId: this.serviceId,
      eventType,
      payload,
      recordedAt: Date.now(),
    };
    this._log.push(entry);
    return entry;
  }

  /**
   * Processa timestamp recebido de outro serviço.
   * Aplica a regra: time = max(local, received) + 1
   */
  receive(receivedTs, eventType, payload = {}) {
    this.time = Math.max(this.time, receivedTs) + 1;
    const entry = {
      ts: this.time,
      serviceId: this.serviceId,
      eventType,
      receivedTs,
      payload,
      recordedAt: Date.now(),
    };
    this._log.push(entry);
    return entry;
  }

  /** Retorna o tempo atual sem incrementar */
  now() {
    return this.time;
  }

  /**
   * Retorna o log causal filtrado por rideId,
   * ordenado por timestamp de Lamport.
   */
  getCausalLog(rideId) {
    return this._log
      .filter(e => e.payload && e.payload.rideId === rideId)
      .sort((a, b) => a.ts - b.ts);
  }

  /** Log completo */
  getFullLog() {
    return [...this._log].sort((a, b) => a.ts - b.ts);
  }
}

// Singleton
let _instance = null;
function getClock(serviceId) {
  if (!_instance) _instance = new LamportClock(serviceId);
  return _instance;
}

module.exports = { LamportClock, getClock };
