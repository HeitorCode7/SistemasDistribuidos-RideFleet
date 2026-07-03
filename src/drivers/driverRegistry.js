'use strict';

const pool = require('../db');

let resetPromise = null;
const DEFAULT_DRIVER_COUNT = 30;

function defaultDriversInsertSQL() {
  return `
    INSERT INTO drivers (
      nome, cpf, telefone,
      placa_veiculo, modelo_veiculo, ano_veiculo,
      servico_proprietario, numero_motorista_no_servico,
      habilitacao_numero, habilitacao_valida_ate,
      status, disponivel_desde, status_verificacao,
      data_criacao, data_atualizacao
    )
    SELECT
      'Driver ' || n,
      '333333' || lpad(n::text, 5, '0'),
      '11999' || lpad(n::text, 6, '0'),
      'TST' || lpad(n::text, 4, '0'),
      'Onix',
      2021,
      'SERVICE_A',
      n,
      'CNHT' || lpad(n::text, 4, '0'),
      '2030-12-31',
      'AVAILABLE',
      NOW(),
      'VERIFICADO',
      NOW(),
      NOW()
    FROM generate_series(1, $1) AS n
    ON CONFLICT DO NOTHING
  `;
}

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
      SET
        status = $1::text,
        disponivel_desde = CASE WHEN $1::text = 'AVAILABLE' THEN NOW() ELSE NULL END
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

  async ensureDefaultDrivers(count = DEFAULT_DRIVER_COUNT) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await client.query('SELECT pg_advisory_xact_lock(14230)');

      const { rows } = await client.query(`
        SELECT COUNT(*)::int AS total
        FROM drivers
      `);

      if (rows[0].total === 0) {
        await client.query(defaultDriversInsertSQL(), [count]);
      }

      await client.query(`
        UPDATE partner_services
        SET
          numero_motoristas = $1,
          motoristas_disponiveis = (
            SELECT COUNT(*)::int
            FROM drivers
            WHERE status = 'AVAILABLE'
          )
        WHERE servico_nome = 'SERVICE_A'
      `, [count]);

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async reset() {
    if (resetPromise) return resetPromise;

    resetPromise = (async () => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        await client.query('TRUNCATE TABLE drivers RESTART IDENTITY CASCADE');

        await client.query(defaultDriversInsertSQL(), [DEFAULT_DRIVER_COUNT]);

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
