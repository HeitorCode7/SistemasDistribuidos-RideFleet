'use strict';

const driverService = require('../drivers/driverService');

beforeEach(() => {
  if (driverService.reset) {
    driverService.reset();
  }
});