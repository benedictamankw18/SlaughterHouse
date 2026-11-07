const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const logger = require('../services/logger');
const monitoring = require('../services/monitoring');
const { checkReadiness } = require('../services/health');
const { requestContext } = require('../middleware/request-context');
const { saveUpload } = require('../services/uploads');
const { clientArgs, validateDatabaseName } = require('../scripts/postgres-tools');

test('logger redacts sensitive fields recursively and credentials in messages', () => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const output = [];
  console.log = value => output.push(JSON.parse(value));
  console.warn = value => output.push(JSON.parse(value));
  try {
    logger.info('request Bearer abc.def', {
      password: 'private-password',
      databaseUrl: 'postgresql://user:private-password@db.example.test/store',
      nested: { apiKey: 'private-key', label: 'safe' }
    });
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
  assert.equal(output[0].message, 'request [REDACTED]');
  assert.equal(output[0].password, '[REDACTED]');
  assert.equal(output[0].databaseUrl, '[REDACTED]');
  assert.deepEqual(output[0].nested, { apiKey: '[REDACTED]', label: 'safe' });
});

test('monitoring counters increment and snapshots do not expose mutable state', () => {
  monitoring.reset();
  monitoring.increment('paymentFailures');
  monitoring.increment('paymentFailures', 2);
  const snapshot = monitoring.snapshot();
  assert.equal(snapshot.paymentFailures, 3);
  snapshot.paymentFailures = 99;
  assert.equal(monitoring.snapshot().paymentFailures, 3);
  monitoring.reset();
});

test('database client arguments omit passwords and reject unsafe database names', () => {
  const args = clientArgs({ host: 'localhost', port: 5432, user: 'app', password: 'not-an-argument', database: 'store' });
  assert.deepEqual(args, ['--host', 'localhost', '--port', '5432', '--username', 'app', '--dbname', 'store', '--no-password']);
  assert.equal(args.includes('not-an-argument'), false);
  assert.throws(() => validateDatabaseName('store;DROP DATABASE store'), /unsupported characters/);
  assert.throws(() => validateDatabaseName('--defaults-file=backup.cnf'), /unsupported characters/);
});

test('request context returns a request ID and records status metrics without query strings', () => {
  monitoring.reset();
  const originalLog = console.log;
  const originalWarn = console.warn;
  const output = [];
  console.log = value => output.push(JSON.parse(value));
  console.warn = value => output.push(JSON.parse(value));
  try {
    const request = {
      get: () => 'client-request-123',
      method: 'GET',
      path: '/api/health',
      body: undefined
    };
    const response = new EventEmitter();
    response.statusCode = 401;
    response.setHeader = (name, value) => { response[name] = value; };
    requestContext(request, response, () => {});
    response.emit('finish');
    assert.equal(request.requestId, 'client-request-123');
    assert.equal(response['X-Request-ID'], 'client-request-123');
    assert.equal(monitoring.snapshot().unauthorizedResponses, 1);
    assert.equal(output[0].path, '/api/health');
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    monitoring.reset();
  }
});

test('failed uploads increment the upload failure counter', async () => {
  monitoring.reset();
  await assert.rejects(
    () => saveUpload({ name: 'sample.mp3', data: 'data:audio/mpeg;base64,QQ==' }, 'preview', 'audio'),
    /valid audio file/
  );
  assert.equal(monitoring.snapshot().uploadFailures, 1);
  monitoring.reset();
});

test('readiness reports database and storage failures without throwing', async () => {
  const readiness = await checkReadiness(
    { checkConnection: async () => { throw Object.assign(new Error('database unavailable'), { code: 'ECONNREFUSED' }); } },
    { databaseConfigured: true },
    {
      checkWritable: async area => {
        if (area === 'uploads' || area === 'certificates') throw Object.assign(new Error(`${area} unavailable`), { code: 'ENOENT' });
      }
    }
  );
  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.checks, {
    configuration: true,
    database: false,
    uploads: false,
    certificates: false
  });

  assert.equal(readiness.errors.length, 3);
  assert.equal(readiness.errors[0].dependency, 'database');
  assert.doesNotMatch(JSON.stringify(readiness.checks), /database unavailable|ECONNREFUSED/);
});

test('readiness succeeds when every dependency check passes', async () => {
  const readiness = await checkReadiness(
    { checkConnection: async () => {} },
    { databaseConfigured: true },
    { checkWritable: async () => {} }
  );
  assert.equal(readiness.ready, true);
  assert.deepEqual(readiness.checks, {
    configuration: true,
    database: true,
    uploads: true,
    certificates: true
  });
});
