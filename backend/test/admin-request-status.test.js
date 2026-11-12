const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const express = require('express');
const { configureRequestBodyParsing } = require('../middleware/request-body');
const { requestValidation } = require('../middleware/validate');

function loadAdminRouter({ requestRecord, userRecord = null }) {
  const routeId = require.resolve('../routes/admin');
  const originalRoute = require.cache[routeId];
  const queuedEmails = [];
  const originals = new Map();

  const database = {
    all(query, parameters = [], callback) {
      if (typeof parameters === 'function') {
        callback = parameters;
        parameters = [];
      }
      let rows = [];
      if (/FROM customization_requests WHERE id = /.test(query)) rows = requestRecord ? [requestRecord] : [];
      else if (/SELECT name, email FROM users WHERE id = /.test(query)) rows = userRecord ? [userRecord] : [];
      callback?.(null, rows);
    },
    get(query, parameters = [], callback) {
      if (typeof parameters === 'function') callback = parameters;
      callback?.(null, null);
    },
    run(query, parameters = [], callback) {
      if (typeof parameters === 'function') callback = parameters;
      const summary = { changes: 1, lastID: 1 };
      callback?.call(summary, null);
      return Promise.resolve(summary);
    },
    transaction: async callback => callback({ run: async () => ({ changes: 1 }) })
  };

  const mocks = {
    '../database': database,
    '../config': {},
    '../session-store': {
      requireAdmin: (request, response, next) => {
        request.admin = { id: 42 };
        next();
      },
      requirePermission: () => (request, response, next) => next()
    },
    '../services/uploads': { saveUpload: async () => ({}), deleteUploads: async () => {} },
    '../services/error-messages': { databaseError: message => message },
    '../services/rate-limit': { rateLimit: () => (request, response, next) => next() },
    '../services/audit': { recordAuditSafely: () => {} },
    '../services/notifications': { createNotificationSafely: async () => {}, notifyAdminsSafely: async () => {} },
    '../services/email/outbox': {
      queueEmailSafely: async (db, payload) => {
        queuedEmails.push(payload);
        return true;
      }
    },
    '../services/booking-fulfillment': { fulfillPaidBooking: async () => {} },
    '../services/logger': { error() {}, info() {}, warn() {} },
    '../services/monitoring': { snapshot: async () => ({}) },
    '../services/storage': { publicUrl: () => '' },
    '../services/storage/response': { sendStoredFile: () => {} },
    '../services/flutterwave': { isConfigured: () => false, refundTransaction: async () => ({}) }
  };

  for (const [modulePath, exports] of Object.entries(mocks)) {
    const id = require.resolve(modulePath);
    originals.set(id, require.cache[id]);
    const mockModule = new Module(id);
    mockModule.filename = id;
    mockModule.loaded = true;
    mockModule.exports = exports;
    require.cache[id] = mockModule;
  }

  delete require.cache[routeId];
  try {
    const router = require('../routes/admin');
    return {
      router,
      queuedEmails,
      restore() {
        delete require.cache[routeId];
        if (originalRoute) require.cache[routeId] = originalRoute;
        for (const [id, original] of originals) {
          if (original) require.cache[id] = original;
          else delete require.cache[id];
        }
      }
    };
  } catch (error) {
    delete require.cache[routeId];
    if (originalRoute) require.cache[routeId] = originalRoute;
    for (const [id, original] of originals) {
      if (original) require.cache[id] = original;
      else delete require.cache[id];
    }
    throw error;
  }
}

async function requestFrom(router, path, { method = 'PATCH', body } = {}) {
  const app = express();
  app.use((request, response, next) => {
    request.requestId = 'req-request-status';
    response.locals.requestId = request.requestId;
    next();
  });
  configureRequestBodyParsing(app);
  app.use(requestValidation);
  app.use('/api', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Connection: 'close' },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('guest request status changes email the address stored on the request', async () => {
  const loaded = loadAdminRouter({
    requestRecord: {
      id: 9,
      user_id: null,
      product_name: 'Night Drive',
      request_type: 'beat',
      customer_name: 'Guest Artist',
      customer_email: 'guest@example.test',
      previous_status: 'new'
    }
  });
  try {
    const result = await requestFrom(loaded.router, '/admin/requests/9/status', {
      body: { status: 'quoted', quoteGhs: 500 }
    });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { id: 9, status: 'quoted', quoteGhs: 500, notes: null });
    assert.equal(loaded.queuedEmails.length, 1);
    assert.equal(loaded.queuedEmails[0].to, 'guest@example.test');
    assert.equal(loaded.queuedEmails[0].template, 'request_quoted');
    assert.equal(loaded.queuedEmails[0].data.name, 'Guest Artist');
  } finally {
    loaded.restore();
  }
});

test('registered request status changes still prefer the linked account email', async () => {
  const loaded = loadAdminRouter({
    requestRecord: {
      id: 10,
      user_id: 5,
      product_name: 'Custom chain',
      request_type: 'merchandise',
      customer_name: 'Stored Name',
      customer_email: 'stored@example.test',
      previous_status: 'reviewing'
    },
    userRecord: { name: 'Member Name', email: 'member@example.test' }
  });
  try {
    const result = await requestFrom(loaded.router, '/admin/requests/10/status', {
      body: { status: 'accepted' }
    });
    assert.equal(result.status, 200);
    assert.equal(loaded.queuedEmails.length, 1);
    assert.equal(loaded.queuedEmails[0].to, 'member@example.test');
    assert.equal(loaded.queuedEmails[0].template, 'request_accepted');
    assert.equal(loaded.queuedEmails[0].data.name, 'Member Name');
  } finally {
    loaded.restore();
  }
});

test('request status emails are not sent when the status did not change', async () => {
  const loaded = loadAdminRouter({
    requestRecord: {
      id: 11,
      user_id: null,
      product_name: 'Night Drive',
      request_type: 'beat',
      customer_name: 'Guest Artist',
      customer_email: 'guest@example.test',
      previous_status: 'quoted'
    }
  });
  try {
    const result = await requestFrom(loaded.router, '/admin/requests/11/status', {
      body: { status: 'quoted', quoteGhs: 500 }
    });
    assert.equal(result.status, 200);
    assert.equal(loaded.queuedEmails.length, 0);
  } finally {
    loaded.restore();
  }
});
