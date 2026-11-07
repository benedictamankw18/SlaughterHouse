const logger = require('./logger');
const { summarizeResult, toPostgresQuery, withReturningId } = require('./postgres');

function createRunner(connection) {
  const execute = (query, parameters = []) => connection.query(toPostgresQuery(query), parameters);
  return {
    async run(query, parameters = [], callback) {
      if (typeof parameters === 'function') {
        callback = parameters;
        parameters = [];
      }
      try {
        const result = summarizeResult(await execute(withReturningId(query), parameters));
        const summary = { lastID: result.insertId, changes: result.affectedRows, result };
        if (callback) {
          callback.call(summary, null, result);
          return summary;
        }
        return summary;
      } catch (error) {
        if (callback) {
          callback.call({}, error);
          return { lastID: undefined, changes: 0, result: undefined, error };
        }
        throw error;
      }
    },
    async get(query, parameters = []) {
      const result = await execute(query, parameters);
      return result.rows?.[0];
    },
    async all(query, parameters = []) {
      const result = await execute(query, parameters);
      return result.rows || [];
    }
  };
}

async function runInTransaction(connection, callback) {
  const runner = createRunner(connection);
  await connection.query('BEGIN');
  try {
    const result = await callback(runner);
    await connection.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await connection.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('transaction_rollback_failed', { code: rollbackError.code });
    }
    throw error;
  }
}

module.exports = { createRunner, runInTransaction };
