const test = require('node:test');
const assert = require('node:assert/strict');
const { createNotificationSafely, notifyAdminsSafely } = require('../services/notifications');

test('notification inserts can use a unique idempotency key', async () => {
  let call;
  const database = {
    run(query, parameters, callback) {
      call = { query, parameters };
      callback(null);
    }
  };
  const result = await createNotificationSafely(database, {
    userId: 7,
    type: 'order_paid',
    title: 'Order paid',
    message: 'Order REF paid.',
    dedupeKey: 'order-paid:REF:7'
  });
  assert.equal(result, true);
  assert.match(call.query, /ON CONFLICT \(dedupe_key\) DO NOTHING/);
  assert.deepEqual(call.parameters, [7, 'order_paid', 'Order paid', 'Order REF paid.', 'order-paid:REF:7']);
});

test('administrator alerts are inserted for every admin with recipient-specific dedupe keys', async () => {
  let call;
  const database = {
    run(query, parameters, callback) {
      call = { query, parameters };
      callback(null);
    }
  };
  const result = await notifyAdminsSafely(database, {
    type: 'payment_failed',
    title: 'Payment failed',
    message: 'Order REF failed.',
    dedupeKey: 'payment-failed:REF:charge.failed'
  });
  assert.equal(result, true);
  assert.match(call.query, /SELECT id, \?, \?, \?, CONCAT\(\?::text, ':', id\)/);
  assert.match(call.query, /FROM users WHERE role IN \('admin', 'super_admin'\)/);
  assert.match(call.query, /ON CONFLICT \(dedupe_key\) DO NOTHING/);
  assert.deepEqual(call.parameters, ['payment_failed', 'Payment failed', 'Order REF failed.', 'payment-failed:REF:charge.failed']);
});

test('missing notification data is safely ignored', async () => {
  const database = { run() { assert.fail('database should not be called for invalid notification data'); } };
  assert.equal(await createNotificationSafely(database, { userId: 1, type: 'x' }), false);
  assert.equal(await notifyAdminsSafely(database, { type: 'x', title: 'y', message: 'z' }), false);
});
