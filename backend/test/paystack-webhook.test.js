const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');
const express = require('express');
const { configureRequestBodyParsing } = require('../middleware/request-body');

function loadPaymentsRouter() {
  const routeId = require.resolve('../routes/payments');
  const refundsId = require.resolve('../services/refunds');
  const originalRoute = require.cache[routeId];
  const originalModules = new Map();
  originalModules.set(refundsId, require.cache[refundsId]);
  delete require.cache[refundsId];
  const calls = [];
  const webhookEvents = new Set();
  const order = {
    id: 21,
    reference: 'UBB-PAYSTACK-21',
    customer_name: 'Customer',
    customer_email: 'customer@example.test',
    amount: 125,
    currency: 'GHS',
    status: 'pending',
    items_json: '[]'
  };

  const database = {
    async transaction(callback) {
      const tx = {
        async run(query, parameters = []) {
          calls.push({ query, parameters });
          if (/INSERT INTO payment_webhook_events/.test(query)) {
            const eventKey = parameters[1];
            if (webhookEvents.has(eventKey)) {
              throw Object.assign(new Error('Duplicate webhook event'), { code: 'ER_DUP_ENTRY' });
            }
            webhookEvents.add(eventKey);
          }
          return { lastID: 1, changes: 1 };
        },
        async get(query, parameters = []) {
          calls.push({ query, parameters });
          if (/FROM orders WHERE reference = \? FOR UPDATE/.test(query)) {
            return parameters[0] === order.reference ? { ...order } : null;
          }
          return null;
        },
        async all(query, parameters = []) {
          calls.push({ query, parameters });
          return [];
        }
      };
      return callback(tx);
    },
    async all() { return []; }
  };

  const mocks = {
    '../database': database,
    '../config': {
      apiPublicUrl: 'https://api.example.test',
      paymentCallbackUrl: new URL('https://store.example.test/payment-success.html'),
      paystackSecretKey: 'paystack-test-secret',
      usdToGhsRate: 10,
      bookingServiceLabels: {},
      frontendOrigin: 'https://store.example.test'
    },
    '../services/pricing': { getPricing: async () => ({ beatDefaultPrices: {} }) },
    '../services/booking': { normalizeBookingSlots: slots => slots },
    '../services/downloads': { getDownloadItems: async () => [] },
    '../services/error-messages': { databaseError: () => 'database error' },
    '../services/audit': { recordAuditSafely: async () => {} },
    '../services/notifications': {
      createNotificationSafely: async () => {},
      notifyAdminsSafely: async () => {}
    },
    '../services/license-rights': { loadLicenseRights: async () => ({}), rightsFor: () => ({}) },
    '../services/license-certificates': { issueCertificateRecord: async () => {} },
    '../services/email/outbox': {
      queueEmailSafely: async () => true,
      isEmailAddress: value => Boolean(value)
    },
    '../services/logger': { error() {}, info() {}, warn() {} }
  };

  delete require.cache[routeId];
  for (const [modulePath, exports] of Object.entries(mocks)) {
    const id = require.resolve(modulePath);
    originalModules.set(id, require.cache[id]);
    const mockModule = new Module(id);
    mockModule.filename = id;
    mockModule.loaded = true;
    mockModule.exports = exports;
    require.cache[id] = mockModule;
  }

  let router;
  try {
    router = require('../routes/payments');
  } catch (error) {
    delete require.cache[routeId];
    for (const [id, originalModule] of originalModules) {
      if (originalModule) require.cache[id] = originalModule;
      else delete require.cache[id];
    }
    throw error;
  }

  return {
    router,
    order,
    calls,
    restore() {
      delete require.cache[routeId];
      if (originalRoute) require.cache[routeId] = originalRoute;
      for (const [id, originalModule] of originalModules) {
        if (originalModule) require.cache[id] = originalModule;
        else delete require.cache[id];
      }
    }
  };
}

async function postWebhook(router, event, { signatureOverride } = {}) {
  const rawBody = JSON.stringify(event);
  const signature = signatureOverride || crypto
    .createHmac('sha512', 'paystack-test-secret')
    .update(rawBody)
    .digest('hex');
  const app = express();
  configureRequestBodyParsing(app);
  app.use('/api', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/payments/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': signature,
        Connection: 'close'
      },
      body: rawBody
    });
    return { status: response.status, body: await response.json() };
  } finally {
    if (server.listening) {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }
}

