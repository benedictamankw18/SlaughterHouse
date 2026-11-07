require('dotenv').config();

const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('node:path');
const database = require('./database');

const sqlitePath = process.env.SQLITE_SOURCE_PATH || path.join(__dirname, 'data', 'app.db');
const sqlite = new sqlite3.Database(sqlitePath);
const tables = ['users', 'beats', 'merchandise', 'sales', 'orders', 'customization_requests', 'withdrawals', 'bookings'];

function readRows(table) {
  return new Promise((resolve, reject) => sqlite.all(`SELECT * FROM ${table}`, (error, rows) => error ? reject(error) : resolve(rows)));
}

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL with a PostgreSQL connection string.');
  await database.initialize();
  const target = new Pool({ connectionString: database.getConnectionConfig() });
  const connection = await target.connect();
  try {
    await connection.query('BEGIN');
    for (const table of tables) {
      const rows = await readRows(table);
      for (const row of rows) {
        const columns = Object.keys(row);
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
        await connection.query(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          columns.map(column => row[column])
        );
      }
      await connection.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM ${table}`,
        [table]
      );
      console.log(`${table}: ${rows.length} row(s) read`);
    }
    await connection.query('COMMIT');
    console.log('PostgreSQL import complete. Existing rows were preserved with ON CONFLICT DO NOTHING.');
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  } finally {
    connection.release();
    await target.end();
    await database.close();
    sqlite.close();
  }
}

migrate().catch(error => { console.error('PostgreSQL import failed:', error.message); process.exitCode = 1; });