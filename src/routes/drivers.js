'use strict';


const { Router } = require('express');

/**
 * @param {import('../drivers/driver-registry')} registry
 * @returns {Router}
 */
function driversRouter(registry) {
  const router = Router();

 router.post('/', (req, res) => {
  console.log("BODY RECEBIDO:", req.body);
  res.json(req.body);
});

  router.get('/', (req, res) => {
    const { available } = req.query;

    let drivers;
    if (available === 'true') {
      drivers = registry.available();
    } else {
      drivers = registry.list();
    }

    return res.json(drivers);
  });

  router.get('/:id', (req, res) => {
    const driver = registry.get(req.params.id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    return res.json(driver);
  });

 
  router.put('/:id', (req, res) => {
    try {
      const driver = registry.update(req.params.id, req.body);
      return res.json(driver);
    } catch (err) {
      return res.status(404).json({ error: err.message });
    }
  });

  router.delete('/:id', (req, res) => {
    const removed = registry.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Driver not found' });
    return res.status(204).send();
  });

 
  router.patch('/:id/availability', (req, res) => {
    const { available } = req.body;
    if (typeof available !== 'boolean') {
      return res.status(400).json({ error: '`available` must be a boolean' });
    }
    try {
      const driver = registry.setAvailability(req.params.id, available);
      return res.json(driver);
    } catch (err) {
      return res.status(404).json({ error: err.message });
    }
  });

  router.get('/:id/ride', (req, res) => {
    const driver = registry.get(req.params.id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    if (!driver.currentRideId) {
      return res.json({ rideId: null, message: 'Driver has no active ride' });
    }
    return res.json({ rideId: driver.currentRideId });
  });

  return router;
}

module.exports = driversRouter;