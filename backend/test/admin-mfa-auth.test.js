const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const express = require('express');
const { decryptSecret, hashChallengeToken, hashRecoveryCode, matchingTotpCounter, totpAtCounter } = require('../services/admin-mfa');

const encryptionKey = 'test-admin-mfa-encryption-key-32-bytes';

function loadAuthRouter() {
  const routeId = require.resolve('../routes/auth');
  const originals = new Map([[routeId, require.cache[routeId]]]);
  const user = {
    id: 7,
    name: 'MFA Administrator',
    email: 'admin@example.test',
    role: 'super_admin',
    password_hash: 'test-password-hash',
    adminMfaEnabledAt: null,
    adminMfaSecret: null,
    adminMfaLastCounter: null
  };
  const state = { challenge: null, recoveryCodes: new Set(), sessionsCreated: 0 };
  const database = {
    get(query, parameters, callback) {
      callback(null, /FROM users WHERE lower\(email\)/.test(query) ? { ...user } : null);
    },
    run(query, parameters, callback) {
      if (/DELETE FROM admin_mfa_challenges WHERE user_id/.test(query)) state.challenge = null;
      if (/INSERT INTO admin_mfa_challenges/.test(query)) {
        state.challenge = {
          id: 1,
          userId: parameters[0],
          tokenHash: parameters[1],
          purpose: parameters[2],
          pendingSecret: parameters[3],
          attemptCount: 0
        };
      }
      callback?.call({ lastID: 1, changes: 1 }, null);
      return Promise.resolve({ lastID: 1, changes: 1 });
    },
    async transaction(callback) {
      const transaction = {
        async get(query, parameters) {
          if (!state.challenge || state.challenge.tokenHash !== parameters[0]) return null;
          if (/purpose = \?/.test(query) && state.challenge.purpose !== parameters[1]) return null;
          if (state.challenge.purpose !== 'recovery_ack' && /admin_mfa_challenges/.test(query)) {
            return {
              id: state.challenge.id,
              userId: user.id,
              purpose: state.challenge.purpose,
              pendingSecret: state.challenge.pendingSecret,
              attemptCount: state.challenge.attemptCount,
              name: user.name,
              email: user.email,
              role: user.role,
              adminMfaSecret: user.adminMfaSecret,
              adminMfaLastCounter: user.adminMfaLastCounter
            };
          }
          if (state.challenge.purpose === 'recovery_ack' && /purpose = \?/.test(query)) {
            return { id: state.challenge.id, userId: user.id, name: user.name, email: user.email, role: user.role };
          }
          return null;
        },
        async run(query, parameters) {
          if (/SET admin_mfa_secret = \?, admin_mfa_enabled_at/.test(query)) {
            user.adminMfaSecret = parameters[0];
            user.adminMfaEnabledAt = new Date();
            user.adminMfaLastCounter = parameters[1];
          } else if (/SET admin_mfa_last_counter = \?/.test(query)) {
            user.adminMfaLastCounter = parameters[0];
          } else if (/SET purpose = \?, pending_secret = NULL/.test(query)) {
            state.challenge.purpose = parameters[0];
            state.challenge.pendingSecret = null;
          } else if (/UPDATE admin_mfa_challenges SET attempt_count/.test(query)) {
            state.challenge.attemptCount += 1;
          } else if (/DELETE FROM admin_mfa_challenges/.test(query)) {
            state.challenge = null;
          } else if (/INSERT INTO admin_mfa_recovery_codes/.test(query)) {
            state.recoveryCodes.add(parameters[1]);
          } else if (/UPDATE admin_mfa_recovery_codes SET used_at/.test(query)) {
            if (!state.recoveryCodes.has(parameters[1])) return { changes: 0 };
            state.recoveryCodes.delete(parameters[1]);
          }
          return { changes: 1 };
        }
      };
      return callback(transaction);
    }
  };
  const sessions = {
    adminLoginAttempts: new Map(),
    customerLoginAttempts: new Map(),
    async createSession() {
      state.sessionsCreated += 1;
      return { token: 'a'.repeat(64), csrfToken: 'b'.repeat(64) };
    },
    requireAdmin: (request, response, next) => next(),
    requireCustomer: (request, response, next) => next()
  };
  const mocks = {
    '../database': database,
    '../session-store': sessions,
    '../config': {
      sessionDurationMs: 60 * 60 * 1000,
      sessionCookieNames: { customer: 'customer_session', admin: 'admin_session' },
      secureCookies: false,
      adminMfaEncryptionKey: encryptionKey,
      frontendOrigin: 'https://store.example.test'
    },
    '../services/security': {
      hashPassword: async () => 'hash',
      passwordMatches: async () => true,
      validatePassword: () => null
    },
    '../services/rate-limit': { rateLimit: () => (request, response, next) => next() },
    '../services/audit': { recordAuditSafely: async () => {} },
    '../services/email/outbox': { createEmailIdempotencyKey: () => 'key', queueEmailSafely: async () => true },
    '../services/logger': { error() {}, info() {}, warn() {} },
    '../services/error-messages': { databaseError: () => 'database error' },
    '../services/account-tokens': { issueToken: async () => 'token', consumeToken: async () => null }
  };

  delete require.cache[routeId];
  for (const [modulePath, exports] of Object.entries(mocks)) {
    const id = require.resolve(modulePath);
    originals.set(id, require.cache[id]);
    const mockModule = new Module(id);
    mockModule.filename = id;
    mockModule.loaded = true;
    mockModule.exports = exports;
    require.cache[id] = mockModule;
  }

  return {
    router: require('../routes/auth'),
    state,
    user,
    restore() {
      delete require.cache[routeId];
      for (const [id, original] of originals) {
        if (original) require.cache[id] = original;
        else delete require.cache[id];
      }
    }
  };
}

