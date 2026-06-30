'use strict';

const axios = require('axios');
const config = require('../../config');

const CORE_URL = (config.coreServiceUrl || 'http://localhost:8080').replace(/\/$/, '');
const API_PREFIX = '/api/v1';

function headers() {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': config.coreApiKey,
  };
}

// 🔥 NÃO MASCARE ERRO — SÓ NORMALIZA SE EXISTIR
function normalizarLocal(local) {
  if (!local) {
    throw new Error('Local inválido enviado ao Core');
  }

  if (typeof local === 'string') {
    return {
      street: local,
      number: 'S/N',
      city: 'Vicosa',
      lat: -20.7546,
      lng: -42.8825,
    };
  }

  return {
    lat: Number(local.lat),
    lng: Number(local.lng),
    street: local.street || local.rua || 'Origem',
    number: local.number || local.numero || 'S/N',
    city: local.city || local.cidade || 'Vicosa',
  };
}

class CoreClient {

  async health() {
    try {
      const { data } = await axios.get(
        `${CORE_URL}${API_PREFIX}/health`,
        { timeout: 5000 }
      );
      return data;
    } catch (err) {
      console.error('[CORE] health error:', err.message);
      throw err;
    }
  }

  async registrarGrupo() {
    try {
      const { data } = await axios.post(
        `${CORE_URL}${API_PREFIX}/groups/register`,
        {
          groupId: config.serviceId,
          groupName: config.serviceName || `Service-${config.serviceId}`,
          serviceUrl: config.serviceUrl,
          contactEmail: config.contactEmail,
        },
        {
          headers: headers(),
          timeout: 10000,
        }
      );

      return data;
    } catch (err) {
      console.error('[CORE] registrarGrupo error:', err.response?.data || err.message);
      throw err;
    }
  }

  async solicitarDelegacao(ride) {
    const payload = {
      originServiceId: config.serviceId,
      passengerId: ride.passengerId,
      passengerName: ride.passengerName || ride.passengerId || 'Passageiro RideFleet',

      origin: normalizarLocal(ride.origin),
      destination: normalizarLocal(ride.destination),

      logicalTimestamp: ride.logicalTimestamp || Date.now(),
      auctionTimeoutSeconds: 10,
    };

    console.log('[CORE] REQUEST:', payload);

    try {
      const { data } = await axios.post(
        `${CORE_URL}${API_PREFIX}/rides`,
        payload,
        {
          headers: headers(),
          timeout: 15000,
        }
      );

      console.log('[CORE] RESPONSE:', data);

      return data;

    } catch (err) {
      console.error('[CORE] solicitarDelegacao ERROR:', {
        message: err.message,
        response: err.response?.data,
        code: err.code,
      });

      throw err;
    }
  }

  async consultarPropostas(rideUuid) {
    const { data } = await axios.get(
      `${CORE_URL}${API_PREFIX}/rides/${rideUuid}/proposals`,
      { headers: headers(), timeout: 10000 }
    );
    return data;
  }

  async consultarStatus(rideUuid) {
    const { data } = await axios.get(
      `${CORE_URL}${API_PREFIX}/rides/${rideUuid}/status`,
      { headers: headers(), timeout: 10000 }
    );
    return data;
  }

  async atualizarStatus(rideUuid, newState, logicalTimestamp = Date.now()) {
    const { data } = await axios.patch(
      `${CORE_URL}${API_PREFIX}/rides/${rideUuid}/status`,
      {
        newState,
        serviceId: config.serviceId,
        logicalTimestamp,
      },
      { headers: headers(), timeout: 10000 }
    );

    return data;
  }

  async adquirirLock(rideUuid, ttlSeconds = 60) {
    const { data } = await axios.post(
      `${CORE_URL}${API_PREFIX}/locks/${rideUuid}`,
      {
        serviceId: config.serviceId,
        ttlSeconds,
      },
      { headers: headers(), timeout: 10000 }
    );

    return data;
  }

  async consultarAuditLog(rideUuid) {
    const { data } = await axios.get(
      `${CORE_URL}${API_PREFIX}/rides/${rideUuid}/audit`,
      { headers: headers(), timeout: 10000 }
    );
    return data;
  }
}

module.exports = {
  CoreClient,
  coreClient: new CoreClient(),
};