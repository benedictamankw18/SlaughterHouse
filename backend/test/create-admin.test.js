const test = require('node:test');
const assert = require('node:assert/strict');
const { parseOptions, createAdmin } = require('../scripts/create-admin');

function fakeDatabase({ existing } = {}) {
  const calls = [];
  return {
    calls,
    get(query, parameters, callback) {
      calls.push({ operation: 'get', query, parameters });
      callback(null, existing);
    },
    run(query, parameters, callback) {
      calls.push({ operation: 'run', query, parameters });
      const summary = { lastID: 42, changes: 1 };
      callback.call(summary, null, summary);
    }
  };
}

const validOptions = {
  email: 'Owner@Example.com',
  name: 'Site Owner',
  password: 'ValidPassphrase123!',
  update: false
};

test('parseOptions reads flags and environment fallbacks', () => {
  const fromFlags = parseOptions(['--email', 'Admin@Example.com', '--name', 'Admin', '--password', 'ValidPassphrase123!', '--update'], {});
  assert.deepEqual(fromFlags, {
    email: 'admin@example.com',
    name: 'Admin',
    password: 'ValidPassphrase123!',
    update: true
  });

  const fromEnvironment = parseOptions([], {
    ADMIN_EMAIL: 'ENV@Example.com',
    ADMIN_NAME: 'Env Admin',
    ADMIN_PASSWORD: 'AnotherPassphrase123!'
  });
  assert.equal(fromEnvironment.email, 'env@example.com');
  assert.equal(fromEnvironment.name, 'Env Admin');
  assert.equal(fromEnvironment.password, 'AnotherPassphrase123!');
  assert.equal(fromEnvironment.update, false);
});

test('createAdmin inserts a verified super-admin with a hashed password', async () => {
  const database = fakeDatabase();
  const result = await createAdmin(database, validOptions, { hash: async () => 'hashed-password' });

  assert.deepEqual(result, { id: 42, email: 'owner@example.com', created: true });
  const insert = database.calls.find(call => call.operation === 'run');
  assert.match(insert.query, /INSERT INTO users/);
  assert.match(insert.query, /'super_admin'/);
  assert.match(insert.query, /CURRENT_TIMESTAMP/);
  assert.deepEqual(insert.parameters, ['Site Owner', 'owner@example.com', 'hashed-password']);
  assert.equal(insert.parameters.includes(validOptions.password), false);
});

test('createAdmin updates an existing account only when explicitly requested', async () => {
  const database = fakeDatabase({ existing: { id: 7 } });
  await assert.rejects(
    createAdmin(database, validOptions, { hash: async () => 'hashed-password' }),
    /Pass --update/
  );

  const result = await createAdmin(database, { ...validOptions, update: true }, { hash: async () => 'hashed-password' });
  assert.deepEqual(result, { id: 7, email: 'owner@example.com', created: false });
  const update = database.calls.filter(call => call.operation === 'run').at(-1);
  assert.match(update.query, /UPDATE users/);
  assert.match(update.query, /role = 'super_admin'/);
  assert.deepEqual(update.parameters, ['Site Owner', 'hashed-password', 7]);
});

test('createAdmin rejects invalid input before writing', async () => {
  const database = fakeDatabase();
  await assert.rejects(
    createAdmin(database, { ...validOptions, email: 'not-an-email' }, { hash: async () => 'hash' }),
    /valid administrator email/
  );
  await assert.rejects(
    createAdmin(database, { ...validOptions, name: '' }, { hash: async () => 'hash' }),
    /administrator name/
  );
  await assert.rejects(
    createAdmin(database, { ...validOptions, password: 'short' }, { hash: async () => 'hash' }),
    /between 12 and 128/
  );
  assert.equal(database.calls.some(call => call.operation === 'run'), false);
});
