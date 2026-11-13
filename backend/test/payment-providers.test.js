const test = require('node:test');
const assert = require('node:assert/strict');
const { PAYMENT_PROVIDERS, normalizePaymentProvider, paymentProvider } = require('../services/payment-providers');

test('supported payment providers are accepted after trimming and lowercasing', () => {
  assert.deepEqual([...PAYMENT_PROVIDERS], ['paystack', 'flutterwave']);
  for (const [value, expected] of [
    ['paystack', 'paystack'],
    ['Paystack', 'paystack'],
    ['  PAYSTACK  ', 'paystack'],
    ['flutterwave', 'flutterwave'],
    ['FlutterWave', 'flutterwave']
  ]) {
    assert.equal(normalizePaymentProvider(value), expected);
  }
});

test('unsupported, missing, and non-string payment providers fail closed', () => {
  for (const value of ['stripe', 'paypal', 'flutter', '', '   ', null, undefined, 42, {}, ['paystack']]) {
    assert.equal(normalizePaymentProvider(value), null, `${JSON.stringify(value)} must not be accepted`);
  }
});

test('paymentProvider reads the order provider without a fallback', () => {
  assert.equal(paymentProvider({ provider: 'paystack' }), 'paystack');
  assert.equal(paymentProvider({ provider: 'flutterwave' }), 'flutterwave');
  assert.equal(paymentProvider({ provider: 'stripe' }), null);
  assert.equal(paymentProvider({ provider: '' }), null);
  assert.equal(paymentProvider({}), null);
  assert.equal(paymentProvider(null), null);
});
