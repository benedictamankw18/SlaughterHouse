require('dotenv').config();

const mysql = require('mysql2');
const { applyMigrations } = require('./services/migrations');
const { runInTransaction } = require('./services/transaction');

const mysqlConfig = process.env.MYSQL_URL && !process.env.MYSQL_URL.includes('user:password')
  ? process.env.MYSQL_URL
  : {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  };

if (!mysqlConfig.host && typeof mysqlConfig !== 'string') throw new Error('Configure MYSQL_URL or DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME before starting the backend.');

const pool = mysql.createPool(mysqlConfig);
let initialization;
const database = {
  run(query, parameters, callback) {
    initialization.then(() => pool.execute(query, parameters || [], (error, result) => callback?.call({ lastID: result?.insertId, changes: result?.affectedRows }, error, result)));
  },
  get(query, parameters, callback) {
    initialization.then(() => pool.execute(query, parameters || [], (error, rows) => callback?.(error, rows?.[0])));
  },
  all(query, parameters, callback) {
    initialization.then(() => pool.execute(query, parameters || [], (error, rows) => callback?.(error, rows)));
  },
  close() {
    return new Promise((resolve, reject) => pool.end(error => error ? reject(error) : resolve()));
  },
  getConnectionConfig() {
    return mysqlConfig;
  },
  transaction(callback) {
    return initialization
      .then(() => new Promise((resolve, reject) => pool.getConnection((error, connection) => error ? reject(error) : resolve(connection))))
      .then(async connection => {
        try {
          return await runInTransaction(connection, callback);
        } finally {
          connection.release();
        }
      });
  },
  initialize() {
    return applyMigrations(pool);
  }
};

initialization = database.initialize().catch(error => { console.error('MySQL initialization failed:', error.message); throw error; });
module.exports = database;

if (require.main === module) {
  initialization
    .then(() => database.close())
    .then(() => console.log('Database initialized successfully.'))
    .catch(() => process.exitCode = 1);
}
