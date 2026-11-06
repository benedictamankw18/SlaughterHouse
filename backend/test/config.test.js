const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const backendDirectory = path.join(__dirname, '..');
const validSecrets = {
  NODE_ENV: 'production',
  DOWNLOAD_SIGNING_SECRET: 'd'.repeat(32),
  CERTIFICATE_SIGNING_SECRET: 'c'.repeat(32),
  PAYSTACK_SECRET_KEY: ''
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