async function post(router, path, body) {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Connection: 'close' },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('administrator enrollment requires TOTP and recovery-code acknowledgement before issuing a session', async () => {
  const loaded = loadAuthRouter();
  try {
    const login = await post(loaded.router, '/admin/login', { email: loaded.user.email, password: 'correct-password' });
    assert.equal(login.status, 200);
    assert.equal(login.body.mfaEnrollmentRequired, true);
    assert.equal(loaded.state.sessionsCreated, 0);

    const challenge = loaded.state.challenge;
    assert.equal(challenge.tokenHash, hashChallengeToken(login.body.challengeToken));
    const secret = decryptSecret(challenge.pendingSecret, encryptionKey);
    const currentCounter = Math.floor(Date.now() / 1000 / 30);
    const code = totpAtCounter(secret, currentCounter);
    const enrollment = await post(loaded.router, '/admin/mfa/verify', {
      challengeToken: login.body.challengeToken,
      code
    });
    assert.equal(enrollment.status, 200);
    assert.equal(enrollment.body.mfaSetupComplete, true);
    assert.equal(enrollment.body.recoveryCodes.length, 10);
    assert.ok(loaded.user.adminMfaEnabledAt);
    assert.equal(loaded.state.sessionsCreated, 0);

    const complete = await post(loaded.router, '/admin/mfa/complete', {
      challengeToken: login.body.challengeToken
    });
    assert.equal(complete.status, 200);
    assert.equal(complete.body.token, 'a'.repeat(64));
    assert.equal(loaded.state.sessionsCreated, 1);
  } finally {
    loaded.restore();
  }
});

test('administrator login requires a valid TOTP and consumes recovery codes once', async () => {
  const loaded = loadAuthRouter();
  try {
    const firstLogin = await post(loaded.router, '/admin/login', { email: loaded.user.email, password: 'correct-password' });
    const setupSecret = decryptSecret(loaded.state.challenge.pendingSecret, encryptionKey);
    const counter = Math.floor(Date.now() / 1000 / 30);
    const setup = await post(loaded.router, '/admin/mfa/verify', {
      challengeToken: firstLogin.body.challengeToken,
      code: totpAtCounter(setupSecret, counter)
    });
    const recoveryCode = setup.body.recoveryCodes[0];
    await post(loaded.router, '/admin/mfa/complete', { challengeToken: firstLogin.body.challengeToken });
    loaded.state.sessionsCreated = 0;

    const login = await post(loaded.router, '/admin/login', { email: loaded.user.email, password: 'correct-password' });
    assert.equal(login.body.mfaRequired, true);
    const invalid = await post(loaded.router, '/admin/mfa/verify', {
      challengeToken: login.body.challengeToken,
      code: 'not-a-code'
    });
    assert.equal(invalid.status, 401);
    assert.equal(loaded.state.sessionsCreated, 0);

    const challenge = loaded.state.challenge;
    const recoveryHash = hashRecoveryCode(recoveryCode);
    loaded.state.recoveryCodes.add(recoveryHash);
    const verified = await post(loaded.router, '/admin/mfa/verify', {
      challengeToken: login.body.challengeToken,
      code: recoveryCode
    });
    assert.equal(verified.status, 200);
    assert.equal(loaded.state.recoveryCodes.has(recoveryHash), false);
    assert.equal(loaded.state.sessionsCreated, 1);
    assert.ok(challenge);

    const retry = await post(loaded.router, '/admin/login', { email: loaded.user.email, password: 'correct-password' });
    const replay = await post(loaded.router, '/admin/mfa/verify', {
      challengeToken: retry.body.challengeToken,
      code: recoveryCode
    });
    assert.equal(replay.status, 401);
  } finally {
    loaded.restore();
  }
});

test('administrator MFA challenges are deleted after five invalid codes', async () => {
  const loaded = loadAuthRouter();
  try {
    const firstLogin = await post(loaded.router, '/admin/login', { email: loaded.user.email, password: 'correct-password' });
    const setupSecret = decryptSecret(loaded.state.challenge.pendingSecret, encryptionKey);
    const counter = Math.floor(Date.now() / 1000 / 30);
    await post(loaded.router, '/admin/mfa/verify', {
      challengeToken: firstLogin.body.challengeToken,
      code: totpAtCounter(setupSecret, counter)
    });
    await post(loaded.router, '/admin/mfa/complete', { challengeToken: firstLogin.body.challengeToken });

    const login = await post(loaded.router, '/admin/login', { email: loaded.user.email, password: 'correct-password' });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await post(loaded.router, '/admin/mfa/verify', {
        challengeToken: login.body.challengeToken,
        code: 'not-a-code'
      });
      assert.equal(result.status, 401);
    }

    assert.equal(loaded.state.challenge, null);
    assert.equal(loaded.state.sessionsCreated, 1);
  } finally {
    loaded.restore();
  }
});
