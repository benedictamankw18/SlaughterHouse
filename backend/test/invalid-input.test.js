const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const express = require('express');
const { configureRequestBodyParsing } = require('../middleware/request-body');
const { requestValidation, sendError } = require('../middleware/validate');

function loadRouter(routePath, mocks) {
  const routeId = require.resolve(routePath);
  const originalRoute = require.cache[routeId];
  delete require.cache[routeId];
  const originalModules = new Map();

  for (const [modulePath, exports] of Object.entries(mocks)) {
    const id = require.resolve(modulePath);
    originalModules.set(id, require.cache[id]);
    const mockModule = new Module(id);
    mockModule.filename = id;
    mockModule.loaded = true;
    mockModule.exports = exports;
    require.cache[id] = mockModule;
  }

  try {
    const router = require(routePath);
    return {
      router,
      restore() {
        delete require.cache[routeId];
        if (originalRoute) require.cache[routeId] = originalRoute;
        for (const [id, originalModule] of originalModules) {
          if (originalModule) require.cache[id] = originalModule;
          else delete require.cache[id];
        }
      }
    };
  } catch (error) {
    delete require.cache[routeId];
    for (const [id, originalModule] of originalModules) {
      if (originalModule) require.cache[id] = originalModule;
      else delete require.cache[id];
    }
    throw error;
  }
}

async function requestFrom(router, path, { method = 'POST', body, rawBody, contentType = 'application/json' } = {}) {
  const app = express();
  app.use((request, response, next) => {
    request.requestId = 'req-invalid-input';
    response.locals.requestId = request.requestId;
    next();
  });
  configureRequestBodyParsing(app);
  app.use(requestValidation);
  app.use('/api', router);
  app.use((error, request, response, next) => {
    if (error.type === 'entity.parse.failed') {
      return sendError(response, 400, 'The JSON request body could not be parsed.', {
        code: 'INVALID_JSON',
        requestId: request.requestId
      });
    }
    next(error);
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const payload = rawBody ?? (body === undefined ? undefined : JSON.stringify(body));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method,
      headers: {
        ...(payload === undefined ? {} : { 'Content-Type': contentType, Connection: 'close' })
      },
      body: payload
    });
    return { status: response.status, body: await response.json() };
  } finally {
    if (server.listening) {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }
}

test('duplicate signup returns a conflict for MySQL and PostgreSQL unique violations', async () => {
  const duplicateErrors = [
    {
      error: Object.assign(new Error('Duplicate email'), {
        code: 'ER_DUP_ENTRY',
        sqlMessage: "Duplicate entry for key 'users.email'"
      }),
      message: 'An account with this email already exists.'
    },
    {
      error: Object.assign(new Error('Duplicate email'), {
        code: '23505',
        constraint: 'uq_users_email_lower',
        detail: 'Key (lower(email))=(person@example.test) already exists.'
      }),
      message: 'An account with this email already exists.'
    },
    {
      error: Object.assign(new Error('Duplicate phone'), {
        code: '23505',
        constraint: 'users_phone_key',
        detail: 'Key (phone)=(+233240000000) already exists.'
      }),
      message: 'An account with this phone number already exists.'
    }
  ];
  let duplicateError = duplicateErrors[0].error;
  const loaded = loadRouter('../routes/auth', {
    '../database': {
      run(query, parameters, callback) {
        callback(duplicateError);
      }
    },
    '../session-store': {
      customerLoginAttempts: new Map(),
      adminLoginAttempts: new Map(),
      requireCustomer: (request, response, next) => next(),
      requireAdmin: (request, response, next) => next(),
      deleteSession: async () => {}
    },
    '../config': {
      secureCookies: false,
      sessionDurationMs: 3600000,
      sessionCookieNames: { customer: 'customer', admin: 'admin' },
      frontendOrigin: 'https://store.example.test',
      apiPublicUrl: 'https://api.example.test'
    },
    '../services/security': { hashPassword: async () => 'password-hash', passwordMatches: async () => false, validatePassword: () => null },
    '../services/error-messages': { databaseError: () => 'database error' },
    '../services/account-tokens': { issueToken: async () => 'verification-token', consumeToken: async () => null },
    '../services/audit': { recordAuditSafely: async () => {} },
    '../services/rate-limit': { rateLimit: () => (request, response, next) => next() },
    '../services/email/outbox': {
      createEmailIdempotencyKey: () => 'verification-key',
      queueEmailSafely: async () => true
    },
    '../services/logger': { error() {}, info() {}, warn() {} }
  });

  try {
    for (const duplicate of duplicateErrors) {
      duplicateError = duplicate.error;
      const result = await requestFrom(loaded.router, '/auth/signup', {
        body: {
          email: 'person@example.test',
          firstName: 'First',
          lastName: 'Last',
          phone: '+233 24 000 0000',
          password: 'Password123',
          address: 'Accra'
        }
      });
      assert.equal(result.status, 409);
      assert.equal(result.body.error, duplicate.message);
    }
  } finally {
    loaded.restore();
  }
});

