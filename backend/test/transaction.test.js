const test = require('node:test');
const assert = require('node:assert/strict');
const { createRunner, runInTransaction } = require('../services/transaction');

function createFakeConnection(options = {}) {
  const calls = [];
  const results = [...(options.results || [])];
  const connection = {
    calls,
    execute(query, parameters, callback) {
      calls.push({ method: 'execute', query, parameters });
      const outcome = results.length ? results.shift() : [];
      if (outcome instanceof Error) return callback(outcome);
      callback(null, outcome);
    },
    beginTransaction(callback) {
      calls.push({ method: 'beginTransaction' });
      callback(options.beginError || null);
    },
    commit(callback) {
      calls.push({ method: 'commit' });
      callback(options.commitError || null);
    },
    rollback(callback) {
      calls.push({ method: 'rollback' });
      callback(options.rollbackError || null);
    }
  };
  return connection;
}

test('createRunner maps insertId and affectedRows to lastID and changes', async () => {
  const connection = createFakeConnection({ results: [{ insertId: 42, affectedRows: 1 }] });
  const runner = createRunner(connection);
  const summary = await runner.run('INSERT INTO sales (id) VALUES (?)', [1]);
  assert.equal(summary.lastID, 42);
  assert.equal(summary.changes, 1);
});

test('createRunner get returns the first row and all returns every row', async () => {
  const connection = createFakeConnection({ results: [[{ id: 7 }], [{ id: 1 }, { id: 2 }]] });
  const runner = createRunner(connection);
  assert.deepEqual(await runner.get('SELECT * FROM beats WHERE id = ?', [7]), { id: 7 });
  assert.deepEqual(await runner.all('SELECT * FROM beats'), [{ id: 1 }, { id: 2 }]);
});

test('createRunner supports the callback style used by notification helpers', async () => {
  const successConnection = createFakeConnection({ results: [{ insertId: 3, affectedRows: 1 }] });
  const successRunner = createRunner(successConnection);
  const successSummary = await new Promise(resolve => {
    successRunner.run('INSERT INTO notifications (id) VALUES (?)', [3], function (error, result) {
      assert.equal(error, null);
      assert.equal(this.lastID, 3);
      assert.equal(result.insertId, 3);
      resolve(this);
    });
  });
  assert.equal(successSummary.changes, 1);

  const failureConnection = createFakeConnection({ results: [Object.assign(new Error('boom'), { code: 'ER_FAIL' })] });
  const failureRunner = createRunner(failureConnection);
  const failureSummary = await new Promise(resolve => {
    failureRunner.run('INSERT INTO notifications (id) VALUES (?)', [3], error => {
      assert.equal(error.code, 'ER_FAIL');
      resolve({ recovered: true });
    });
  });
  assert.equal(failureSummary.recovered, true);
});

test('runInTransaction commits and returns the callback result', async () => {
  const connection = createFakeConnection({ results: [{ insertId: 1, affectedRows: 1 }] });
  const result = await runInTransaction(connection, async runner => {
    await runner.run('INSERT INTO orders (id) VALUES (?)', [1]);
    return 'done';
  });
  assert.equal(result, 'done');
  assert.deepEqual(connection.calls.map(call => call.method), ['beginTransaction', 'execute', 'commit']);
});

test('runInTransaction rolls back and rethrows when the callback fails', async () => {
  const connection = createFakeConnection({ results: [Object.assign(new Error('out of stock'), { code: 'OUT_OF_STOCK' })] });
  await assert.rejects(
    runInTransaction(connection, async runner => {
      await runner.run('UPDATE merchandise SET stock_quantity = stock_quantity - 1 WHERE id = ?', [1]);
    }),
    error => error.code === 'OUT_OF_STOCK'
  );
  assert.deepEqual(connection.calls.map(call => call.method), ['beginTransaction', 'execute', 'rollback']);
});

test('runInTransaction keeps the original error when rollback also fails', async () => {
  const originalError = new Error('callback failed');
  const connection = createFakeConnection({ rollbackError: new Error('rollback failed') });
  const originalConsoleError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await assert.rejects(runInTransaction(connection, async () => { throw originalError; }), error => error === originalError);
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(logged.length, 1);
  assert.equal(connection.calls.at(-1).method, 'rollback');
});

test('runInTransaction rolls back when commit fails', async () => {
  const connection = createFakeConnection({ commitError: Object.assign(new Error('commit failed'), { code: 'ER_COMMIT' }) });
  await assert.rejects(runInTransaction(connection, async () => 'value'), error => error.code === 'ER_COMMIT');
  assert.deepEqual(connection.calls.map(call => call.method), ['beginTransaction', 'commit', 'rollback']);
});

test('runInTransaction does not begin a transaction when the begin fails', async () => {
  const connection = createFakeConnection({ beginError: Object.assign(new Error('begin failed'), { code: 'ER_BEGIN' }) });
  await assert.rejects(runInTransaction(connection, async () => 'value'), error => error.code === 'ER_BEGIN');
  assert.deepEqual(connection.calls.map(call => call.method), ['beginTransaction']);
});
