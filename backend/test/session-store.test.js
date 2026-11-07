const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadSessionStore(session) {
  const moduleId = require.resolve('../session-store');
  const originals = new Map([
    [moduleId, require.cache[moduleId]],
    [require.resolve('../database'), require.cache[require.resolve('../database')]],
    [require.resolve('../config'), require.cache[require.resolve('../config')]],
    [require.resolve('../services/logger'), require.cache[require.resolve('../services/logger')]]
  ]);
  const database = {
    get(query, parameters, callback) { callback(null, session); },
    run(query, parameters, callback) { callback.call({ changes: 1 }, null); }
  };
  const mocks = [
    ['../database', database],
    ['../config', {
      sessionCookieNames: { customer: 'customer_session', admin: 'admin_session' },
      secureCookies: false,
      sessionDurationMs: 60 * 60 * 1000
    }],
    ['../services/logger', { error() {}, info() {}, warn() {} }]
  ];
  delete require.cache[moduleId];
  for (const [dependency, exports] of mocks) {
    const id = require.resolve(dependency);
    const mockModule = new Module(id);
    mockModule.filename = id;
    mockModule.loaded = true;
    mockModule.exports = exports;
    require.cache[id] = mockModule;
  }
  return {
    store: require('../session-store'),
    restore() {
      delete require.cache[moduleId];
      for (const [id, original] of originals) {
        if (original) require.cache[id] = original;
        else delete require.cache[id];
      }
    }
  };
}

function authorize(store) {
  return new Promise(resolve => {
    const result = { headers: {} };
    const response = {
      setHeader(name, value) { result.headers[name] = value; return this; },
      status(statusCode) { result.status = statusCode; return this; },
      json(body) { result.body = body; resolve(result); }
    };
    const request = {
      get(name) { return name.toLowerCase() === 'authorization' ? `Bearer ${'a'.repeat(64)}` : ''; }
    };
    store.requireAdmin(request, response, () => resolve({ next: true, request }));
  });
}

test('administrator sessions without MFA enrollment are rejected and their cookie is cleared', async () => {
  const loaded = loadSessionStore({
    id: 8,
    csrfTokenHash: 'b'.repeat(64),
    name: 'Admin',
    email: 'admin@example.test',
    role: 'admin',
    adminMfaEnabledAt: null
  });
  try {
    const result = await authorize(loaded.store);
    assert.equal(result.status, 403);
    assert.equal(result.body.code, 'ADMIN_MFA_REQUIRED');
    assert.match(result.headers['Set-Cookie'], /Max-Age=0/);
  } finally {
    loaded.restore();
  }
});

test('enrolled administrator sessions continue through normal authorization', async () => {
  const loaded = loadSessionStore({
    id: 8,
    csrfTokenHash: 'b'.repeat(64),
    name: 'Admin',
    email: 'admin@example.test',
    role: 'super_admin',
    adminMfaEnabledAt: new Date()
  });
  try {
    const result = await authorize(loaded.store);
    assert.equal(result.next, true);
    assert.equal(result.request.admin.id, 8);
  } finally {
    loaded.restore();
  }
});
