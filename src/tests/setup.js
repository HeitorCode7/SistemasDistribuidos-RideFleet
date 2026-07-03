'use strict';

process.env.PORT = process.env.PORT || '3000';
process.env.SERVICE_ID = process.env.SERVICE_ID || 'test-grupo-a';
process.env.CORE_SERVICE_URL = process.env.CORE_SERVICE_URL || 'http://localhost:8080';
process.env.CORE_API_KEY = process.env.CORE_API_KEY || 'test-api-key';

const driverService = require('../drivers/driverService');

beforeEach(async () => {
  if (driverService.reset) {
    await driverService.reset();
  }
});
