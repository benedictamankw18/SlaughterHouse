const test = require('node:test');
const assert = require('node:assert/strict');
const { passwordPattern, validatePassword, hashPassword, hashLegacyPassword, passwordMatches } = require('../services/security');

test('passwordPattern requires a strong passphrase without spaces', () => {
  assert.equal(passwordPattern.test('Passw0rd!12345'), true);
  assert.equal(passwordPattern.test('Long Passphrase'), false);
  assert.equal(passwordPattern.test('short1'), false);
  assert.equal(passwordPattern.test('symbols!123'), false);
  assert.equal(passwordPattern.test('Password123'), false);
});

test('validatePassword blocks weak and common passwords', () => {
  assert.equal(validatePassword('StrongPassphrase!2024'), null);
  assert.equal(validatePassword('short1'), 'Password must be between 12 and 128 characters long.');
  assert.equal(validatePassword('has space1'), 'Password must be between 12 and 128 characters long.');
  assert.equal(validatePassword('Password123456'), 'Please choose a stronger password.');
});

test('hashPassword produces a verifiable scrypt hash with a random salt', async () => {
  const [first, second] = await Promise.all([hashPassword('Passw0rd'), hashPassword('Passw0rd')]);
  assert.match(first, /^scrypt\$32768\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
  assert.notEqual(first, second);
  assert.equal(await passwordMatches('Passw0rd', first), true);
  assert.equal(await passwordMatches('wrong-password', first), false);
});

test('legacy salt:hash passwords still verify', async () => {
  const legacy = hashLegacyPassword('LegacyPass1');
  assert.equal(await passwordMatches('LegacyPass1', legacy), true);
  assert.equal(await passwordMatches('legacyPass1', legacy), false);
});

test('empty or unrecognized stored hashes never match', async () => {
  assert.equal(await passwordMatches('anything', ''), false);
  assert.equal(await passwordMatches('anything', null), false);
  assert.equal(await passwordMatches('anything', 'not-a-hash'), false);
});
