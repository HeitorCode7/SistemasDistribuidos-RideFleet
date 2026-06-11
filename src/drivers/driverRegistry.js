'use strict';

const pool = require('../db');

let resetPromise = null;

const registry = {

  async list() {
    const { rows } = await pool.query(`
      SELECT * FROM drivers ORDER BY nome
    `);
    return rows;
  },

  async available() {
    const { rows } = await pool.query(`
      SELECT * FROM drivers WHERE status = 'AVAILABLE' ORDER BY nome
    `);
    return rows;
  },

  async get(id) {
    const { rows } = await pool.query(`
      SELECT * FROM drivers WHERE id = $1
    `, [id]);

    return rows[0] || null;
  },

  async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);

    if (!keys.length) return this.get(id);

    const setSQL = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');

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

    if (!rows.length) throw new Error('Driver not found');

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

  async reset() {
    if (resetPromise) return resetPromise;

    resetPromise = (async () => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        await client.query('TRUNCATE TABLE drivers RESTART IDENTITY CASCADE');

        await client.query(`
          INSERT INTO drivers (
            nome, cpf, telefone,
            placa_veiculo, modelo_veiculo, ano_veiculo,
            servico_proprietario, habilitacao_numero, habilitacao_valida_ate,
            status, data_criacao, data_atualizacao
          )
          VALUES
          ('Driver A','11111111111','11999999999','ABC1234','Fiat Uno',2020,'UBER','CNH123','2030-12-31','AVAILABLE',NOW(),NOW()),
          ('Driver B','22222222222','11988888888','DEF5678','Gol',2019,'UBER','CNH456','2030-12-31','AVAILABLE',NOW(),NOW()),
          ('Driver C','33333333333','11977777777','GHI9999','Onix',2021,'UBER','CNH789','2030-12-31','AVAILABLE',NOW(),NOW())
        `);

        await client.query('COMMIT');

      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    })();

    return resetPromise;
  }
};

registry.snapshot = async function () {
  const drivers = await this.list();

  return {
    total: drivers.length,
    available: drivers.filter(d => d.status === 'AVAILABLE').length,
    busy: drivers.filter(d => d.status === 'BUSY').length,
    drivers
  };
};

module.exports = registry;