test('successful password reset revokes the user sessions in the password update transaction', async () => {
  const statements = [];
  const loaded = loadRouter('../routes/auth', {
    '../database': {
      transaction: async callback => callback({
        async run(query, parameters) {
          statements.push({ query, parameters });
          return { changes: 1 };
        }
      })
    },
    '../session-store': {
      customerLoginAttempts: new Map(),
      adminLoginAttempts: new Map(),
      requireCustomer: (request, response, next) => next(),
      requireAdmin: (request, response, next) => next(),
      deleteSession: async () => {}
    },
    '../config': {
      secureCookies: false,
      sessionDurationMs: 3600000,
      sessionCookieNames: { customer: 'customer', admin: 'admin' },
      frontendOrigin: 'https://store.example.test',
      apiPublicUrl: 'https://api.example.test'
    },
    '../services/security': {
      hashPassword: async password => `hashed:${password}`,
      passwordMatches: async () => false,
      validatePassword: () => null
    },
    '../services/error-messages': { databaseError: () => 'database error' },
    '../services/account-tokens': {
      issueToken: async () => 'verification-token',
      consumeToken: async () => ({ user_id: 17 })
    },
    '../services/audit': { recordAuditSafely: async () => {} },
    '../services/rate-limit': { rateLimit: () => (request, response, next) => next() },
    '../services/email/outbox': {
      createEmailIdempotencyKey: () => 'verification-key',
      queueEmailSafely: async () => true
    },
    '../services/logger': { error() {}, info() {}, warn() {} }
  });

  try {
    const result = await requestFrom(loaded.router, '/auth/reset-password', {
      body: { token: 'a'.repeat(64), password: 'NewPassword123' }
    });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { message: 'Password reset completed. You can now sign in with the new password.' });
    assert.deepEqual(statements, [
      { query: 'UPDATE users SET password_hash = ? WHERE id = ?', parameters: ['hashed:NewPassword123', 17] },
      { query: 'DELETE FROM user_sessions WHERE user_id = ?', parameters: [17] }
    ]);
  } finally {
    loaded.restore();
  }
});

