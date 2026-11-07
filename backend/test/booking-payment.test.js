const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const express = require('express');

function loadBookingsRouter({ unavailableTime = null } = {}) {
  const routeId = require.resolve('../routes/bookings');
  const originals = new Map([[routeId, require.cache[routeId]]]);
  const calls = [];
  const rateLimitPolicies = [];
  const database = {
    async transaction(callback) {
      return callback({
        async run(query, parameters = []) {
          calls.push({ query, parameters, transaction: true });
          if (/UPDATE booking_availability/.test(query) && parameters[2] === unavailableTime) return { changes: 0 };
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
      paymentCallbackUrl: new URL('https://store.example.test/payment-success.html')
    },
    '../services/pricing': { getPricing: async () => ({ bookingFees: { mixtape: 700 } }) },
    '../services/error-messages': { databaseError: () => 'database error' }
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

async function postBooking(router) {
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
        durationMinutes: 140
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
    assert.equal(callsAtPaystack.length, 2);
    assert.match(callsAtPaystack[0], /UPDATE booking_availability/);
    assert.match(callsAtPaystack[1], /INSERT INTO orders/);
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
