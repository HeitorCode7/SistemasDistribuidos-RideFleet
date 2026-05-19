'use strict';

const pool = require('../db');
const driverRegistry = require('./driverRegistry');

async function assignDriver(rideId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(`
      SELECT *
      FROM drivers
      WHERE status = 'AVAILABLE'
      ORDER BY nome
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `);

    if (!rows.length) {
      await client.query('ROLLBACK');
      return null;
    }

    const driver = rows[0];

    await client.query(`
      UPDATE drivers
      SET status = 'BUSY'
      WHERE id = $1
    `, [driver.id]);

    await client.query('COMMIT');

    return {
      id: driver.id,
      rideId,
    };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function releaseDriver(id) {
  return driverRegistry.setAvailability(id, true);
}

async function reset() {
  return driverRegistry.reset();
}

module.exports = {
  assignDriver,
  releaseDriver,
  reset,
};