'use strict';

const { Router } = require('express');

/**
 * @param {import('../drivers/driverRegistry')} registry
 * @returns {Router}
 */
function driversRouter(registry) {
  const router = Router();

  // CREATE (teste simples)
  router.post('/', (req, res) => {
    console.log("BODY RECEBIDO:", req.body);
    return res.json(req.body);
  });

  // LIST ALL / AVAILABLE
  router.get('/', async (req, res) => {
    try {
      const { available } = req.query;

      let drivers;

      if (available === 'true') {
        drivers = await registry.available();
      } else {
        drivers = await registry.list();
      }

      return res.json(drivers);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET BY ID
  router.get('/:id', async (req, res) => {
    try {
      const driver = await registry.get(req.params.id);

      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }

      return res.json(driver);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // UPDATE
  router.put('/:id', async (req, res) => {
    try {
      const driver = await registry.update(req.params.id, req.body);
      return res.json(driver);
    } catch (err) {
      return res.status(404).json({ error: err.message });
    }
  });

  // DELETE
  router.delete('/:id', async (req, res) => {
    try {
      const removed = await registry.remove(req.params.id);

      if (!removed) {
        return res.status(404).json({ error: 'Driver not found' });
      }

      return res.status(204).send();
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // PATCH availability
  router.patch('/:id/availability', async (req, res) => {
    try {
      const { available } = req.body;

      if (typeof available !== 'boolean') {
        return res.status(400).json({
          error: '`available` must be a boolean'
        });
      }

      const driver = await registry.setAvailability(req.params.id, available);
      return res.json(driver);
    } catch (err) {
      return res.status(404).json({ error: err.message });
    }
  });

  // GET ride status
  router.get('/:id/ride', async (req, res) => {
    try {
      const driver = await registry.get(req.params.id);

      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }

      if (!driver.currentRideId) {
        return res.json({
          rideId: null,
          message: 'Driver has no active ride'
        });
      }

      return res.json({ rideId: driver.currentRideId });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = driversRouter;