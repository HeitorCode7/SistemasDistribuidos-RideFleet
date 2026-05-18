'use strict';

const pool = require('../db'); 
const registry = {
  async list() {
    const result = await pool.query(`
      SELECT *
      FROM drivers
      ORDER BY nome
    `);

    return result.rows;
  },

  async available() {
    const result = await pool.query(`
      SELECT *
      FROM drivers
      WHERE status = 'AVAILABLE'
      ORDER BY nome
    `);

    return result.rows;
  },

  async get(id) {
    const result = await pool.query(`
      SELECT *
      FROM drivers
      WHERE id = $1
    `, [id]);

    return result.rows[0] || null;
  },

  async update(id, data) {
    const fields = [];
    const values = [];
    let index = 1;

    for (const key in data) {
      fields.push(`${key} = $${index}`);
      values.push(data[key]);
      index++;
    }

    values.push(id);

    const result = await pool.query(`
      UPDATE drivers
      SET ${fields.join(', ')}
      WHERE id = $${index}
      RETURNING *
    `, values);

    if (!result.rows.length) {
      throw new Error('Driver not found');
    }

    return result.rows[0];
  },

  async remove(id) {
    const result = await pool.query(`
      DELETE FROM drivers
      WHERE id = $1
      RETURNING *
    `, [id]);

    return result.rows.length > 0;
  },

  async setAvailability(id, available) {
    const status = available ? 'AVAILABLE' : 'BUSY';

    const result = await pool.query(`
      UPDATE drivers
      SET status = $1
      WHERE id = $2
      RETURNING *
    `, [status, id]);

    if (!result.rows.length) {
      throw new Error('Driver not found');
    }

    return result.rows[0];
  }
};

module.exports = registry;