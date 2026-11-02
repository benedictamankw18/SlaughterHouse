require('dotenv').config();

const sqlite3 = require('sqlite3').verbose();
const mysql = require('mysql2/promise');
const path = require('node:path');
const database = require('./database');

const sqlitePath = process.env.SQLITE_SOURCE_PATH || path.join(__dirname, 'data', 'app.db');
const sqlite = new sqlite3.Database(sqlitePath);
const tables = ['users', 'beats', 'merchandise', 'sales', 'orders', 'customization_requests', 'withdrawals', 'bookings'];

function readRows(table) {
  return new Promise((resolve, reject) => sqlite.all(`SELECT * FROM ${table}`, (error, rows) => error ? reject(error) : resolve(rows)));
}

async function migrate() {
  if (!process.env.MYSQL_URL && !process.env.DB_HOST) throw new Error('Configure MYSQL_URL or DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME.');
  await database.initialize();
  const target = await mysql.createConnection(database.getConnectionConfig());
  try {
    await target.beginTransaction();
    for (const table of tables) {
      const rows = await readRows(table);
      for (const row of rows) {
        const columns = Object.keys(row);
        const placeholders = columns.map(() => '?').join(', ');
        await target.execute(`INSERT IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`, columns.map(column => row[column]));
      }
      console.log(`${table}: ${rows.length} row(s) read`);
    }
    await target.commit();
    console.log('MySQL migration complete. Existing rows were preserved with INSERT IGNORE.');
  } catch (error) {
    await target.rollback();
    throw error;
  } finally {
    await target.end();
    await database.close();
    sqlite.close();
  }
}

migrate().catch(error => { console.error('MySQL migration failed:', error.message); process.exitCode = 1; });