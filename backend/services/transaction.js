function createRunner(connection) {
  const execute = (query, parameters = []) => new Promise((resolve, reject) => {
    connection.execute(query, parameters, (error, result) => error ? reject(error) : resolve(result));
  });
  return {
    // The callback form keeps this runner interchangeable with the global database
    // helpers used by services such as notifications.
    async run(query, parameters = [], callback) {
      if (typeof parameters === 'function') {
        callback = parameters;
        parameters = [];
      }
      try {
        const result = await execute(query, parameters);
        const summary = { lastID: result?.insertId, changes: result?.affectedRows, result };
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
      const rows = await execute(query, parameters);
      return rows?.[0];
    },
    async all(query, parameters = []) {
      const rows = await execute(query, parameters);
      return rows || [];
    }
  };
}

function callConnection(connection, method) {
  return new Promise((resolve, reject) => {
    connection[method](error => error ? reject(error) : resolve());
  });
}

async function runInTransaction(connection, callback) {
  const runner = createRunner(connection);
  await callConnection(connection, 'beginTransaction');
  try {
    const result = await callback(runner);
    await callConnection(connection, 'commit');
    return result;
  } catch (error) {
    try {
      await callConnection(connection, 'rollback');
    } catch (rollbackError) {
      console.error('Transaction rollback failed:', rollbackError.code || rollbackError.message);
    }
    throw error;
  }
}

module.exports = { createRunner, runInTransaction };
