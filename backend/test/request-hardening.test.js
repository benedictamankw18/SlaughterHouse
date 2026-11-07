const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createCsrfProtection, hashesMatch, validateRequestOrigin } = require('../middleware/csrf');
const { requestValidation, sendError } = require('../middleware/validate');
const { configureRequestBodyParsing } = require('../middleware/request-body');
const { securityHeaders } = require('../middleware/security-headers');
const { isAllowedOrigin } = require('../services/cors-origin');
const express = require('express');

const config = {
  isProduction: true,
  frontendOrigins: ['https://shop.example.test', 'https://admin.example.test'],
  sessionCookieNames: { customer: 'customer_session', admin: 'admin_session' }
};

function createRequest({ method = 'POST', path = '/api/customer/profile', headers = {}, body } = {}) {
  return {
    method,
    path,
    body,
    is: type => String(headers['Content-Type'] || '').split(';')[0] === type,
    get: name => headers[name] || headers[name.toLowerCase()]
  };
}

function createResponse() {
  const response = {
    locals: {},
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(status) { this.statusCode = status; return this; },
    json(body) { this.body = body; return this; },
    end() { this.ended = true; return this; },
    sendStatus(status) { this.statusCode = status; this.ended = true; return this; }
  };
  return response;
}

test('origin allowlist supports multiple origins and rejects null in strict mode', () => {
  assert.equal(isAllowedOrigin('https://admin.example.test', config.frontendOrigins), true);
  assert.equal(isAllowedOrigin('https://unknown.example.test', config.frontendOrigins), false);
  assert.equal(isAllowedOrigin('null', config.frontendOrigins), false);
  assert.equal(validateRequestOrigin(createRequest({ headers: { Origin: 'https://shop.example.test' } }), config), true);
  assert.equal(validateRequestOrigin(createRequest({ headers: { Origin: 'null' } }), config), false);
});

test('CSRF token comparison uses a hash and timing-safe equal-length comparison', () => {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  assert.equal(hashesMatch(token, hash), true);
  assert.equal(hashesMatch('invalid', hash), false);
  assert.equal(hashesMatch(token, 'not-a-hash'), false);
});

test('CSRF protection rejects cookie mutations without a matching server-verified token', async () => {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  const csrfHash = crypto.createHash('sha256').update(csrfToken).digest('hex');
  let queries = 0;
  const middleware = createCsrfProtection({
    config,
    database: {
      get(query, parameters, callback) {
        queries += 1;
        callback(null, { csrfTokenHash: csrfHash });
      }
    }
  });
  const run = headers => new Promise(resolve => {
    const request = createRequest({ headers: { Origin: 'https://shop.example.test', ...headers } });
    request.requestId = 'req-csrf';
    const response = createResponse();
    requestValidation(request, response, () => {
      middleware(request, response, error => resolve({ request, response, error, continued: !error && !response.body }));
    });
    setImmediate(() => resolve({ request, response, continued: !response.body }));
  });

  const missing = await run({ Cookie: 'customer_session=abc123' });
  assert.equal(missing.response.statusCode, 403);
  assert.equal(missing.response.body.code, 'CSRF_TOKEN_INVALID');
  assert.equal(missing.response.body.requestId, 'req-csrf');
  const valid = await run({ Cookie: 'customer_session=abc123', 'X-CSRF-Token': csrfToken });
  assert.equal(valid.continued, true);
  assert.equal(queries, 2);
});

test('CSRF skips bearer-auth mutations, safe requests, login, and the Paystack webhook', () => {
  let queries = 0;
  const middleware = createCsrfProtection({
    config,
    database: { get() { queries += 1; } }
  });
  for (const request of [
    createRequest({ headers: { Authorization: 'Bearer access-token', Origin: 'https://shop.example.test' } }),
    createRequest({ method: 'GET', headers: { Origin: 'https://shop.example.test' } }),
    createRequest({ path: '/api/auth/login', headers: { Cookie: 'customer_session=old', Origin: 'https://shop.example.test' } }),
    createRequest({ path: '/api/payments/webhook', headers: { Origin: 'null' } })
  ]) {
    let continued = false;
    middleware(request, createResponse(), error => {
      assert.equal(error, undefined);
      continued = true;
    });
    assert.equal(continued, true);
  }
  assert.equal(queries, 0);
});

