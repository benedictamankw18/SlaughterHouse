const crypto = require('node:crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

function encodeBase32(buffer) {
  let output = '';
  let value = 0;
  let bits = 0;
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value) {
  const normalized = String(value || '').toUpperCase().replace(/=+$/g, '');
  if (!normalized || [...normalized].some(character => !BASE32_ALPHABET.includes(character))) {
    throw new Error('The saved administrator MFA secret is invalid.');
  }
  let output = '';
  let accumulator = 0;
  let bits = 0;
  const bytes = [];
  for (const character of normalized) {
    accumulator = (accumulator << 5) | BASE32_ALPHABET.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bytes.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  for (const byte of bytes) output += String.fromCharCode(byte);
  return Buffer.from(output, 'binary');
}

function generateTotpSecret() {
  return encodeBase32(crypto.randomBytes(20));
}

function totpAtCounter(secret, counter) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 15;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** TOTP_DIGITS);
  return String(value).padStart(TOTP_DIGITS, '0');
}

function matchingTotpCounter(secret, token, now = Date.now(), window = 1) {
  if (!/^\d{6}$/.test(String(token || ''))) return null;
  const currentCounter = Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);
  const supplied = Buffer.from(String(token));
  for (let offset = -window; offset <= window; offset += 1) {
    const counter = currentCounter + offset;
    if (counter < 0) continue;
    const expected = Buffer.from(totpAtCounter(secret, counter));
    if (crypto.timingSafeEqual(supplied, expected)) return counter;
  }
  return null;
}

function encryptionKey(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') < 32) {
    throw new Error('ADMIN_MFA_ENCRYPTION_KEY must be configured with at least 32 bytes.');
  }
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

function encryptSecret(secret, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(key), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

function decryptSecret(encrypted, key) {
  const [version, ivValue, tagValue, ciphertextValue] = String(encrypted || '').split('.');
  if (version !== 'v1' || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error('The saved administrator MFA secret is invalid.');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(key), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

function hashRecoveryCode(code) {
  const normalized = String(code || '').replace(/[-\s]/g, '').toLowerCase();
  if (!/^[a-f0-9]{20}$/.test(normalized)) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function createRecoveryCodes(count = 10) {
  const codes = Array.from({ length: count }, () => crypto.randomBytes(10).toString('hex').toUpperCase());
  return {
    codes,
    hashes: codes.map(code => crypto.createHash('sha256').update(code.toLowerCase()).digest('hex'))
  };
}

function createChallengeToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashChallengeToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

module.exports = {
  TOTP_PERIOD_SECONDS,
  createChallengeToken,
  createRecoveryCodes,
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  hashChallengeToken,
  hashRecoveryCode,
  matchingTotpCounter,
  totpAtCounter
};
