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

function normalizarLocal(local, fallback = {}) {
  if (typeof local === 'object' && local !== null) {
    return {
      lat: Number(local.lat ?? fallback.lat ?? -20.7546),
      lng: Number(local.lng ?? fallback.lng ?? -42.8825),
      street: local.street ?? local.rua ?? fallback.street ?? 'Av. P.H. Rolfs',
      number: local.number ?? local.numero ?? fallback.number ?? 'S/N',
      city: local.city ?? local.cidade ?? fallback.city ?? 'Viçosa',
    };
  }

  return {
    lat: fallback.lat ?? -20.7546,
    lng: fallback.lng ?? -42.8825,
    street: String(local || fallback.street || 'Av. P.H. Rolfs'),
    number: fallback.number ?? 'S/N',
    city: fallback.city ?? 'Viçosa',
  };
}

class CoreClient {
  async health() {
  try {

    console.log('CORE_URL =', CORE_URL);
    console.log('URL FINAL =', `${CORE_URL}${API_PREFIX}/health`);

    const response = await axios.get(
      `${CORE_URL}${API_PREFIX}/health`,
      {
        timeout: 5000,
      }
    );

    console.log('CORE RESPONSE =', response.data);

    return response.data;

  } catch (err) {

    console.error('CORE HEALTH ERROR');
    console.error('MESSAGE:', err.message);
    console.error('CODE:', err.code);
    console.error('STATUS:', err.response?.status);
    console.error('DATA:', err.response?.data);

    throw err;
  }
}

  async registrarGrupo() {
    const payload = {
      groupId: config.serviceId,
      groupName: `Grupo A - SIN142`,
      serviceUrl: config.serviceUrl,
      contactEmail: config.contactEmail,
    };

    const { data } = await axios.post(
      `${CORE_URL}${API_PREFIX}/groups/register`,
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      }
    );

    return data;
  }

  async solicitarDelegacao(ride) {
    const payload = {
  originServiceId: '16',
  passengerId: ride.passengerId || 'p1',
  origin: {
    lat: Number(ride.origin?.lat ?? -20.75),
    lng: Number(ride.origin?.lng ?? -42.88),
    street: ride.origin?.street || 'Origem',
    number: ride.origin?.number || '1',
    city: ride.origin?.city || 'Vicosa',
  },
  destination: {
    lat: Number(ride.destination?.lat ?? -20.76),
    lng: Number(ride.destination?.lng ?? -42.89),
    street: ride.destination?.street || 'Destino',
    number: ride.destination?.number || '2',
    city: ride.destination?.city || 'Vicosa',
  },
  logicalTimestamp: ride.logicalTimestamp || 123,
  auctionTimeoutSeconds: 10,
};

    const { data } = await axios.post(
      `${CORE_URL}${API_PREFIX}/rides`,
      payload,
      {
        headers: headers(),
        timeout: 15000,
      }
    );

    return data;
  }

  async consultarPropostas(rideUuid) {
    const { data } = await axios.get(
      `${CORE_URL}${API_PREFIX}/rides/${rideUuid}/proposals`,
      {
        headers: headers(),
        timeout: 10000,
      }
    );

    return data;
  }

  async consultarStatus(rideUuid) {
    const { data } = await axios.get(
      `${CORE_URL}${API_PREFIX}/rides/${rideUuid}/status`,
      {
        headers: headers(),
        timeout: 10000,
      }
    );

    return data;
  }

  async atualizarStatus(rideUuid, newState, logicalTimestamp = Date.now()) {
    const payload = {
      newState,
      serviceId: config.serviceId,
      logicalTimestamp,
    };

    const { data } = await axios.patch(
      `${CORE_URL}${API_PREFIX}/rides/${rideUuid}/status`,
      payload,
      {
        headers: headers(),
        timeout: 10000,
      }
    );

    return data;
  }

  async confirmarMandato(rideUuid, logicalTimestamp = Date.now()) {
    return this.atualizarStatus(rideUuid, 'confirm', logicalTimestamp);
  }

  async consultarAuditLog(rideUuid) {
    const { data } = await axios.get(
      `${CORE_URL}${API_PREFIX}/rides/${rideUuid}/audit`,
      {
        headers: headers(),
        timeout: 10000,
      }
    );

    return data;
  }
}

const coreClient = new CoreClient();

module.exports = {
  CoreClient,
  coreClient,
};