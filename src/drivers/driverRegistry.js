'use strict';

const pool = require('../db');

const registry = {

  async list() {
    const { rows } = await pool.query(`
      SELECT * FROM drivers
      ORDER BY nome
    `);

    return rows;
  },

  async available() {
    const { rows } = await pool.query(`
      SELECT * FROM drivers
      WHERE status = 'AVAILABLE'
      ORDER BY nome
    `);

    return rows;
  },

  async get(id) {
    const { rows } = await pool.query(`
      SELECT * FROM drivers
      WHERE id = $1
    `, [id]);

    return rows[0] || null;
  },

  async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);

    if (!keys.length) {
      return this.get(id);
    }

    const setSQL = keys
      .map((k, i) => `${k} = $${i + 1}`)
      .join(', ');

    const { rows } = await pool.query(`
      UPDATE drivers
      SET ${setSQL}
      WHERE id = $${keys.length + 1}
      RETURNING *
    `, [...values, id]);

    return rows[0] || null;
  },

  async setAvailability(id, available) {
    const status = available ? 'AVAILABLE' : 'BUSY';

    const { rows } = await pool.query(`
      UPDATE drivers
      SET status = $1
      WHERE id = $2
      RETURNING *
    `, [status, id]);

    if (!rows.length) {
      throw new Error('Driver not found');
    }

    return rows[0];
  },

  async remove(id) {
    const { rows } = await pool.query(`
      DELETE FROM drivers
      WHERE id = $1
      RETURNING *
    `, [id]);

    return rows[0] || null;
  },

  // 🔥 CORRIGIDO: reset seguro para testes (sem deadlock)
  async reset() {
    await pool.query(`
      TRUNCATE TABLE drivers RESTART IDENTITY CASCADE
    `);

    return true;
  }
};

// snapshot (inalterado)
registry.snapshot = async function () {
  const drivers = await this.list();

  return {
    total: drivers.length,

    available: drivers.filter(
      d => d.status === 'AVAILABLE'
    ).length,

    busy: drivers.filter(
      d => d.status === 'BUSY'
    ).length,

    drivers
  };
};

module.exports = registry;