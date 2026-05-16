'use strict';

const driverRegistry = require('./driverRegistry');

async function assignDriver(rideId) {
  const drivers = driverRegistry.findAvailableDrivers();

  if (!drivers.length) return null;

  const driver = drivers[0];

  driverRegistry.markUnavailable(driver.id);

  return {
    id: driver.id,
    available: false,
  };
}

async function releaseDriver(driverId) {
  return driverRegistry.markAvailable(driverId);
}

async function listDrivers() {
  return driverRegistry.findAvailableDrivers();
}

async function listAvailableDrivers() {
  return driverRegistry.findAvailableDrivers();
}

function reset() {
  driverRegistry.reset();
}

module.exports = {
  assignDriver,
  releaseDriver,
  listDrivers,
  listAvailableDrivers,
  reset,
};