const crypto = require('node:crypto');
const config = require('./config');
const database = require('./database');

const adminLoginAttempts = new Map();
const customerLoginAttempts = new Map();

function getBearerToken(request) {
  const bearer = request.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (bearer) return bearer;
  const cookies = Object.fromEntries(String(request.get('Cookie') || '').split(';').map(part => part.trim().split('=').map(decodeURIComponent)).filter(parts => parts.length === 2));
  return cookies[config.sessionCookieNames.customer] || cookies[config.sessionCookieNames.admin];
}

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function run(query, parameters = []) {
  return new Promise((resolve, reject) => {
    database.run(query, parameters, function (error) {
      if (error) return reject(error);
      resolve(this);
    });
  });
}

function get(query, parameters = []) {
  return new Promise((resolve, reject) => {
    database.get(query, parameters, (error, row) => error ? reject(error) : resolve(row));
  });
}

async function createSession(value) {
  const token = createToken();
  await run(
    'INSERT INTO user_sessions (user_id, token_hash, role, expires_at) VALUES (?, ?, ?, ?)',
    [value.id, hashToken(token), value.role, new Date(Date.now() + config.sessionDurationMs)]
  );
  return token;
}

async function deleteSession(token) {
  if (!token) return;
  await run('DELETE FROM user_sessions WHERE token_hash = ?', [hashToken(token)]);
}

function requireSession(message, property, expectedRole) {
  return async (request, response, next) => {
    const token = getBearerToken(request);
    if (!token || !/^[a-f0-9]{64}$/i.test(token)) return response.status(401).json({ error: message });
    try {
      const session = await get(
        `SELECT s.user_id AS id, u.name, u.email, u.phone, u.role
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND ${expectedRole === 'customer' ? 's.role <> ?' : 's.role = ?'} AND s.expires_at > CURRENT_TIMESTAMP`,
        [hashToken(token), expectedRole === 'customer' ? 'admin' : expectedRole]
      );
      if (!session) return response.status(401).json({ error: message });
      await run('UPDATE user_sessions SET last_used_at = CURRENT_TIMESTAMP WHERE token_hash = ?', [hashToken(token)]);
      request.sessionToken = token;
      request.session = session;
      request[property] = session;
      next();
    } catch (error) {
      console.error('Session validation failed:', error.code || error.message);
      response.status(500).json({ error: 'Could not validate the login session. Try again.' });
    }
  };
}

module.exports = {
  adminLoginAttempts,
  customerLoginAttempts,
  getBearerToken,
  createSession,
  deleteSession,
  requireAdmin: requireSession('Admin login required.', 'admin', 'admin'),
  requireCustomer: requireSession('Customer login required.', 'customer', 'customer')
};
