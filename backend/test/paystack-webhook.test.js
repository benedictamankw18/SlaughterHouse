const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');
const express = require('express');
const { configureRequestBodyParsing } = require('../middleware/request-body');

function loadPaymentsRouter({ bookingSlotUnavailable = false, exchangeRate = { rate: 10 }, beat = null, chargeQuote = null, flutterwave = null, flutterwaveTransactionId = 99, transactionConflict = null } = {}) {
  const routeId = require.resolve('../routes/payments');
  const refundsId = require.resolve('../services/refunds');
  const orderPricingId = require.resolve('../services/order-pricing');
  const originalRoute = require.cache[routeId];
  const originalModules = new Map();
  originalModules.set(refundsId, require.cache[refundsId]);
  delete require.cache[refundsId];
  originalModules.set(orderPricingId, require.cache[orderPricingId]);
  delete require.cache[orderPricingId];
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
    provider: 'paystack',
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
          if (/JOIN payments p/.test(query)) {
            return parameters[0] === order.provider && String(parameters[1]) === String(flutterwaveTransactionId)
              ? { ...order }
              : null;
          }
          if (/provider_transaction_id = \? AND provider_reference <> \?/.test(query)) {
            return transactionConflict;
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
      const result = /FROM beats/.test(query)
        ? beat
        : /FROM orders WHERE reference = \?/.test(query) && parameters?.[0] === order.reference
          ? { ...order }
          : null;
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

  if (chargeQuote) {
    mocks['../services/fx'] = {
      QUOTE_TTL_MS: 15 * 60 * 1000,
      BOOKING_QUOTE_TTL_MS: 30 * 60 * 1000,
      isSupportedCurrency: currency => ['GHS', 'USD', 'NGN', 'GBP', 'EUR'].includes(String(currency || '').toUpperCase()),
      getChargeQuote: typeof chargeQuote === 'function' ? chargeQuote : async () => chargeQuote
    };
  }
  if (flutterwave) {
    mocks['../services/flutterwave'] = {
      isConfigured: () => flutterwave.configured !== false,
      hasWebhookHash: () => flutterwave.webhookHash !== undefined,
      verifyWebhookHash: value => value === flutterwave.webhookHash,
      verifyTransaction: flutterwave.verifyTransaction,
      createCheckout: flutterwave.createCheckout
    };
  }

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

async function getJson(router, path) {
  const app = express();
  app.use('/api', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      headers: { Connection: 'close' }
    });
    return { status: response.status, body: await response.json() };
  } finally {
    if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

async function postFlutterwaveWebhook(router, payload, { hash = 'flutterwave-webhook-secret' } = {}) {
  const rawBody = JSON.stringify(payload);
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
        'verif-hash': hash,
        Connection: 'close'
      },
      body: rawBody
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

test('USD cart checkout stores the quoted charge and uses Flutterwave', async () => {
  const checkoutRequests = [];
  const quote = {
    currency: 'USD',
    amount: 10.2,
    amountGhs: 127.5,
    midRate: 12.5,
    markupPercent: 2,
    decimals: 2,
    provider: 'flutterwave',
    source: 'admin_approved:open.er-api.com',
    quotedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
  };
  const loaded = loadPaymentsRouter({
    beat: { id: 8, title: 'Foreign Beat', price: 12.5 },
    chargeQuote: quote,
    flutterwave: {
      async createCheckout(input) {
        checkoutRequests.push(input);
        return {
          provider: 'flutterwave',
          providerReference: input.reference,
          authorizationUrl: 'https://flw.test/pay/abc',
          payload: { id: 55, link: 'https://flw.test/pay/abc' }
        };
      }
    }
  });
  try {
    const result = await postJson(loaded.router, '/payments/initialize', {
      name: 'Customer',
      email: 'customer@example.test',
      items: [{ type: 'beat', name: 'Foreign Beat', license: 'basic' }],
      paymentMethod: 'card',
      currency: 'USD'
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.authorizationUrl, 'https://flw.test/pay/abc');
    assert.equal(result.body.amount, 10.2);
    assert.equal(result.body.currency, 'USD');

    assert.equal(checkoutRequests.length, 1);
    assert.equal(checkoutRequests[0].amount, 10.2);
    assert.equal(checkoutRequests[0].currency, 'USD');
    assert.deepEqual(checkoutRequests[0].meta, { order_reference: result.body.reference });

    const orderInsert = loaded.calls.find(call => /INSERT INTO orders/.test(call.query));
    assert.equal(orderInsert.parameters[0], result.body.reference);
    assert.equal(orderInsert.parameters[3], 10.2);
    assert.equal(orderInsert.parameters[4], 'USD');
    assert.equal(orderInsert.parameters[6], 127.5);
    assert.equal(Number(orderInsert.parameters[7]), 12.5);
    assert.equal(Number(orderInsert.parameters[8]), 2);
    assert.equal(orderInsert.parameters[9], 'admin_approved:open.er-api.com');
    assert.ok(orderInsert.parameters[10] instanceof Date);
    assert.equal(orderInsert.parameters[11], 'flutterwave');

    const paymentInsert = loaded.calls.find(call => /INSERT INTO payments/.test(call.query));
    assert.equal(paymentInsert.parameters[0], 'flutterwave');
    assert.equal(paymentInsert.parameters[2], 'pending');
    assert.equal(paymentInsert.parameters[3], 10.2);
    assert.equal(paymentInsert.parameters[4], 'USD');
    assert.equal(paymentInsert.parameters[5], 127.5);
  } finally {
    loaded.restore();
  }
});

test('foreign checkout is blocked with the FX error status when charging is disabled', async () => {
  const loaded = loadPaymentsRouter({
    beat: { id: 8, title: 'Foreign Beat', price: 12.5 },
    chargeQuote: async () => {
      throw Object.assign(new Error('Charging in USD is not enabled yet.'), { code: 'FX_CHARGING_DISABLED' });
    }
  });
  try {
    const result = await postJson(loaded.router, '/payments/initialize', {
      name: 'Customer',
      email: 'customer@example.test',
      items: [{ type: 'beat', name: 'Foreign Beat', license: 'basic' }],
      paymentMethod: 'card',
      currency: 'USD'
    });
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'FX_CHARGING_DISABLED');
    assert.equal(loaded.calls.some(call => /INSERT INTO orders/.test(call.query)), false);
  } finally {
    loaded.restore();
  }
});

test('checkout rejects currencies outside the supported set before pricing', async () => {
  const loaded = loadPaymentsRouter({ beat: { id: 8, title: 'Foreign Beat', price: 12.5 } });
  try {
    const result = await postJson(loaded.router, '/payments/initialize', {
      name: 'Customer',
      email: 'customer@example.test',
      items: [{ type: 'beat', name: 'Foreign Beat', license: 'basic' }],
      paymentMethod: 'card',
      currency: 'KES'
    });
    assert.equal(result.status, 400);
    assert.match(result.body.error, /Unsupported currency "KES"/);
    assert.equal(loaded.calls.some(call => /INSERT INTO orders/.test(call.query)), false);
  } finally {
    loaded.restore();
  }
});

test('payment quote returns the authoritative GHS amount and expiry for a cart', async () => {
  const loaded = loadPaymentsRouter({ beat: { id: 8, title: 'Quote Beat', price: 12.5 } });
  try {
    const result = await postJson(loaded.router, '/payments/quote', {
      items: [{ type: 'beat', name: 'Quote Beat', license: 'basic' }]
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.currency, 'GHS');
    assert.equal(result.body.amount, 125);
    assert.equal(result.body.amountGhs, 125);
    assert.equal(result.body.provider, 'paystack');
    assert.equal(result.body.source, 'catalog_ghs');
    assert.ok(Date.parse(result.body.expiresAt) > Date.parse(result.body.quotedAt));
    assert.deepEqual(result.body.items, [{
      type: 'beat',
      productId: 8,
      name: 'Quote Beat',
      license: 'basic',
      amountGhs: 125
    }]);
  } finally {
    loaded.restore();
  }
});

test('payment quote blocks foreign currencies until charging is enabled', async () => {
  const loaded = loadPaymentsRouter({ beat: { id: 8, title: 'Quote Beat', price: 12.5 } });
  try {
    const result = await postJson(loaded.router, '/payments/quote', {
      currency: 'USD',
      items: [{ type: 'beat', name: 'Quote Beat', license: 'basic' }]
    });
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'FX_CHARGING_DISABLED');
  } finally {
    loaded.restore();
  }
});

test('payment quote rejects unsupported currencies and empty carts', async () => {
  const loaded = loadPaymentsRouter({ beat: { id: 8, title: 'Quote Beat', price: 12.5 } });
  try {
    const unsupported = await postJson(loaded.router, '/payments/quote', {
      currency: 'KES',
      items: [{ type: 'beat', name: 'Quote Beat', license: 'basic' }]
    });
    assert.equal(unsupported.status, 400);
    assert.equal(unsupported.body.code, 'FX_CURRENCY_UNSUPPORTED');

    const empty = await postJson(loaded.router, '/payments/quote', { items: [] });
    assert.equal(empty.status, 400);
    assert.match(empty.body.error, /between 1 and 100 items/);
  } finally {
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

test('payment initialization, quote, verification, and webhook routes use shared rate limits', () => withRouter(async loaded => {
  assert.deepEqual(loaded.rateLimitPolicies.map(({ windowMs, max }) => ({ windowMs, max })), [
    { windowMs: 15 * 60 * 1000, max: 20 },
    { windowMs: 15 * 60 * 1000, max: 120 },
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

test('Paystack success webhook rejects an order created for Flutterwave', () => withRouter(async loaded => {
  loaded.order.provider = 'flutterwave';
  const result = await postWebhook(loaded.router, {
    event: 'charge.success',
    data: {
      id: 55,
      reference: loaded.order.reference,
      status: 'success',
      amount: 12500,
      currency: 'GHS'
    }
  });

  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'Payment provider does not match the order provider.');
  assert.ok(!loaded.calls.some(({ query, parameters }) =>
    /UPDATE orders SET status = \?/.test(query) && parameters[0] === 'paid'));
  assert.ok(!loaded.calls.some(({ query }) => /INSERT INTO payments/.test(query)));
}));

test('Flutterwave success webhook rejects an order created for Paystack', async () => {
  const loaded = loadPaymentsRouter({
    flutterwave: {
      webhookHash: 'flutterwave-webhook-secret',
      async verifyTransaction() {
        return {
          provider: 'flutterwave',
          reference: loaded.order.reference,
          transactionId: 99,
          status: 'successful',
          amount: 125,
          currency: 'GHS',
          raw: { id: 99, tx_ref: loaded.order.reference, status: 'successful', amount: 125, currency: 'GHS' }
        };
      }
    }
  });
  try {
    const result = await postFlutterwaveWebhook(loaded.router, {
      event: 'charge.completed',
      data: { id: 99, tx_ref: loaded.order.reference, status: 'successful', amount: 125, currency: 'GHS' }
    });

    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'Payment provider does not match the order provider.');
    assert.ok(!loaded.calls.some(({ query, parameters }) =>
      /UPDATE orders SET status = \?/.test(query) && parameters[0] === 'paid'));
  } finally {
    loaded.restore();
  }
});

test('Paystack failure webhook rejects an order created for Flutterwave', () => withRouter(async loaded => {
  loaded.order.provider = 'flutterwave';
  const result = await postWebhook(loaded.router, {
    event: 'charge.failed',
    data: {
      id: 56,
      reference: loaded.order.reference,
      status: 'failed',
      amount: 12500,
      currency: 'GHS'
    }
  });

  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'Payment provider does not match the order provider.');
  assert.ok(!loaded.calls.some(({ query }) => /INSERT INTO payments/.test(query)));
}));

test('Paystack refund webhook rejects an order created for Flutterwave', () => withRouter(async loaded => {
  loaded.order.provider = 'flutterwave';
  const result = await postWebhook(loaded.router, {
    event: 'refund.processed',
    data: {
      id: 96,
      transaction: { reference: loaded.order.reference },
      amount: 2500,
      currency: 'GHS',
      reason: 'Customer request'
    }
  });

  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'Payment provider does not match the order provider.');
  assert.ok(!loaded.calls.some(({ query }) => /UPDATE orders SET status = \?, refunded_amount/.test(query)));
}));

test('webhook rejects a provider transaction id already recorded for another order', async () => {
  const loaded = loadPaymentsRouter({
    transactionConflict: { id: 7, order_id: 99, provider_reference: 'UBB-OTHER-ORDER' }
  });
  try {
    const result = await postWebhook(loaded.router, {
      event: 'charge.success',
      data: {
        id: 55,
        reference: loaded.order.reference,
        status: 'success',
        amount: 12500,
        currency: 'GHS'
      }
    });

    assert.equal(result.status, 409);
    assert.equal(result.body.error, 'This payment transaction has already been recorded for another order.');
    assert.ok(!loaded.calls.some(({ query, parameters }) =>
      /UPDATE orders SET status = \?/.test(query) && parameters[0] === 'paid'));
  } finally {
    loaded.restore();
  }
});

test('webhook rejects an order whose stored provider is not recognized', () => withRouter(async loaded => {
  loaded.order.provider = 'stripe';
  const result = await postWebhook(loaded.router, {
    event: 'charge.success',
    data: {
      id: 55,
      reference: loaded.order.reference,
      status: 'success',
      amount: 12500,
      currency: 'GHS'
    }
  });

  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'Payment provider does not match the order provider.');
  assert.ok(!loaded.calls.some(({ query, parameters }) =>
    /UPDATE orders SET status = \?/.test(query) && parameters[0] === 'paid'));
  assert.ok(!loaded.calls.some(({ query }) => /INSERT INTO payments/.test(query)));
}));

test('verification rejects an order whose stored provider is not recognized', async () => {
  const loaded = loadPaymentsRouter();
  loaded.order.provider = 'stripe';
  const originalFetch = global.fetch;
  let providerCalled = false;
  global.fetch = async (url, ...args) => {
    if (String(url).startsWith('https://api.paystack.co/')) {
      providerCalled = true;
      throw new Error('No payment provider may be called for an unrecognized order provider.');
    }
    return originalFetch(url, ...args);
  };
  try {
    const result = await getJson(loaded.router, `/payments/verify/${loaded.order.reference}`);

    assert.equal(result.status, 500);
    assert.equal(result.body.error, 'This order has an unsupported payment provider.');
    assert.equal(providerCalled, false);
    assert.ok(!loaded.calls.some(({ query }) => /INSERT INTO payments/.test(query)));
  } finally {
    global.fetch = originalFetch;
    loaded.restore();
  }
});

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

test('Flutterwave success webhook re-verifies the charge before settling the order', async () => {
  const verifiedReferences = [];
  const loaded = loadPaymentsRouter({
    flutterwave: {
      webhookHash: 'flutterwave-webhook-secret',
      async verifyTransaction(reference) {
        verifiedReferences.push(reference);
        return {
          provider: 'flutterwave',
          reference: loaded.order.reference,
          transactionId: 99,
          status: 'successful',
          amount: 125,
          currency: 'GHS',
          raw: { id: 99, tx_ref: loaded.order.reference, status: 'successful', amount: 125, currency: 'GHS' }
        };
      }
    }
  });
  loaded.order.provider = 'flutterwave';
  try {
    // The webhook body lies about the amount; only the re-verified transaction may be trusted.
    const result = await postFlutterwaveWebhook(loaded.router, {
      event: 'charge.completed',
      data: {
        id: 99,
        tx_ref: loaded.order.reference,
        status: 'successful',
        amount: 1,
        currency: 'GHS'
      }
    });

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { received: true });
    assert.deepEqual(verifiedReferences, [loaded.order.reference]);
    assert.ok(loaded.calls.some(({ query, parameters }) =>
      /UPDATE orders SET status = \?/.test(query) && parameters[0] === 'paid'));
    const paymentInsert = loaded.calls.find(({ query }) => /INSERT INTO payments/.test(query));
    assert.equal(paymentInsert.parameters[1], 'flutterwave');
    assert.equal(paymentInsert.parameters[3], 99);
    assert.equal(paymentInsert.parameters[5], 125);
    assert.equal(paymentInsert.parameters[6], 'GHS');
  } finally {
    loaded.restore();
  }
});

test('Flutterwave webhooks reject a bad verif-hash before verifying the transaction', async () => {
  let verified = false;
  const loaded = loadPaymentsRouter({
    flutterwave: {
      webhookHash: 'flutterwave-webhook-secret',
      async verifyTransaction() {
        verified = true;
        return null;
      }
    }
  });
  try {
    const result = await postFlutterwaveWebhook(loaded.router, {
      event: 'charge.completed',
      data: { id: 99, tx_ref: loaded.order.reference, status: 'successful', amount: 125, currency: 'GHS' }
    }, { hash: 'wrong-hash' });

    assert.equal(result.status, 401);
    assert.equal(result.body.error, 'Invalid Flutterwave webhook signature.');
    assert.equal(verified, false);
  } finally {
    loaded.restore();
  }
});

test('Flutterwave amount mismatches are rejected without settling the order', async () => {
  const loaded = loadPaymentsRouter({
    flutterwave: {
      webhookHash: 'flutterwave-webhook-secret',
      async verifyTransaction() {
        return {
          provider: 'flutterwave',
          reference: loaded.order.reference,
          transactionId: 99,
          status: 'successful',
          amount: 124.99,
          currency: 'GHS',
          raw: { id: 99, tx_ref: loaded.order.reference, status: 'successful', amount: 124.99, currency: 'GHS' }
        };
      }
    }
  });
  loaded.order.provider = 'flutterwave';
  try {
    const result = await postFlutterwaveWebhook(loaded.router, {
      event: 'charge.completed',
      data: { id: 99, tx_ref: loaded.order.reference, status: 'successful', amount: 125, currency: 'GHS' }
    });

    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'Payment webhook amount could not be reconciled.');
    assert.equal(loaded.calls.some(({ query, parameters }) =>
      /UPDATE orders SET status = \?/.test(query) && parameters[0] === 'paid'), false);
  } finally {
    loaded.restore();
  }
});

test('a failed Flutterwave charge is recorded as a failed payment', async () => {
  const loaded = loadPaymentsRouter({
    flutterwave: {
      webhookHash: 'flutterwave-webhook-secret',
      async verifyTransaction() {
        return {
          provider: 'flutterwave',
          reference: loaded.order.reference,
          transactionId: 99,
          status: 'failed',
          amount: 125,
          currency: 'GHS',
          raw: { id: 99, tx_ref: loaded.order.reference, status: 'failed', amount: 125, currency: 'GHS' }
        };
      }
    }
  });
  loaded.order.provider = 'flutterwave';
  try {
    const result = await postFlutterwaveWebhook(loaded.router, {
      event: 'charge.completed',
      data: { id: 99, tx_ref: loaded.order.reference, status: 'failed', amount: 125, currency: 'GHS' }
    });

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { received: true });
    assert.ok(loaded.calls.some(({ query, parameters }) =>
      /UPDATE orders SET status = \?/.test(query) && parameters[0] === 'failed'));
    const paymentInsert = loaded.calls.find(({ query }) => /INSERT INTO payments/.test(query));
    assert.equal(paymentInsert.parameters[1], 'flutterwave');
    assert.equal(paymentInsert.parameters[4], 'failed');
  } finally {
    loaded.restore();
  }
});

test('unrelated Flutterwave events are acknowledged and ignored', async () => {
  let verified = false;
  const loaded = loadPaymentsRouter({
    flutterwave: {
      webhookHash: 'flutterwave-webhook-secret',
      async verifyTransaction() {
        verified = true;
        return null;
      }
    }
  });
  try {
    const result = await postFlutterwaveWebhook(loaded.router, { event: 'transfer.completed', data: { id: 1 } });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { received: true, ignored: true });
    assert.equal(verified, false);
  } finally {
    loaded.restore();
  }
});

test('a Flutterwave refund webhook applies the refund by provider transaction id', async () => {
  const loaded = loadPaymentsRouter({
    flutterwave: { webhookHash: 'flutterwave-webhook-secret' },
    flutterwaveTransactionId: 99
  });
  loaded.order.provider = 'flutterwave';
  loaded.order.status = 'paid';
  loaded.order.refunded_amount = 0;
  try {
    const result = await postFlutterwaveWebhook(loaded.router, {
      id: 55,
      AmountRefunded: 25,
      status: 'completed',
      TransactionId: 99,
      destination: 'payment_source'
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
  } finally {
    loaded.restore();
  }
});

test('Flutterwave verification settles a USD order using the stored charge', async () => {
  const loaded = loadPaymentsRouter({
    flutterwave: {
      async verifyTransaction(reference) {
        assert.equal(reference, 'UBB-USD-1');
        return {
          provider: 'flutterwave',
          reference,
          transactionId: 77,
          status: 'successful',
          amount: 10.2,
          currency: 'USD',
          raw: { id: 77, tx_ref: reference, status: 'successful', amount: 10.2, currency: 'USD' }
        };
      }
    }
  });
  Object.assign(loaded.order, {
    reference: 'UBB-USD-1',
    provider: 'flutterwave',
    amount: 10.2,
    amount_ghs: 127.5,
    currency: 'USD'
  });
  try {
    const result = await getJson(loaded.router, '/payments/verify/UBB-USD-1');
    assert.equal(result.status, 200);
    assert.equal(result.body.status, 'success');
    assert.equal(result.body.reference, 'UBB-USD-1');
    const paymentInsert = loaded.calls.find(({ query }) => /INSERT INTO payments/.test(query));
    assert.equal(paymentInsert.parameters[1], 'flutterwave');
    assert.equal(paymentInsert.parameters[5], 10.2);
    assert.equal(paymentInsert.parameters[6], 'USD');
    assert.equal(paymentInsert.parameters[7], 127.5);
  } finally {
    loaded.restore();
  }
});

test('Flutterwave verification rejects an amount that does not match the stored charge', async () => {
  const loaded = loadPaymentsRouter({
    flutterwave: {
      async verifyTransaction(reference) {
        return {
          provider: 'flutterwave',
          reference,
          transactionId: 77,
          status: 'successful',
          amount: 10.19,
          currency: 'USD',
          raw: { id: 77, tx_ref: reference, status: 'successful', amount: 10.19, currency: 'USD' }
        };
      }
    }
  });
  Object.assign(loaded.order, {
    reference: 'UBB-USD-2',
    provider: 'flutterwave',
    amount: 10.2,
    amount_ghs: 127.5,
    currency: 'USD'
  });
  try {
    const result = await getJson(loaded.router, '/payments/verify/UBB-USD-2');
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'Payment amount could not be verified.');
    assert.equal(loaded.calls.some(({ query, parameters }) =>
      /UPDATE orders SET status = \?/.test(query) && parameters[0] === 'paid'), false);
  } finally {
    loaded.restore();
  }
});