function withRouter(run) {
  const loaded = loadPaymentsRouter();
  return Promise.resolve()
    .then(() => run(loaded))
    .finally(() => loaded.restore());
}

test('Paystack success webhook reconciles the order and records a paid payment', () => withRouter(async loaded => {
  const result = await postWebhook(loaded.router, {
    event: 'charge.success',
    data: {
      reference: loaded.order.reference,
      status: 'success',
      amount: 12500,
      currency: 'GHS'
    }
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { received: true });
  assert.ok(loaded.calls.some(({ query, parameters }) =>
    /UPDATE orders SET status = \?/.test(query) && parameters[0] === 'paid'));
  assert.ok(loaded.calls.some(({ query, parameters }) =>
    /INSERT INTO payments/.test(query) && parameters.includes('paid')));
}));

test('Paystack failure webhook records failure without marking the order paid', () => withRouter(async loaded => {
  const result = await postWebhook(loaded.router, {
    event: 'charge.failed',
    data: {
      reference: loaded.order.reference,
      status: 'failed',
      amount: 12500,
      currency: 'GHS'
    }
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { received: true });
  assert.ok(loaded.calls.some(({ query, parameters }) =>
    /UPDATE orders SET status = \?/.test(query) && parameters[0] === 'failed'));
  assert.equal(loaded.calls.some(({ query, parameters }) =>
    /UPDATE orders SET status = \?/.test(query) && parameters[0] === 'paid'), false);
}));

test('Paystack amount and currency mismatches are rejected without settling the order', async () => {
  for (const mismatch of [
    { amount: 12499, currency: 'GHS' },
    { amount: 12500, currency: 'USD' }
  ]) {
    await withRouter(async loaded => {
      const result = await postWebhook(loaded.router, {
        event: 'charge.success',
        data: {
          reference: loaded.order.reference,
          status: 'success',
          ...mismatch
        }
      });

      assert.equal(result.status, 400);
      assert.equal(result.body.error, 'Payment webhook amount could not be reconciled.');
      assert.equal(loaded.calls.some(({ query }) => /UPDATE orders SET status/.test(query)), false);
    });
  }
});

test('Paystack success webhook with an unknown reference is rejected', () => withRouter(async loaded => {
  const result = await postWebhook(loaded.router, {
    event: 'charge.success',
    data: {
      reference: 'UBB-UNKNOWN-REFERENCE',
      status: 'success',
      amount: 12500,
      currency: 'GHS'
    }
  });

  assert.equal(result.status, 404);
  assert.equal(result.body.error, 'No order was found for payment reference UBB-UNKNOWN-REFERENCE.');
}));

test('duplicate Paystack webhook delivery is acknowledged without reprocessing', () => withRouter(async loaded => {
  const event = {
    event: 'charge.success',
    data: {
      reference: loaded.order.reference,
      status: 'success',
      amount: 12500,
      currency: 'GHS'
    }
  };
  const first = await postWebhook(loaded.router, event);
  const callsAfterFirstDelivery = loaded.calls.length;
  const duplicate = await postWebhook(loaded.router, event);

  assert.equal(first.status, 200);
  assert.deepEqual(duplicate.body, { received: true, duplicate: true });
  assert.equal(loaded.calls.length, callsAfterFirstDelivery + 1);
}));

test('Paystack refund webhook applies the refund to its referenced order', () => withRouter(async loaded => {
  loaded.order.status = 'paid';
  loaded.order.refunded_amount = 0;
  loaded.order.items_json = '[]';
  const result = await postWebhook(loaded.router, {
    event: 'refund.processed',
    data: {
      id: 95,
      transaction: { reference: loaded.order.reference },
      amount: 2500,
      currency: 'GHS',
      reason: 'Customer request'
    }
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    received: true,
    refund: { status: 'partially_refunded', full: false }
  });
  assert.ok(loaded.calls.some(({ query, parameters }) =>
    /UPDATE orders SET status = \?, refunded_amount = \?/.test(query)
    && parameters[0] === 'partially_refunded'
    && parameters[1] === 25));
}));
