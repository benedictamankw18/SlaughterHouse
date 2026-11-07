const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const backendDirectory = path.join(__dirname, '..');
const validSecrets = {
  NODE_ENV: 'production',
  DOWNLOAD_SIGNING_SECRET: 'd'.repeat(32),
  CERTIFICATE_SIGNING_SECRET: 'c'.repeat(32),
  PAYSTACK_SECRET_KEY: '',
  ALLOW_EPHEMERAL_STORAGE: 'true'
};

function runConfig(overrides = {}) {
  return spawnSync(process.execPath, ['-e', "require('./config')"], {
    cwd: backendDirectory,
    encoding: 'utf8',
    env: { ...process.env, ...validSecrets, ...overrides }
  });
}

test('production accepts distinct signing secrets of at least 32 bytes', () => {
  const result = runConfig();
  assert.equal(result.status, 0, result.stderr);
});

test('production requires both signing secrets without falling back between them', () => {
  for (const [name, overrides] of [
    ['DOWNLOAD_SIGNING_SECRET', { DOWNLOAD_SIGNING_SECRET: '' }],
    ['CERTIFICATE_SIGNING_SECRET', { CERTIFICATE_SIGNING_SECRET: '' }]
  ]) {
    const result = runConfig(overrides);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(name));
  }
});

test('production rejects short or reused signing secrets', () => {
  const shortSecret = runConfig({ DOWNLOAD_SIGNING_SECRET: 'd'.repeat(31) });
  assert.notEqual(shortSecret.status, 0);
  assert.match(shortSecret.stderr, /at least 32 bytes/);

  const reusedSecret = runConfig({ CERTIFICATE_SIGNING_SECRET: validSecrets.DOWNLOAD_SIGNING_SECRET });
  assert.notEqual(reusedSecret.status, 0);
  assert.match(reusedSecret.stderr, /must be different/);
});

test('production measures secret minimums in UTF-8 bytes', () => {
  const result = runConfig({ DOWNLOAD_SIGNING_SECRET: 'é'.repeat(16) });
  assert.equal(result.status, 0, result.stderr);
});

test('production requires durable storage unless ephemeral media is explicitly allowed', () => {
  const result = runConfig({ ALLOW_EPHEMERAL_STORAGE: '' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /STORAGE_DRIVER=s3/);
});

test('Vercel derives same-origin API and frontend URLs and trusts its proxy', () => {
  const result = spawnSync(process.execPath, ['-e', "const config = require('./config'); process.stdout.write(JSON.stringify({ apiPublicUrl: config.apiPublicUrl, frontendOrigin: config.frontendOrigin, trustProxy: config.trustProxy }))"], {
    cwd: backendDirectory,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...validSecrets,
      VERCEL: '1',
      VERCEL_URL: 'store.example.test',
      API_PUBLIC_URL: '',
      STORAGE_DRIVER: 's3',
      S3_BUCKET: 'media-bucket',
      S3_REGION: 'auto',
      S3_ACCESS_KEY_ID: 'test-key',
      S3_SECRET_ACCESS_KEY: 'test-secret',
      FRONTEND_ORIGIN: ''
    }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    apiPublicUrl: 'https://store.example.test',
    frontendOrigin: 'https://store.example.test',
    trustProxy: true
  });
});

test('database readiness configuration recognizes DATABASE_URL', () => {
  const result = spawnSync(process.execPath, ['-e', "process.stdout.write(String(require('./config').databaseConfigured))"], {
    cwd: backendDirectory,
    encoding: 'utf8',
    env: { ...process.env, ...validSecrets, DATABASE_URL: 'postgresql://user:pass@localhost/store' }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'true');
});
