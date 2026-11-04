const test = require('node:test');
const assert = require('node:assert/strict');
const { paymentFailureStatus, isRefundEvent, recordNonSuccessPayment } = require('../services/payment-events');

test('payment failure statuses cover failed, abandoned, and reversed outcomes', () => {
  assert.equal(paymentFailureStatus('charge.failed'), 'failed');
  assert.equal(paymentFailureStatus('transaction.abandoned'), 'abandoned');
  assert.equal(paymentFailureStatus('charge.reversed'), 'reversed');
  assert.equal(paymentFailureStatus('', 'FAILED'), 'failed');
  assert.equal(paymentFailureStatus('', 'abandoned'), 'abandoned');
  assert.equal(paymentFailureStatus('', 'reversed'), 'reversed');
  assert.equal(paymentFailureStatus('charge.success', 'success'), null);
});

test('refund event detection is case-insensitive', () => {
  assert.equal(isRefundEvent('refund.processed'), true);
  assert.equal(isRefundEvent('REFUND.FAILED'), true);
  assert.equal(isRefundEvent('charge.reversed'), false);
});

test('failed and abandoned payments transition only unsettled orders and notify recipients', async () => {
  const calls = [];
  const database = {
    async run(query, parameters, callback) {
      calls.push({ query, parameters });
      callback?.(null);
      return { changes: 1 };
    },
    async get(query) {
      return /FROM users/.test(query) ? { id: 8 } : null;
    }
  };
  await recordNonSuccessPayment(database, {
    id: 10,
    reference: 'ORDER-10',
    customer_email: 'buyer@example.com',
    currency: 'GHS',
    status: 'pending'
  }, {
    reference: 'ORDER-10',
    status: 'failed',
    paymentData: { amount: 15000, currency: 'GHS' }
  });
  assert.match(calls[0].query, /INSERT INTO payments/);
  assert.match(calls[1].query, /UPDATE orders SET status = \?/);
  assert.equal(calls[1].parameters[0], 'failed');
  assert.ok(calls.some(call => /INSERT INTO notifications/.test(call.query) && call.parameters.includes('payment_failed')));
});

test('non-success callbacks cannot overwrite an order that is already settled', async () => {
  const calls = [];
  const database = {
    async run(query, parameters, callback) {
      calls.push({ query, parameters });
      callback?.(null);
      return { changes: 1 };
    },
    async get() { return null; }
  };
  await recordNonSuccessPayment(database, {
    id: 10,
    reference: 'ORDER-10',
    status: 'paid'
  }, {
    reference: 'ORDER-10',
    status: 'failed',
    paymentData: { amount: 15000, currency: 'GHS' }
  });
  assert.deepEqual(calls, []);
});
