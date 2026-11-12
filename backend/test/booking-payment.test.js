const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const express = require('express');

function loadBookingsRouter({ unavailableTime = null, chargeQuote = null, flutterwave = null } = {}) {
  const routeId = require.resolve('../routes/bookings');
  const originals = new Map([[routeId, require.cache[routeId]]]);
  const calls = [];
  const rateLimitPolicies = [];
  const database = {
    async all() {
      return [];
    },
    async transaction(callback) {
      return callback({
        async all() {
          return [];
        },
        async run(query, parameters = []) {
          calls.push({ query, parameters, transaction: true });
          if (/INSERT INTO booking_availability/.test(query) && parameters[1] === unavailableTime) return { changes: 0 };
          return { changes: 1, lastID: 1 };
        }
      });
    },
    run(query, parameters = [], callback) {
      calls.push({ query, parameters, transaction: false });
      callback?.(null);
      return Promise.resolve({ changes: 1 });
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
      bookingServiceLabels: { mixtape: 'Mixtape' },
      paystackSecretKey: 'paystack-test-secret',
      paymentCallbackUrl: new URL('https://store.example.test/payment-success.html'),
      frontendOrigin: new URL('https://store.example.test')
    },
    '../services/pricing': {
      getPricing: async () => ({
        bookingFees: { mixtape: 700 },
        bookingRules: { epAlbumDiscountPercent: 20 }
      })
    },
    '../services/error-messages': { databaseError: () => 'database error' }
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
      createCheckout: flutterwave.createCheckout
    };
  }

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

  try {
    return {
      router: require('../routes/bookings'),
      calls,
      rateLimitPolicies,
      restore() {
        delete require.cache[routeId];
        for (const [id, original] of originals) {
          if (original) require.cache[id] = original;
          else delete require.cache[id];
        }
      }
    };
  } catch (error) {
    for (const [id, original] of originals) {
      if (original) require.cache[id] = original;
      else delete require.cache[id];
    }
    throw error;
  }
}

test('booking payment initialization uses a shared rate limit', () => {
  const loaded = loadBookingsRouter();
  try {
    assert.deepEqual(loaded.rateLimitPolicies.map(({ windowMs, max }) => ({ windowMs, max })), [
      { windowMs: 15 * 60 * 1000, max: 20 }
    ]);
  } finally {
    loaded.restore();
  }
});

async function postBooking(router, overrides = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/bookings/initialize-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Connection: 'close' },
      body: JSON.stringify({
        name: 'Customer',
        email: 'customer@example.test',
        phone: '+233240000000',
        service: 'mixtape',
        artistCount: 1,
        slots: [{ date: '2030-01-08', time: '11:00' }],
        details: 'Test booking',
        paymentMethod: 'card',
        timezone: 'Africa/Accra',
        durationMinutes: 140,
        ...overrides
      })
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('booking payment holds slots and creates its order before contacting Paystack', async () => {
  const loaded = loadBookingsRouter();
  const originalFetch = global.fetch;
  let callsAtPaystack = [];
  global.fetch = async (...args) => {
    if (!String(args[0]).startsWith('https://api.paystack.co/')) return originalFetch(...args);
    callsAtPaystack = loaded.calls.map(call => call.query);
    return {
      ok: true,
      async json() {
        return { status: true, data: { reference: 'PAYSTACK-1', authorization_url: 'https://paystack.example.test/checkout' } };
      }
    };
  };

  try {
    const result = await postBooking(loaded.router);
    assert.equal(result.status, 200);
    assert.equal(callsAtPaystack.length, 3);
    assert.match(callsAtPaystack[0], /pg_advisory_xact_lock/);
    assert.match(callsAtPaystack[1], /INSERT INTO booking_availability/);
    assert.match(callsAtPaystack[2], /INSERT INTO orders/);
    assert.ok(loaded.calls.some(call => /INSERT INTO payments/.test(call.query)));
  } finally {
    global.fetch = originalFetch;
    loaded.restore();
  }
});

test('booking payment does not call Paystack when a slot cannot be held', async () => {
  const loaded = loadBookingsRouter({ unavailableTime: '11:00' });
  const originalFetch = global.fetch;
  global.fetch = async (...args) => {
    if (!String(args[0]).startsWith('https://api.paystack.co/')) return originalFetch(...args);
    throw new Error('Paystack should not be called for an unavailable slot.');
  };

  try {
    const result = await postBooking(loaded.router);
    assert.equal(result.status, 409);
    assert.match(result.body.error, /already reserved/);
    assert.equal(loaded.calls.some(call => /INSERT INTO orders/.test(call.query)), false);
  } finally {
    global.fetch = originalFetch;
    loaded.restore();
  }
});

