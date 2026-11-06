require('dotenv').config();

const mysql = require('mysql2');
const { applyMigrations } = require('./services/migrations');
const { runInTransaction } = require('./services/transaction');
const logger = require('./services/logger');
const monitoring = require('./services/monitoring');

function reportDatabaseError(error) {
  monitoring.increment('databaseErrors');
  logger.error('database_operation_failed', { code: error?.code });
}

function isDatabaseError(error) {
  return /^(ER_|ECONN|PROTOCOL_|ETIMEDOUT)/.test(String(error?.code || ''));
}

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
    initialization.then(
      () => pool.execute(query, parameters || [], (error, result) => {
        if (error) reportDatabaseError(error);
        callback?.call({ lastID: result?.insertId, changes: result?.affectedRows }, error, result);
      }),
      error => {
        reportDatabaseError(error);
        callback?.(error);
      }
    );
  },
  get(query, parameters, callback) {
    initialization.then(
      () => pool.execute(query, parameters || [], (error, rows) => {
        if (error) reportDatabaseError(error);
        callback?.(error, rows?.[0]);
      }),
      error => {
        reportDatabaseError(error);
        callback?.(error);
      }
    );
  },
  all(query, parameters, callback) {
    initialization.then(
      () => pool.execute(query, parameters || [], (error, rows) => {
        if (error) reportDatabaseError(error);
        callback?.(error, rows);
      }),
      error => {
        reportDatabaseError(error);
        callback?.(error);
      }
    );
  },
  close() {
    return new Promise((resolve, reject) => pool.end(error => error ? reject(error) : resolve()));
  },
  checkConnection() {
    return initialization.then(() => new Promise((resolve, reject) => {
      pool.query('SELECT 1 AS ok', (error, rows) => {
        if (error) {
          reportDatabaseError(error);
          return reject(error);
        }
        if (Number(rows?.[0]?.ok) !== 1) {
          const error = new Error('Database readiness query returned an unexpected result.');
          reportDatabaseError(error);
          return reject(error);
        }
        resolve();
      });
    }));
  },
  getConnectionConfig() {
    return mysqlConfig;
  },
  transaction(callback) {
    return initialization
      .then(() => new Promise((resolve, reject) => pool.getConnection((error, connection) => {
        if (error) reportDatabaseError(error);
        error ? reject(error) : resolve(connection);
      })))
      .then(async connection => {
        try {
          return await runInTransaction(connection, callback);
        } catch (error) {
          if (isDatabaseError(error)) reportDatabaseError(error);
          throw error;
        } finally {
          connection.release();
        }
      });
  },
  initialize() {
    return applyMigrations(pool);
  }
};

initialization = database.initialize().catch(error => {
  reportDatabaseError(error);
  logger.error('mysql_initialization_failed', { code: error.code });
  throw error;
});
module.exports = database;

if (require.main === module) {
  initialization
    .then(() => database.close())
    .then(() => logger.info('database_initialized'))
    .catch(error => {
      logger.error('database_initialization_command_failed', { code: error.code });
      process.exitCode = 1;
    });
}
