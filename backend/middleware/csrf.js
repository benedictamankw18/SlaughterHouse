const crypto = require('node:crypto');
const { isAllowedOrigin } = require('../services/cors-origin');
const { SAFE_METHODS, sendError } = require('./validate');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function hashesMatch(token, expectedHash) {
  if (!/^[a-f0-9]{64}$/i.test(token || '') || !/^[a-f0-9]{64}$/i.test(expectedHash || '')) return false;
  const actual = Buffer.from(hashToken(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function querySessionCsrfHash(database, token) {
  return new Promise((resolve, reject) => {
    database.get(
      'SELECT csrf_token_hash AS csrfTokenHash FROM user_sessions WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP',
      [hashToken(token)],
      (error, row) => error ? reject(error) : resolve(row?.csrfTokenHash || null)
    );
  });
}

function validateRequestOrigin(request, config) {
  const origin = request.get('Origin');
  if (origin) return isAllowedOrigin(origin, config.frontendOrigins, !config.isProduction);
  const referer = request.get('Referer');
  if (!referer) return true;
  try {
    return isAllowedOrigin(new URL(referer).origin, config.frontendOrigins, !config.isProduction);
  } catch {
    return false;
  }
}

function createCsrfProtection({ database, config }) {
  return function csrfProtection(request, response, next) {
    if (SAFE_METHODS.has(request.method) || request.path === '/api/payments/webhook') return next();
    if (!validateRequestOrigin(request, config)) {
      return sendError(response, 403, 'Request origin is not allowed.', { code: 'ORIGIN_NOT_ALLOWED' });
    }
    if (/^\/api\/(?:auth\/(?:signup|login|resend-verification|request-password-reset|reset-password|verify-email)|admin\/login)$/.test(request.path)) {
      return next();
    }

    const authHeader = request.get('Authorization') || '';
    if (/^Bearer\s+\S+/i.test(authHeader)) {
      request.authSource = 'bearer';
      return next();
    }

    const cookies = {};
    for (const part of String(request.get('Cookie') || '').split(';')) {
      const separator = part.indexOf('=');
      if (separator < 0) continue;
      try {
        cookies[part.slice(0, separator).trim()] = decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        continue;
      }
    }
    const sessionToken = cookies[config.sessionCookieNames.customer] || cookies[config.sessionCookieNames.admin];
    if (!sessionToken) return next();
    request.authSource = 'cookie';

    const csrfToken = request.get('X-CSRF-Token') || '';
    querySessionCsrfHash(database, sessionToken).then(csrfHash => {
      if (!csrfHash || !hashesMatch(csrfToken, csrfHash)) {
        return sendError(response, 403, 'This session requires a valid CSRF token. Sign in again if the session is old.', {
          code: 'CSRF_TOKEN_INVALID'
        });
      }
      next();
    }).catch(next);
  };
}

module.exports = { createCsrfProtection, hashesMatch, validateRequestOrigin };
