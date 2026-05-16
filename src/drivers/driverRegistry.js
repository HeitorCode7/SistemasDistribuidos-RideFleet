'use strict';

let drivers = [
  { id: 'd1', available: true },
  { id: 'd2', available: true },
  { id: 'd3', available: false },
  { id: 'd4', available: true },
];

function findById(id) {
  return drivers.find(d => d.id === id);
}

function findAvailableDrivers() {
  return drivers.filter(d => d.available);
}

// 🔥 NOVO: marca indisponível
function markUnavailable(id) {
  const driver = drivers.find(d => d.id === id);
  if (driver) {
    driver.available = false;
  }
  return driver;
}

// 🔥 NOVO: marca disponível
function markAvailable(id) {
  const driver = drivers.find(d => d.id === id);
  if (driver) {
    driver.available = true;
  }
  return driver;
}

function reset() {
  drivers = [
    { id: 'd1', available: true },
    { id: 'd2', available: true },
    { id: 'd3', available: false },
    { id: 'd4', available: true },
  ];
}

module.exports = {
  findById,
  findAvailableDrivers,
  markUnavailable,
  markAvailable,
  reset,
};