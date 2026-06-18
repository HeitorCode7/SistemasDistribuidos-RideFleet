
'use strict';


function parsePartners(raw = '') {
  if (!raw.trim()) return [];

  return raw.split(',').map(entry => {
    const [id, url] = entry.trim().split(':');

    if (!id || !url) {
      throw new Error(`PARTNER inválido: ${entry}`);
    }

    return { id, url };
  });
}

function toInt(value, name) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Variável inválida: ${name}`);
  }
  return parsed;
}

const config = {
  // ======================
  // SERVICE
  // ======================
  serviceId: process.env.SERVICE_ID,
  port: toInt(process.env.PORT, 'PORT'),

  partners: parsePartners(process.env.PARTNERS || ''),

  // ======================
  // BUSINESS RULES
  // ======================
  maxLocalRides: toInt(process.env.MAX_LOCAL_RIDES || '5', 'MAX_LOCAL_RIDES'),
  auctionTimeoutMs: toInt(process.env.AUCTION_TIMEOUT_MS || '3000', 'AUCTION_TIMEOUT_MS'),

  circuitBreaker: {
    failureThreshold: toInt(process.env.CB_FAILURE_THRESHOLD || '3', 'CB_FAILURE_THRESHOLD'),
    recoveryTimeoutMs: toInt(process.env.CB_RECOVERY_TIMEOUT_MS || '10000', 'CB_RECOVERY_TIMEOUT_MS'),
  },

  lock: {
    ttlMs: toInt(process.env.LOCK_TTL_MS || '5000', 'LOCK_TTL_MS'),
  },

  queueMaxSize: toInt(process.env.QUEUE_MAX_SIZE || '100', 'QUEUE_MAX_SIZE'),

  // ======================
  // CORE INTEGRATION
  // ======================
  coreApiKey: process.env.CORE_API_KEY,

  coreServiceUrl: process.env.CORE_SERVICE_URL,
  serviceUrl: process.env.SERVICE_URL,
  contactEmail: process.env.CONTACT_EMAIL,

  coreAuctionTimeoutSeconds: toInt(
    process.env.CORE_AUCTION_TIMEOUT_SECONDS || '10',
    'CORE_AUCTION_TIMEOUT_SECONDS'
  ),
};

// ======================
// VALIDAÇÃO DE STARTUP
// ======================
function validateConfig(cfg) {
  if (!cfg.serviceId) throw new Error('SERVICE_ID não definido');
  if (!cfg.coreServiceUrl) throw new Error('CORE_SERVICE_URL não definido');
  if (!cfg.coreApiKey) throw new Error('CORE_API_KEY não definido');
}

validateConfig(config);

module.exports = config;