const crypto = require('node:crypto');

const passwordPattern = /^(?=.{12,128}$)(?!\s)(?!.*\s$)\S+$/;
const commonlyCompromisedPasswords = new Set([
  'password', 'password123', 'password123456', 'passw0rd', 'welcome', 'letmein', 'admin', 'secret',
  'qwerty123', 'iloveyou', 'monkey', 'dragon', 'football', 'sunshine', 'princess'
]);
const SCRYPT_COST = 32768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;

function validatePassword(password) {
  if (typeof password !== 'string' || !password.length) return 'Password is required.';
  if (password.length < 12 || password.length > 128) return 'Password must be between 12 and 128 characters long.';
  if (/\s/.test(password)) return 'Password cannot contain spaces.';
  if (!passwordPattern.test(password)) return 'Password must contain at least 12 characters without spaces.';
  const normalized = password.trim().toLowerCase();
  if (commonlyCompromisedPasswords.has(normalized)) return 'Please choose a stronger password.';
  return null;
}

function hashLegacyPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${passwordHash}`;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const passwordHash = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEY_LENGTH, {
      N: SCRYPT_COST,
      r: SCRYPT_BLOCK_SIZE,
      p: SCRYPT_PARALLELIZATION,
      maxmem: 64 * 1024 * 1024
    }, (error, derivedKey) => error ? reject(error) : resolve(derivedKey));
  });
  return `scrypt$${SCRYPT_COST}$${SCRYPT_BLOCK_SIZE}$${SCRYPT_PARALLELIZATION}$${salt.toString('hex')}$${passwordHash.toString('hex')}`;
}

async function passwordMatches(password, storedHash) {
  const encodedHash = String(storedHash || '');
  if (encodedHash.startsWith('scrypt$')) {
    const [, cost, blockSize, parallelization, saltHex, hashHex] = encodedHash.split('$');
    if (!cost || !blockSize || !parallelization || !saltHex || !hashHex) return false;
    const expectedHash = await new Promise((resolve, reject) => {
      crypto.scrypt(password, Buffer.from(saltHex, 'hex'), Buffer.from(hashHex, 'hex').length, {
        N: Number(cost),
        r: Number(blockSize),
        p: Number(parallelization),
        maxmem: 64 * 1024 * 1024
      }, (error, derivedKey) => error ? reject(error) : resolve(derivedKey));
    });
    const storedBuffer = Buffer.from(hashHex, 'hex');
    return storedBuffer.length === expectedHash.length && crypto.timingSafeEqual(storedBuffer, expectedHash);
  }
  const [salt, hash] = String(storedHash || '').split(':');
  if (!salt || !hash) return false;
  const expectedHash = crypto.scryptSync(password, salt, 64).toString('hex');
  const storedBuffer = Buffer.from(hash, 'hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  return storedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(storedBuffer, expectedBuffer);
}

module.exports = { passwordPattern, validatePassword, hashPassword, hashLegacyPassword, passwordMatches };