test('a definite Paystack initialization rejection marks the order failed and releases its hold', async () => {
  const loaded = loadBookingsRouter();
  const originalFetch = global.fetch;
  global.fetch = async (...args) => {
    if (!String(args[0]).startsWith('https://api.paystack.co/')) return originalFetch(...args);
    return {
      ok: false,
      async json() {
        return { status: false, message: 'Initialization rejected.' };
      }
    };
  };

  try {
    const result = await postBooking(loaded.router);
    assert.equal(result.status, 502);
    assert.equal(result.body.error, 'Initialization rejected.');
    assert.ok(loaded.calls.some(call => /UPDATE orders SET status/.test(call.query) && call.parameters[0] === 'failed'));
    assert.ok(loaded.calls.some(call => /booking_order_reference = \?/.test(call.query)));
  } finally {
    global.fetch = originalFetch;
    loaded.restore();
  }
});

test('an uncertain Paystack response retains the hold only until its expiry', async () => {
  const loaded = loadBookingsRouter();
  const originalFetch = global.fetch;
  global.fetch = async (...args) => {
    if (!String(args[0]).startsWith('https://api.paystack.co/')) return originalFetch(...args);
    throw new Error('Connection closed before the response was received.');
  };

  try {
    const result = await postBooking(loaded.router);
    assert.equal(result.status, 502);
    assert.match(result.body.error, /released automatically after 30 minutes/);
    assert.equal(loaded.calls.some(call => /SET status = 'available'/.test(call.query)), false);
  } finally {
    global.fetch = originalFetch;
    loaded.restore();
  }
});

test('USD booking checkout holds slots, stores the quoted charge, and uses Flutterwave', async () => {
  const checkoutRequests = [];
  const quote = {
    currency: 'USD',
    amount: 57.12,
    amountGhs: 714,
    midRate: 12.5,
    markupPercent: 2,
    decimals: 2,
    provider: 'flutterwave',
    source: 'admin_approved:open.er-api.com',
    quotedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
  };
  const loaded = loadBookingsRouter({
    chargeQuote: quote,
    flutterwave: {
      async createCheckout(input) {
        checkoutRequests.push(input);
        return {
          provider: 'flutterwave',
          providerReference: input.reference,
          authorizationUrl: 'https://flw.test/pay/booking',
          payload: { id: 77, link: 'https://flw.test/pay/booking' }
        };
      }
    }
  });
  const originalFetch = global.fetch;
  global.fetch = async (...args) => {
    if (String(args[0]).startsWith('https://api.paystack.co/')) {
      throw new Error('Paystack must not be called for a USD booking.');
    }
    return originalFetch(...args);
  };

  try {
    const result = await postBooking(loaded.router, { currency: 'USD' });
    assert.equal(result.status, 200);
    assert.equal(result.body.authorizationUrl, 'https://flw.test/pay/booking');
    assert.equal(result.body.amount, 57.12);
    assert.equal(result.body.currency, 'USD');

    assert.equal(checkoutRequests.length, 1);
    assert.equal(checkoutRequests[0].amount, 57.12);
    assert.equal(checkoutRequests[0].currency, 'USD');
    assert.equal(checkoutRequests[0].meta.order_reference, result.body.reference);
    assert.equal(checkoutRequests[0].meta.booking, true);

    assert.ok(loaded.calls.some(call => /INSERT INTO booking_availability/.test(call.query)));
    const orderInsert = loaded.calls.find(call => /INSERT INTO orders/.test(call.query));
    assert.equal(orderInsert.parameters[0], result.body.reference);
    assert.equal(orderInsert.parameters[3], 57.12);
    assert.equal(orderInsert.parameters[4], 'USD');
    assert.equal(orderInsert.parameters[6], 714);
    assert.equal(Number(orderInsert.parameters[7]), 12.5);
    assert.equal(Number(orderInsert.parameters[8]), 2);
    assert.equal(orderInsert.parameters[11], 'flutterwave');

    const paymentInsert = loaded.calls.find(call => /INSERT INTO payments/.test(call.query));
    assert.equal(paymentInsert.parameters[0], 'flutterwave');
    assert.equal(paymentInsert.parameters[3], 57.12);
    assert.equal(paymentInsert.parameters[4], 'USD');
    assert.equal(paymentInsert.parameters[5], 714);
  } finally {
    global.fetch = originalFetch;
    loaded.restore();
  }
});

test('foreign booking checkout is blocked before any hold is taken when charging is disabled', async () => {
  const loaded = loadBookingsRouter({
    chargeQuote: async () => {
      throw Object.assign(new Error('Charging in USD is not enabled yet.'), { code: 'FX_CHARGING_DISABLED' });
    }
  });
  try {
    const result = await postBooking(loaded.router, { currency: 'USD' });
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'FX_CHARGING_DISABLED');
    assert.equal(loaded.calls.some(call => /INSERT INTO booking_availability/.test(call.query)), false);
    assert.equal(loaded.calls.some(call => /INSERT INTO orders/.test(call.query)), false);
  } finally {
    loaded.restore();
  }
});