test('origin validation rejects cross-origin mutations and permits referer validation', () => {
  const middleware = createCsrfProtection({ config, database: { get() {} } });
  const request = createRequest({ headers: { Origin: 'https://attacker.example.test' } });
  const response = createResponse();
  middleware(request, response, () => assert.fail('Cross-origin mutation should not continue.'));
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.code, 'ORIGIN_NOT_ALLOWED');

  assert.equal(validateRequestOrigin(createRequest({
    headers: { Referer: 'https://admin.example.test/account/profile' }
  }), config), true);
});

test('request validation adds request IDs and stable codes to errors', () => {
  const request = createRequest({
    headers: { 'Content-Type': 'application/json' },
    body: []
  });
  request.requestId = 'req-123';
  const response = createResponse();
  requestValidation(request, response, () => assert.fail('Array JSON body must be rejected.'));
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    error: 'The JSON request body must be an object.',
    code: 'INVALID_JSON_BODY',
    requestId: 'req-123'
  });

  const nextResponse = createResponse();
  nextResponse.locals.requestId = 'req-456';
  sendError(nextResponse, 413, 'Payload too large.', { code: 'PAYLOAD_TOO_LARGE' });
  assert.equal(nextResponse.body.requestId, 'req-456');
});

test('JSON payload limits reject oversized defaults and allow configured route limits', async () => {
  const app = express();
  app.use((request, response, next) => {
    request.requestId = 'req-body';
    next();
  });
  configureRequestBodyParsing(app);
  app.use(requestValidation);
  app.post(['/api/admin/beats', '/api/requests/custom', '/api/test'], (request, response) => {
    response.json({ accepted: true });
  });
  app.use((error, request, response, next) => {
    if (error.type === 'entity.too.large') {
      return sendError(response, 413, 'Request payload is too large.', {
        code: 'PAYLOAD_TOO_LARGE',
        requestId: request.requestId
      });
    }
    next(error);
  });

  const server = app.listen(0);
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const body = JSON.stringify({ value: 'x'.repeat(300 * 1024) });
    for (const path of ['/api/admin/beats', '/api/requests/custom']) {
      const response = await fetch(`${url}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Connection: 'close' },
        body
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { accepted: true });
    }

    const largeBeatPayload = JSON.stringify({ value: 'x'.repeat(36 * 1024 * 1024) });
    const largeBeatResponse = await fetch(`${url}/api/admin/beats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Connection: 'close' },
      body: largeBeatPayload
    });
    assert.equal(largeBeatResponse.status, 200, 'Admin beat uploads larger than 35 MB must be accepted.');
    assert.deepEqual(await largeBeatResponse.json(), { accepted: true });

    const oversized = await fetch(`${url}/api/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Connection: 'close' },
      body
    });
    assert.equal(oversized.status, 413);
    assert.deepEqual(await oversized.json(), {
      error: 'Request payload is too large.',
      code: 'PAYLOAD_TOO_LARGE',
      requestId: 'req-body'
    });
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('security headers are applied and authenticated JSON is not cached', () => {
  const request = { method: 'GET', path: '/api/customer/profile', sessionToken: 'authenticated' };
  const response = createResponse();
  response.json = body => { response.body = body; return response; };
  securityHeaders(request, response, () => {});
  assert.equal(response.headers['Content-Security-Policy'], "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  assert.equal(response.headers['Cross-Origin-Opener-Policy'], 'same-origin');
  assert.equal(response.headers['Cross-Origin-Resource-Policy'], 'same-site');
  response.json({ data: true });
  assert.equal(response.headers['Cache-Control'], 'no-store');

  const loginResponse = createResponse();
  loginResponse.json = body => { loginResponse.body = body; return loginResponse; };
  securityHeaders({ path: '/api/auth/login' }, loginResponse, () => {});
  loginResponse.json({ token: 'new-session-token' });
  assert.equal(loginResponse.headers['Cache-Control'], 'no-store');

  const publicUploadResponse = createResponse();
  publicUploadResponse.json = body => { publicUploadResponse.body = body; return publicUploadResponse; };
  securityHeaders({ method: 'GET', path: '/api/uploads/cover-example.webp' }, publicUploadResponse, () => {});
  assert.equal(publicUploadResponse.headers['Cross-Origin-Resource-Policy'], 'cross-origin');

  const uploadMutationResponse = createResponse();
  uploadMutationResponse.json = body => { uploadMutationResponse.body = body; return uploadMutationResponse; };
  securityHeaders({ method: 'POST', path: '/api/uploads/cover-example.webp' }, uploadMutationResponse, () => {});
  assert.equal(uploadMutationResponse.headers['Cross-Origin-Resource-Policy'], 'same-site');
});