test('verified PostgreSQL users can sign in despite folded unquoted aliases', async () => {
  const loaded = loadRouter('../routes/auth', {
    '../database': {
      get(query, parameters, callback) {
        const verifiedField = query.includes('AS "emailVerifiedAt"') ? 'emailVerifiedAt' : 'emailverifiedat';
        callback(null, {
          id: 7,
          name: 'Verified Customer',
          email: 'person@example.test',
          phone: '+233240000000',
          role: 'artist',
          password_hash: 'password-hash',
          [verifiedField]: new Date()
        });
      }
    },
    '../session-store': {
      customerLoginAttempts: new Map(),
      adminLoginAttempts: new Map(),
      createSession: async () => ({ token: 'session-token', csrfToken: 'csrf-token' }),
      requireCustomer: (request, response, next) => next(),
      requireAdmin: (request, response, next) => next(),
      deleteSession: async () => {}
    },
    '../config': {
      secureCookies: false,
      sessionDurationMs: 3600000,
      sessionCookieNames: { customer: 'customer', admin: 'admin' },
      frontendOrigin: 'https://store.example.test',
      apiPublicUrl: 'https://api.example.test'
    },
    '../services/security': { hashPassword: async () => 'password-hash', passwordMatches: async () => true, validatePassword: () => null },
    '../services/error-messages': { databaseError: () => 'database error' },
    '../services/account-tokens': { issueToken: async () => 'verification-token', consumeToken: async () => null },
    '../services/audit': { recordAuditSafely: async () => {} },
    '../services/rate-limit': { rateLimit: () => (request, response, next) => next() },
    '../services/email/outbox': {
      createEmailIdempotencyKey: () => 'verification-key',
      queueEmailSafely: async () => true
    },
    '../services/logger': { error() {}, info() {}, warn() {} }
  });

  try {
    const result = await requestFrom(loaded.router, '/auth/login', {
      body: { identifier: 'person@example.test', password: 'Password123' }
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.user.email, 'person@example.test');
  } finally {
    loaded.restore();
  }
});

test('malformed JSON receives a structured 400 response', async () => {
  const result = await requestFrom(express.Router(), '/test', {
    rawBody: '{"broken":',
    contentType: 'application/json'
  });
  assert.equal(result.status, 400);
  assert.deepEqual(result.body, {
    error: 'The JSON request body could not be parsed.',
    code: 'INVALID_JSON',
    requestId: 'req-invalid-input'
  });
});

test('malformed custom-request audio upload is rejected before saving', async () => {
  let saveCalled = false;
  const loaded = loadRouter('../routes/requests', {
    '../database': {
      get() { assert.fail('Malformed audio must be rejected before database access.'); },
      run() { assert.fail('Malformed audio must not be persisted.'); }
    },
    '../config': { beatRequestLicenseLabels: { basic: 'Basic' } },
    '../services/pricing': {
      getPricing: async () => ({ beatRequestLicensePrices: { basic: 10 } })
    },
    '../services/uploads': {
      saveUpload: async () => { saveCalled = true; return 'sample-audio-test.mp3'; },
      deleteUploads: async () => {}
    },
    '../session-store': { requireCustomer: (request, response, next) => next() }
  });

  try {
    const result = await requestFrom(loaded.router, '/requests', {
      body: {
        requestType: 'beat',
        name: 'Customer',
        email: 'person@example.test',
        details: 'Create a beat',
        license: 'basic',
        sampleAudio: {
          name: 'malware.exe',
          data: 'data:application/x-msdownload;base64,YQ=='
        }
      }
    });
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'Upload an MP3, M4A, MP4, WAV, or OGG audio file.');
    assert.equal(saveCalled, false);
  } finally {
    loaded.restore();
  }
});

test('unsupported payment methods are rejected before payment setup', async () => {
  const loaded = loadRouter('../routes/payments', {
    '../database': {},
    '../config': {
      apiPublicUrl: 'https://api.example.test',
      paymentCallbackUrl: new URL('https://store.example.test/payment-success.html'),
      paystackSecretKey: 'configured-test-secret',
      bookingServiceLabels: {}
    }
  });

  try {
    const result = await requestFrom(loaded.router, '/payments/initialize', {
      body: {
        name: 'Customer',
        email: 'person@example.test',
        items: [{ type: 'beat', name: 'Example beat', license: 'basic' }],
        paymentMethod: 'cash'
      }
    });
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'Choose Card or Mobile Money to continue.');
  } finally {
    loaded.restore();
  }
});

test('invalid certificate license IDs are rejected before database access', async () => {
  const loaded = loadRouter('../routes/certificates', {
    '../database': {
      get() { assert.fail('Invalid license IDs must be rejected before database access.'); },
      all() { assert.fail('Invalid license IDs must be rejected before database access.'); },
      run() { assert.fail('Invalid license IDs must be rejected before database access.'); }
    },
    '../session-store': {
      requireCustomer: (request, response, next) => {
        request.customer = { id: 7 };
        next();
      },
      requireAdmin: (request, response, next) => next()
    },
    '../services/rate-limit': { rateLimit: () => (request, response, next) => next() }
  });

  try {
    const result = await requestFrom(loaded.router, '/customer/licenses/not-an-id/certificate/details', {
      method: 'GET'
    });
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'License ID must be a positive whole number.');
  } finally {
    loaded.restore();
  }
});
