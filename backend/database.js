require('dotenv').config();

const { Pool } = require('pg');
const { applyMigrations } = require('./services/migrations');
const { runInTransaction } = require('./services/transaction');
const { summarizeResult, toPostgresQuery, withReturningId } = require('./services/postgres');
const logger = require('./services/logger');
const monitoring = require('./services/monitoring');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Configure DATABASE_URL with a PostgreSQL connection string before starting the backend.');
if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
  throw new Error('DATABASE_URL must use the postgres:// or postgresql:// protocol.');
}

const pool = new Pool({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10
});

function reportDatabaseError(error) {
  monitoring.increment('databaseErrors');
  logger.error('database_operation_failed', { code: error?.code });
}

function isDatabaseError(error) {
  return /^[0-9A-Z]{5}$/.test(String(error?.code || ''))
    || /^(ECONN|PROTOCOL_|ETIMEDOUT)/.test(String(error?.code || ''));
}

function query(queryText, parameters = []) {
  return pool.query(toPostgresQuery(queryText), parameters);
}

let initialization;
const database = {
  run(queryText, parameters, callback) {
    if (typeof parameters === 'function') {
      callback = parameters;
      parameters = [];
    }
    initialization.then(
      () => query(withReturningId(queryText), parameters).then(result => {
        const summary = summarizeResult(result);
        callback?.call({ lastID: summary.insertId, changes: summary.affectedRows }, null, summary);
      }),
      error => {
        reportDatabaseError(error);
        callback?.(error);
      }
    ).catch(error => {
      reportDatabaseError(error);
      callback?.(error);
    });
  },
  get(queryText, parameters, callback) {
    if (typeof parameters === 'function') {
      callback = parameters;
      parameters = [];
    }
    initialization.then(
      () => query(queryText, parameters).then(result => callback?.(null, result.rows?.[0])),
      error => {
        reportDatabaseError(error);
        callback?.(error);
      }
    ).catch(error => {
      reportDatabaseError(error);
      callback?.(error);
    });
  },
  all(queryText, parameters, callback) {
    if (typeof parameters === 'function') {
      callback = parameters;
      parameters = [];
    }
    initialization.then(
      () => query(queryText, parameters).then(result => callback?.(null, result.rows)),
      error => {
        reportDatabaseError(error);
        callback?.(error);
      }
    ).catch(error => {
      reportDatabaseError(error);
      callback?.(error);
    });
  },
  close() {
    return pool.end();
  },
  ready() {
    return initialization;
  },
  checkConnection() {
    return initialization.then(async () => {
      const result = await query('SELECT 1 AS ok');
      if (Number(result.rows?.[0]?.ok) !== 1) {
        const error = new Error('Database readiness query returned an unexpected result.');
        reportDatabaseError(error);
        throw error;
      }
    }).catch(error => {
      reportDatabaseError(error);
      throw error;
    });
  },
  getConnectionConfig() {
    return databaseUrl;
  },
  transaction(callback) {
    return initialization
      .then(() => pool.connect())
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
  logger.error('postgres_initialization_failed', { code: error.code });
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
