const test = require('node:test');
const assert = require('node:assert/strict');
const { passwordPattern, hashPassword, hashLegacyPassword, passwordMatches } = require('../services/security');

test('passwordPattern requires at least eight alphanumeric characters', () => {
  assert.equal(passwordPattern.test('Passw0rd'), true);
  assert.equal(passwordPattern.test('short1'), false);
  assert.equal(passwordPattern.test('has space1'), false);
  assert.equal(passwordPattern.test('symbols!123'), false);
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
