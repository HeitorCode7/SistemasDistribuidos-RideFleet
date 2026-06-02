// config/index.js

function parsePartners(raw = '') {
  if (!raw.trim()) return [];
  return raw.split(',').map(entry => {
    const [id] = entry.trim().split(':');
    const fullUrl = entry.trim().slice(id.length + 1);
    return { id, url: fullUrl };
  });
}

const config = {
  serviceId: process.env.SERVICE_ID || 'grupo-a',
  port: parseInt(process.env.PORT || '3000', 10),
  partners: parsePartners(process.env.PARTNERS || ''),

  maxLocalRides: parseInt(process.env.MAX_LOCAL_RIDES || '5', 10),
  auctionTimeoutMs: parseInt(process.env.AUCTION_TIMEOUT_MS || '3000', 10),

  circuitBreaker: {
    failureThreshold: parseInt(process.env.CB_FAILURE_THRESHOLD || '3', 10),
    recoveryTimeoutMs: parseInt(process.env.CB_RECOVERY_TIMEOUT_MS || '10000', 10),
  },

  lock: {
    ttlMs: parseInt(process.env.LOCK_TTL_MS || '5000', 10),
  },

  queueMaxSize: parseInt(process.env.QUEUE_MAX_SIZE || '100', 10),

  // Integração com o Core
  coreApiKey: process.env.CORE_API_KEY || '',
  serviceUrl: process.env.SERVICE_URL || 'http://localhost:3001',
  contactEmail: process.env.CONTACT_EMAIL || 'gabriel.a.santos@ufv.br',
  coreAuctionTimeoutSeconds: parseInt(
    process.env.CORE_AUCTION_TIMEOUT_SECONDS || '10',
    10
  ),
};

module.exports = config;