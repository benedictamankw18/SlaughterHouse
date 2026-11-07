const test = require('node:test');
const assert = require('node:assert/strict');
const { createRunner, runInTransaction } = require('../services/transaction');

function createFakeConnection(options = {}) {
  const calls = [];
  const results = [...(options.results || [])];
  return {
    calls,
    async query(query, parameters = []) {
      calls.push({ query, parameters });
      if (query === 'BEGIN' && options.beginError) throw options.beginError;
      if (query === 'COMMIT' && options.commitError) throw options.commitError;
      if (query === 'ROLLBACK' && options.rollbackError) throw options.rollbackError;
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(query)) return { rows: [], rowCount: 0 };
      const outcome = results.length ? results.shift() : { rows: [], rowCount: 0 };
      if (outcome instanceof Error) throw outcome;
      return outcome;
    }
  };
}

test('createRunner maps PostgreSQL insert results to the existing lastID and changes interface', async () => {
  const connection = createFakeConnection({ results: [{ rows: [{ id: 42 }], rowCount: 1 }] });
  const runner = createRunner(connection);
  const summary = await runner.run('INSERT INTO sales (id) VALUES (?)', [1]);
  assert.equal(summary.lastID, 42);
  assert.equal(summary.changes, 1);
  assert.equal(connection.calls[0].query, 'INSERT INTO sales (id) VALUES ($1) RETURNING id');
});

test('createRunner get returns the first row and all returns every row', async () => {
  const connection = createFakeConnection({
    results: [
      { rows: [{ id: 7 }], rowCount: 1 },
      { rows: [{ id: 1 }, { id: 2 }], rowCount: 2 }
    ]
  });
  const runner = createRunner(connection);
  assert.deepEqual(await runner.get('SELECT * FROM beats WHERE id = ?', [7]), { id: 7 });
  assert.deepEqual(await runner.all('SELECT * FROM beats'), [{ id: 1 }, { id: 2 }]);
});

test('createRunner supports the callback style used by notification helpers', async () => {
  const successConnection = createFakeConnection({ results: [{ rows: [{ id: 3 }], rowCount: 1 }] });
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

  const failureConnection = createFakeConnection({
    results: [Object.assign(new Error('boom'), { code: '23505' })]
  });
  const failureRunner = createRunner(failureConnection);
  const failureSummary = await new Promise(resolve => {
    failureRunner.run('INSERT INTO notifications (id) VALUES (?)', [3], error => {
      assert.equal(error.code, '23505');
      resolve({ recovered: true });
    });
  });
  assert.equal(failureSummary.recovered, true);
});

test('runInTransaction commits and returns the callback result', async () => {
  const connection = createFakeConnection({ results: [{ rows: [{ id: 1 }], rowCount: 1 }] });
  const result = await runInTransaction(connection, async runner => {
    await runner.run('INSERT INTO orders (id) VALUES (?)', [1]);
    return 'done';
  });
  assert.equal(result, 'done');
  assert.deepEqual(connection.calls.map(call => call.query), [
    'BEGIN', 'INSERT INTO orders (id) VALUES ($1) RETURNING id', 'COMMIT'
  ]);
});

test('runInTransaction rolls back and rethrows when the callback fails', async () => {
  const connection = createFakeConnection({
    results: [Object.assign(new Error('out of stock'), { code: 'OUT_OF_STOCK' })]
  });
  await assert.rejects(
    runInTransaction(connection, async runner => {
      await runner.run('UPDATE merchandise SET stock_quantity = stock_quantity - 1 WHERE id = ?', [1]);
    }),
    error => error.code === 'OUT_OF_STOCK'
  );
  assert.deepEqual(connection.calls.map(call => call.query), [
    'BEGIN', 'UPDATE merchandise SET stock_quantity = stock_quantity - 1 WHERE id = $1', 'ROLLBACK'
  ]);
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
  assert.equal(connection.calls.at(-1).query, 'ROLLBACK');
});

test('runInTransaction rolls back when commit fails', async () => {
  const connection = createFakeConnection({ commitError: Object.assign(new Error('commit failed'), { code: '40001' }) });
  await assert.rejects(runInTransaction(connection, async () => 'value'), error => error.code === '40001');
  assert.deepEqual(connection.calls.map(call => call.query), ['BEGIN', 'COMMIT', 'ROLLBACK']);
});

test('runInTransaction does not begin a transaction when the begin fails', async () => {
  const connection = createFakeConnection({ beginError: Object.assign(new Error('begin failed'), { code: '40001' }) });
  await assert.rejects(runInTransaction(connection, async () => 'value'), error => error.code === '40001');
  assert.deepEqual(connection.calls.map(call => call.query), ['BEGIN']);
});
