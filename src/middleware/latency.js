'use strict';

// src/middleware/latency.js
// Rastreia latência das requisições HTTP em uma janela deslizante recente.
// Expõe getLatencyStats() para uso no health-service.

const WINDOW_SIZE = 100; // últimas N requisições

const _samples = [];

/**
 * Middleware Express: mede duração de cada requisição e armazena na janela.
 */
function latencyMiddleware(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    _samples.push({
      duration,
      status: res.statusCode,
      ts: Date.now(),
    });

    if (_samples.length > WINDOW_SIZE) {
      _samples.shift();
    }
  });

  next();
}

/**
 * Retorna estatísticas da janela atual.
 * @returns {{ avg: number, p95: number, p99: number, samples: number, errorRate: number }}
 */
function getLatencyStats() {
  if (_samples.length === 0) {
    return { avg: 0, p95: 0, p99: 0, samples: 0, errorRate: 0 };
  }

  const durations = _samples.map(s => s.duration).sort((a, b) => a - b);

  const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);

  const p95Index = Math.floor(durations.length * 0.95);
  const p99Index = Math.floor(durations.length * 0.99);

  const p95 = durations[Math.min(p95Index, durations.length - 1)];
  const p99 = durations[Math.min(p99Index, durations.length - 1)];

  const errors = _samples.filter(s => s.status >= 500).length;
  const errorRate = parseFloat(((errors / _samples.length) * 100).toFixed(1));

  return { avg, p95, p99, samples: _samples.length, errorRate };
}

/**
 * Limpa amostras (usado em testes).
 */
function reset() {
  _samples.length = 0;
}

module.exports = { latencyMiddleware, getLatencyStats, reset };