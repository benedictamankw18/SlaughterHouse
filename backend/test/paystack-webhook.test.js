const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');
const express = require('express');
const { configureRequestBodyParsing } = require('../middleware/request-body');

function loadPaymentsRouter({ bookingSlotUnavailable = false, exchangeRate = { rate: 10 }, beat = null } = {}) {
  const routeId = require.resolve('../routes/payments');
  const refundsId = require.resolve('../services/refunds');
  const originalRoute = require.cache[routeId];
  const originalModules = new Map();
  originalModules.set(refundsId, require.cache[refundsId]);
  delete require.cache[refundsId];
  const calls = [];
  const rateLimitPolicies = [];
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
      const pendingWebhookEvents = [];
      const tx = {
        async run(query, parameters = []) {
          calls.push({ query, parameters });
          if (bookingSlotUnavailable && /SET status = 'booked'/.test(query)) return { lastID: 1, changes: 0 };
          return { lastID: 1, changes: 1 };
        },
        async get(query, parameters = []) {
          calls.push({ query, parameters });
          if (/INSERT INTO payment_webhook_events/.test(query)) {
            const eventKey = `${parameters[1]}:${parameters[2]}`;
            if (webhookEvents.has(eventKey) || pendingWebhookEvents.includes(eventKey)) return null;
            pendingWebhookEvents.push(eventKey);
            return { id: 1 };
          }
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
      const result = await callback(tx);
      pendingWebhookEvents.forEach(eventKey => webhookEvents.add(eventKey));
      return result;
    },
    async get() { return null; },
    all(query, parameters, callback) {
      callback?.(null, []);
      return Promise.resolve([]);
    },
    get(query, parameters, callback) {
      const result = /FROM beats/.test(query) ? beat : null;
      callback?.(null, result);
      return Promise.resolve(result);
    },
    run(query, parameters, callback) {
      calls.push({ query, parameters });
      callback?.call({ lastID: 1, changes: 1 }, null);
      return Promise.resolve({ lastID: 1, changes: 1 });
    }
  };

  const mocks = {
    '../database': database,
    '../services/rate-limit': {
      rateLimit(policy) {
        rateLimitPolicies.push(policy);
        return (request, response, next) => next();
      }
    },
    '../config': {
      apiPublicUrl: 'https://api.example.test',
      paymentCallbackUrl: new URL('https://store.example.test/payment-success.html'),
      paystackSecretKey: 'paystack-test-secret',
      bookingServiceLabels: {},
      frontendOrigin: 'https://store.example.test'
    },
    '../services/pricing': {
      getPricing: async () => ({ beatDefaultPrices: {} }),
      getUsdGhsRate: async () => exchangeRate
    },
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
    rateLimitPolicies,
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

async function postJson(router, path, body) {
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
    if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
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

test('beat checkout snapshots the current rate and rounded GHS amount', async () => {
  const loaded = loadPaymentsRouter({
    exchangeRate: { rate: 12.345678, updatedAt: new Date().toISOString() },
    beat: { id: 8, title: 'Snapshot Beat', price: 12.5 }
  });
  const originalFetch = global.fetch;
  const paystackRequests = [];
  global.fetch = async (url, options) => {
    if (String(url).startsWith('http://127.0.0.1:')) return originalFetch(url, options);
    paystackRequests.push({ url, options: JSON.parse(options.body) });
    return {
      ok: true,
      async json() { return { status: true, data: { reference: 'paystack-snapshot-1', authorization_url: 'https://paystack.test/authorize' } }; }
    };
  };
  try {
    const result = await postJson(loaded.router, '/payments/initialize', {
      name: 'Customer',
      email: 'customer@example.test',
      items: [{ type: 'beat', name: 'Snapshot Beat', license: 'basic' }],
      paymentMethod: 'card'
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.authorizationUrl, 'https://paystack.test/authorize');
    assert.equal(paystackRequests[0].options.amount, 15432);
    const orderInsert = loaded.calls.find(call => /INSERT INTO orders/.test(call.query));
    assert.equal(result.body.reference, orderInsert.parameters[0]);
    assert.equal(paystackRequests[0].options.reference, result.body.reference);
    assert.equal(orderInsert.parameters[3], 154.32);
    assert.deepEqual(JSON.parse(orderInsert.parameters[5]), [{
      type: 'beat',
      productId: 8,
      name: 'Snapshot Beat',
      license: 'basic',
      priceUsd: 12.5,
      priceGhs: 154.32,
      exchangeRate: 12.345678
    }]);
  } finally {
    global.fetch = originalFetch;
    loaded.restore();
  }
});

test('Paystack booking success consumes the matching slot hold', () => withRouter(async loaded => {
  loaded.order.items_json = JSON.stringify([{
    type: 'booking',
    name: 'Mixtape',
    service: 'mixtape',
    feeGhs: 125,
    booking: {
      name: 'Customer',
      email: loaded.order.customer_email,
      phone: '+233240000000',
      artistCount: 1,
      sessionSlots: [{ date: '2030-01-08', time: '11:00' }]
    }
  }]);

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
  assert.ok(loaded.calls.some(({ query, parameters }) =>
    /SET status = 'booked', booking_order_reference = NULL, hold_expires_at = NULL/.test(query)
    && parameters.includes(loaded.order.reference)));
  assert.equal(loaded.calls.some(({ query }) => /INSERT INTO booking_availability/.test(query)), false);
}));

test('Paystack success with an expired booking hold marks the paid order for review', async () => {
  const loaded = loadPaymentsRouter({ bookingSlotUnavailable: true });
  try {
    loaded.order.items_json = JSON.stringify([{
      type: 'booking',
      name: 'Mixtape',
      service: 'mixtape',
      feeGhs: 125,
      booking: {
        name: 'Customer',
        email: loaded.order.customer_email,
        phone: '+233240000000',
        artistCount: 1,
        sessionSlots: [{ date: '2030-01-08', time: '11:00' }]
      }
    }]);

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
    assert.deepEqual(result.body, { received: true, conflict: 'booking_slot_unavailable' });
    assert.ok(loaded.calls.some(({ query, parameters }) =>
      /UPDATE orders SET status = \?, items_json = \?, fulfillment_review_required = TRUE/.test(query)
      && parameters[0] === 'paid'
      && parameters.includes('booking_slot_unavailable')));
    assert.ok(loaded.calls.some(({ query, parameters }) =>
      /INSERT INTO payments/.test(query) && parameters.includes('paid')));
  } finally {
    loaded.restore();
  }
});

test('payment initialization, verification, and webhook routes use shared rate limits', () => withRouter(async loaded => {
  assert.deepEqual(loaded.rateLimitPolicies.map(({ windowMs, max }) => ({ windowMs, max })), [
    { windowMs: 15 * 60 * 1000, max: 20 },
    { windowMs: 60 * 1000, max: 30 },
    { windowMs: 60 * 1000, max: 300 }
  ]);
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

test('a rejected Paystack event can be retried after reconciliation data is corrected', () => withRouter(async loaded => {
  const event = {
    event: 'charge.success',
    data: {
      reference: loaded.order.reference,
      status: 'success',
      amount: 12499,
      currency: 'GHS'
    }
  };
  const rejected = await postWebhook(loaded.router, event);
  event.data.amount = 12500;
  const retry = await postWebhook(loaded.router, event);

  assert.equal(rejected.status, 400);
  assert.equal(retry.status, 200);
  assert.deepEqual(retry.body, { received: true });
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
