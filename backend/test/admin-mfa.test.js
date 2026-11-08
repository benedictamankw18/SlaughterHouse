const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createChallengeToken,
  createRecoveryCodes,
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  hashChallengeToken,
  hashRecoveryCode,
  matchingTotpCounter,
  totpAtCounter
} = require('../services/admin-mfa');

const encryptionKey = 'test-admin-mfa-encryption-key-32-bytes';

test('TOTP matches RFC 4226 SHA-1 test vector and validates a bounded time window', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(totpAtCounter(secret, 1), '287082');
  const now = 1_700_000_000_000;
  const counter = Math.floor(now / 1000 / 30);
  assert.equal(matchingTotpCounter(secret, totpAtCounter(secret, counter), now), counter);
  assert.equal(matchingTotpCounter(secret, 'invalid', now), null);
});

test('generated TOTP secrets use encrypted, authenticated storage', () => {
  const secret = generateTotpSecret();
  const encrypted = encryptSecret(secret, encryptionKey);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptSecret(encrypted, encryptionKey), secret);
  assert.throws(() => decryptSecret(encrypted, 'a-different-key-with-at-least-32-bytes'));
  assert.throws(() => encryptSecret(secret, 'short'));
});

test('recovery codes are random, hashed, and normalized before lookup', () => {
  const { codes, hashes } = createRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.every(code => /^[A-F0-9]{20}$/.test(code)));
  assert.deepEqual(codes.map(hashRecoveryCode), hashes);
  assert.equal(hashRecoveryCode('not-a-recovery-code'), null);
});

test('MFA challenge tokens are unguessable and stored as one-way hashes', () => {
  const first = createChallengeToken();
  const second = createChallengeToken();
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
  assert.notEqual(hashChallengeToken(first), first);
});
