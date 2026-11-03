const crypto = require('node:crypto');

const TOKEN_EXPIRY_MS = {
  email_verification: 24 * 60 * 60 * 1000,
  password_reset: 60 * 60 * 1000
};

function run(database, query, parameters = []) {
  return new Promise((resolve, reject) => {
    database.run(query, parameters, function (error) {
      if (error) return reject(error);
      resolve(this);
    });
  });
}

function get(database, query, parameters = []) {
  return new Promise((resolve, reject) => {
    database.get(query, parameters, (error, row) => error ? reject(error) : resolve(row));
  });
}

function createRawToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function issueToken(database, userId, tokenType) {
  const expiry = TOKEN_EXPIRY_MS[tokenType];
  if (!expiry) throw new Error(`Unsupported account token type: ${tokenType}`);
  const rawToken = createRawToken();
  await run(database, 'UPDATE account_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND token_type = ? AND used_at IS NULL', [userId, tokenType]);
  await run(database, 'INSERT INTO account_tokens (user_id, token_hash, token_type, expires_at) VALUES (?, ?, ?, ?)', [userId, hashToken(rawToken), tokenType, new Date(Date.now() + expiry)]);
  return rawToken;
}

async function consumeToken(database, rawToken, tokenType) {
  if (typeof rawToken !== 'string' || !/^[a-f0-9]{64}$/i.test(rawToken)) return null;
  const token = await get(database, 'SELECT id, user_id FROM account_tokens WHERE token_hash = ? AND token_type = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP', [hashToken(rawToken), tokenType]);
  if (!token) return null;
  const result = await run(database, 'UPDATE account_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL', [token.id]);
  return result.changes === 1 ? token : null;
}

module.exports = { issueToken, consumeToken };
