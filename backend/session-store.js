const crypto = require('node:crypto');
const config = require('./config');
const database = require('./database');
const { normalizeRole, hasRoleAccess, hasPermission } = require('./services/roles');

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

function identifySession(request, response, { optional = false, requiredRole = null, requiredPermission = null, property = null } = {}, next) {
  const loginMessage = requiredRole === 'admin' || requiredRole === 'super_admin'
    ? 'Admin login required.'
    : 'Customer login required.';
  const token = getBearerToken(request);
  if (!token) {
    request.role = 'visitor';
    if (optional) return next();
    return response.status(401).json({ error: loginMessage });
  }
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return response.status(401).json({ error: loginMessage });
  }
  get(
    `SELECT s.user_id AS id, u.name, u.email, u.phone, u.role
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP`,
    [hashToken(token)]
  ).then(async session => {
    if (!session) {
      if (optional) {
        request.role = 'visitor';
        return next();
      }
      return response.status(401).json({ error: loginMessage });
    }
    const role = normalizeRole(session.role);
    if (requiredRole && !hasRoleAccess(role, requiredRole)) {
      return response.status(403).json({ error: 'Your account does not have permission to access this resource.' });
    }
    if (requiredPermission && !hasPermission(role, requiredPermission)) {
      return response.status(403).json({ error: 'Your account does not have permission to access this resource.' });
    }
    await run('UPDATE user_sessions SET last_used_at = CURRENT_TIMESTAMP WHERE token_hash = ?', [hashToken(token)]);
    request.sessionToken = token;
    request.session = session;
    request.role = role;
    if (property) request[property] = session;
    if (!property && role === 'customer') request.customer = session;
    if (!property && (role === 'admin' || role === 'super_admin')) request.admin = session;
    next();
  }).catch(error => {
    console.error('Session validation failed:', error.code || error.message);
    response.status(500).json({ error: 'Could not validate the login session. Try again.' });
  });
}

function requireRole(requiredRole) {
  return async (request, response, next) => {
    identifySession(request, response, {
      requiredRole,
      property: requiredRole === 'admin' ? 'admin' : requiredRole === 'customer' ? 'customer' : null
    }, next);
  };
}

function requirePermission(requiredPermission) {
  return (request, response, next) => {
    identifySession(request, response, {
      requiredRole: requiredPermission.startsWith('admin:') ? 'admin' : null,
      requiredPermission,
      property: requiredPermission.startsWith('admin:') ? 'admin' : null
    }, next);
  };
}

module.exports = {
  adminLoginAttempts,
  customerLoginAttempts,
  getBearerToken,
  createSession,
  deleteSession,
  requireRole,
  requirePermission,
  requireAdmin: requireRole('admin'),
  requireCustomer: requireRole('customer'),
  requireSuperAdmin: requireRole('super_admin'),
  allowVisitor(request, response, next) {
    identifySession(request, response, { optional: true }, next);
  }
};
