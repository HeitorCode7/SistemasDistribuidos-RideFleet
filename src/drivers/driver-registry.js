'use strict';

/**
 * DriverRegistry
 *
 * Central in-memory store for driver management.
 * Handles CRUD, availability control and ride assignment.
 */
class DriverRegistry {
  constructor() {
    /** @type {Map<string, Driver>} */
    this._drivers = new Map();
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────

  add(driverData) {
    if (!driverData || !driverData.id) {
      throw new Error('Driver must have an id');
    }
    if (this._drivers.has(String(driverData.id))) {
      throw new Error(`Driver ${driverData.id} already registered`);
    }
    const driver = {
      ...driverData,
      id: String(driverData.id),
      available: true,
      currentRideId: null,
      createdAt: new Date().toISOString(),
    };
    this._drivers.set(driver.id, driver);
    return { ...driver };
  }

  get(id) {
    const driver = this._drivers.get(String(id));
    return driver ? { ...driver } : undefined;
  }

  update(id, updates) {
    const driver = this._requireDriver(id);
    const protected_ = ['id', 'currentRideId'];
    protected_.forEach((k) => delete updates[k]);
    Object.assign(driver, updates);
    return { ...driver };
  }

  remove(id) {
    return this._drivers.delete(String(id));
  }

  list() {
    return Array.from(this._drivers.values()).map((d) => ({ ...d }));
  }

  // ─── Availability ────────────────────────────────────────────────────────

  available() {
    return this.list().filter((d) => d.available && d.currentRideId === null);
  }

  hasAvailable() {
    for (const d of this._drivers.values()) {
      if (d.available && d.currentRideId === null) return true;
    }
    return false;
  }

  availableCount() {
    return this.available().length;
  }

  setAvailability(id, value) {
    const driver = this._requireDriver(id);
    driver.available = Boolean(value);
    if (!value) driver.currentRideId = null;
    return { ...driver };
  }

  // ─── Ride Assignment ─────────────────────────────────────────────────────

  /**
   * Assign a ride to the first available driver.
   * Returns the driver object directly, or null if none available.
   * @param {string} rideId
   * @returns {Driver|null}
   */
  assign(rideId) {
    for (const driver of this._drivers.values()) {
      if (driver.available && driver.currentRideId === null) {
        driver.currentRideId = String(rideId);
        driver.available = false;
        return { ...driver };
      }
    }
    return null;
  }

  /**
   * Release a driver from their current ride.
   * @param {string} id
   * @returns {Driver}
   */
  release(id) {
    const driver = this._requireDriver(id);
    driver.currentRideId = null;
    driver.available = true;
    return { ...driver };
  }

  // ─── Snapshot ────────────────────────────────────────────────────────────

  snapshot() {
    const all = this.list();
    const avail = all.filter((d) => d.available && d.currentRideId === null);
    return {
      total: all.length,
      available: avail.length,
      busy: all.length - avail.length,
      drivers: all,
    };
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  _requireDriver(id) {
    const driver = this._drivers.get(String(id));
    if (!driver) throw new Error(`Driver not found: ${id}`);
    return driver;
  }
}

const driverRegistry = new DriverRegistry();

// Seed com motoristas iniciais para os testes de integração
['d1', 'd2', 'd3'].forEach((id) =>
  driverRegistry.add({ id, name: `Driver ${id}` })
);

module.exports = { DriverRegistry, driverRegistry };
