const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadService({ secretKey = 'FLWSECK_TEST-example', webhookHash = 'webhook-secret', apiBase = 'https://flw.test/v3' } = {}) {
  const serviceId = require.resolve('../services/flutterwave');
  const configId = require.resolve('../config');
  const originals = new Map([
    [serviceId, require.cache[serviceId]],
    [configId, require.cache[configId]]
  ]);
  delete require.cache[serviceId];
  const configModule = new Module(configId);
  configModule.filename = configId;
  configModule.loaded = true;
  configModule.exports = {
    flutterwaveSecretKey: secretKey,
    flutterwaveWebhookHash: webhookHash,
    flutterwaveApiBase: apiBase
  };
  require.cache[configId] = configModule;
  const service = require('../services/flutterwave');
  return {
    service,
    restore() {
      delete require.cache[serviceId];
      for (const [id, original] of originals) {
        if (original) require.cache[id] = original;
        else delete require.cache[id];
      }
    }
  };
}

async function withFetch(fetchImpl, run) {
  const original = global.fetch;
  global.fetch = fetchImpl;
  try {
    return await run();
  } finally {
    global.fetch = original;
  }
}

test('createCheckout posts a Standard checkout and returns the hosted link', async () => {
  const loaded = loadService();
  let request;
  try {
    const result = await withFetch(async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        status: 200,
        async json() { return { status: 'success', message: 'Hosted Link', data: { link: 'https://flw.test/pay/abc' } }; }
      };
    }, () => loaded.service.createCheckout({
      reference: 'UBB-1',
      amount: 81.6,
      currency: 'USD',
      customer: { email: 'customer@example.test', name: 'Customer' },
      redirectUrl: 'https://store.test/payment-success.html',
      meta: { order_reference: 'UBB-1' }
    }));
    assert.equal(result.authorizationUrl, 'https://flw.test/pay/abc');
    assert.equal(result.providerReference, 'UBB-1');
    assert.equal(request.url, 'https://flw.test/v3/payments');
    assert.equal(request.options.headers.Authorization, 'Bearer FLWSECK_TEST-example');
    assert.equal(request.body.tx_ref, 'UBB-1');
    assert.equal(request.body.amount, '81.60');
    assert.equal(request.body.currency, 'USD');
    assert.equal(request.body.redirect_url, 'https://store.test/payment-success.html');
    assert.deepEqual(request.body.customer, { email: 'customer@example.test', name: 'Customer' });
    assert.deepEqual(request.body.meta, { order_reference: 'UBB-1' });
  } finally {
    loaded.restore();
  }
});

test('createCheckout formats whole-currency amounts without decimals', async () => {
  const loaded = loadService();
  try {
    let body;
    await withFetch(async (url, options) => {
      body = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        async json() { return { status: 'success', data: { link: 'https://flw.test/pay/ngn' } }; }
      };
    }, () => loaded.service.createCheckout({
      reference: 'UBB-NGN',
      amount: 9715,
      currency: 'NGN',
      customer: { email: 'customer@example.test' },
      redirectUrl: 'https://store.test/payment-success.html'
    }));
    assert.equal(body.amount, '9715');
  } finally {
    loaded.restore();
  }
});

test('createCheckout surfaces provider rejections and network failures distinctly', async () => {
  const loaded = loadService();
  try {
    await assert.rejects(
      withFetch(async () => ({
        ok: false,
        status: 400,
        async json() { return { status: 'error', message: 'Currency not supported for this merchant' }; }
      }), () => loaded.service.createCheckout({
        reference: 'UBB-2',
        amount: 10,
        currency: 'GBP',
        customer: { email: 'customer@example.test' },
        redirectUrl: 'https://store.test/payment-success.html'
      })),
      error => error.code === 'FLW_REJECTED' && /Currency not supported/.test(error.message)
    );
    await assert.rejects(
      withFetch(async () => { throw new Error('socket hang up'); }, () => loaded.service.createCheckout({
        reference: 'UBB-3',
        amount: 10,
        currency: 'EUR',
        customer: { email: 'customer@example.test' },
        redirectUrl: 'https://store.test/payment-success.html'
      })),
      error => error.code === 'FLW_UNAVAILABLE'
    );
  } finally {
    loaded.restore();
  }
});

test('the service refuses to call Flutterwave without a secret key', async () => {
  const loaded = loadService({ secretKey: null });
  let called = false;
  try {
    await assert.rejects(
      withFetch(async () => { called = true; }, () => loaded.service.createCheckout({
        reference: 'UBB-4',
        amount: 10,
        currency: 'USD',
        customer: { email: 'customer@example.test' },
        redirectUrl: 'https://store.test/payment-success.html'
      })),
      error => error.code === 'FLW_NOT_CONFIGURED'
    );
    assert.equal(loaded.service.isConfigured(), false);
    assert.equal(called, false);
  } finally {
    loaded.restore();
  }
});

test('verifyTransaction normalizes a successful reference lookup and returns null when missing', async () => {
  const loaded = loadService();
  try {
    const verified = await withFetch(async url => {
      assert.match(url, /\/transactions\/verify_by_reference\?tx_ref=UBB-5$/);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            status: 'success',
            data: { id: 99, tx_ref: 'UBB-5', status: 'successful', amount: 81.6, currency: 'USD' }
          };
        }
      };
    }, () => loaded.service.verifyTransaction('UBB-5'));
    assert.deepEqual(verified, {
      provider: 'flutterwave',
      reference: 'UBB-5',
      transactionId: 99,
      status: 'successful',
      amount: 81.6,
      currency: 'USD',
      raw: { id: 99, tx_ref: 'UBB-5', status: 'successful', amount: 81.6, currency: 'USD' }
    });

    const missing = await withFetch(async () => ({
      ok: false,
      status: 404,
      async json() { return { status: 'error', message: 'No transaction was found' }; }
    }), () => loaded.service.verifyTransaction('UBB-MISSING'));
    assert.equal(missing, null);
  } finally {
    loaded.restore();
  }
});

test('refundTransaction posts the amount to the transaction refund endpoint', async () => {
  const loaded = loadService();
  let request;
  try {
    const result = await withFetch(async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        status: 200,
        async json() { return { status: 'success', data: { status: 'successful' } }; }
      };
    }, () => loaded.service.refundTransaction({ transactionId: 99, amount: 81.6 }));
    assert.equal(request.url, 'https://flw.test/v3/transactions/99/refund');
    assert.deepEqual(request.body, { amount: 81.6 });
    assert.equal(result.status, 'successful');
  } finally {
    loaded.restore();
  }
});

test('verifyWebhookHash compares the verif-hash secret exactly', () => {
  const loaded = loadService({ webhookHash: 'super-secret-hash' });
  try {
    assert.equal(loaded.service.verifyWebhookHash('super-secret-hash'), true);
    assert.equal(loaded.service.verifyWebhookHash('super-secret-hasX'), false);
    assert.equal(loaded.service.verifyWebhookHash(''), false);
    assert.equal(loaded.service.verifyWebhookHash(undefined), false);
    assert.equal(loaded.service.verifyWebhookHash('a'.repeat(64)), false);
  } finally {
    loaded.restore();
  }
});
