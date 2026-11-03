const test = require('node:test');
const assert = require('node:assert/strict');
const { refundEventDetails, refundEventKey, applyRefund } = require('../services/refunds');

function createFakeDb({ booking = null, customer = { id: 5 }, admins = [] } = {}) {
  const calls = [];
  const database = {
    calls,
    async run(query, parameters = [], callback) {
      calls.push({ query, parameters });
      const changes = /UPDATE licenses SET revoked_at/.test(query) ? 2 : 1;
      const result = { lastID: 1, changes, affectedRows: changes, insertId: 1 };
      if (callback) {
        callback(null, result);
        return result;
      }
      return result;
    },
    async get(query) {
      if (/FROM bookings/.test(query)) return booking;
      if (/FROM users WHERE lower\(email\)/.test(query)) return customer;
      return null;
    },
    async all(query) {
      return /FROM users WHERE role = 'admin'/.test(query) ? admins : [];
    }
  };
  return database;
}

function order(overrides = {}) {
  return {
    id: 10,
    reference: 'UBB-REFUND-1',
    customer_email: 'buyer@example.com',
    amount: 800,
    currency: 'GHS',
    status: 'paid',
    fulfillment_status: 'unfulfilled',
    refunded_amount: 0,
    items_json: JSON.stringify([
      { type: 'beat', productId: 1, name: 'Beat', license: 'basic' },
      { type: 'merchandise', productId: 2, name: 'Hoodie', priceGhs: 100 }
    ]),
    ...overrides
  };
}

test('refundEventDetails reads nested and flat Paystack refund payloads', () => {
  assert.deepEqual(
    refundEventDetails({ data: { id: 9, transaction: { reference: 'UBB-1' }, amount: 25000, currency: 'GHS', reason: 'Customer request' } }),
    { reference: 'UBB-1', amountGhs: 250, currency: 'GHS', reason: 'Customer request', eventId: 9 }
  );
  assert.equal(refundEventDetails({ data: { transaction_reference: 'UBB-2', amount: 1000 } }).reference, 'UBB-2');
  assert.equal(refundEventDetails({ data: { reference: 'UBB-3' } }).reference, 'UBB-3');
  assert.equal(refundEventDetails({ data: { amount: 1000, currency: 'GHS' } }).reference, '');
});

test('refundEventKey is unique per refund id and falls back to the transaction reference', () => {
  assert.equal(refundEventKey({ data: { id: 12, transaction: { reference: 'UBB-1' } } }), 'refund:12');
  assert.equal(refundEventKey({ data: { transaction_reference: 'UBB-1' } }), 'refund:UBB-1');
  assert.equal(refundEventKey({ data: {} }), '');
});

test('a full refund revokes licences, restores unfulfilled stock, and notifies both sides', async () => {
  const db = createFakeDb({ admins: [{ id: 1 }] });
  const result = await applyRefund(db, order(), { amountGhs: 800, reference: 'UBB-REFUND-1' });

  assert.equal(result.full, true);
  assert.equal(result.status, 'refunded');
  assert.equal(result.refundedAmount, 800);
  assert.equal(result.manualReview.length, 0);

  const sql = db.calls.map(call => call.query).join('\n');
  assert.match(sql, /UPDATE orders SET status = \?, refunded_amount = \?, refunded_at/);
  assert.match(sql, /UPDATE licenses SET revoked_at/);
  assert.match(sql, /UPDATE merchandise SET stock_quantity = stock_quantity \+ 1/);
  const notificationCalls = db.calls.filter(call => /INSERT INTO notifications/.test(call.query));
  assert.equal(notificationCalls.length, 2, 'customer and admin notifications are written');
});

test('a refund of fulfilled merchandise does not restore stock and flags manual review', async () => {
  const db = createFakeDb({ admins: [{ id: 1 }] });
  const result = await applyRefund(db, order({ fulfillment_status: 'shipped' }), { amountGhs: 800, reference: 'UBB-REFUND-1' });

  const sql = db.calls.map(call => call.query).join('\n');
  assert.doesNotMatch(sql, /UPDATE merchandise SET stock_quantity/);
  assert.deepEqual(result.manualReview, ['merchandise_already_fulfilled']);
  const adminNotification = db.calls.find(call => /INSERT INTO notifications/.test(call.query) && /Refund needs manual review/.test(call.parameters[2]));
  assert.ok(adminNotification, 'the admin is alerted for manual review');
});

test('a partial refund keeps entitlements and does not cancel bookings', async () => {
  const db = createFakeDb({ booking: { id: 4, preferred_date: '2026-12-01' } });
  const result = await applyRefund(db, order({ items_json: JSON.stringify([{ type: 'booking', name: 'Mixtape', feeGhs: 700 }]) }), { amountGhs: 200, reference: 'UBB-REFUND-1' });

  assert.equal(result.full, false);
  assert.equal(result.status, 'partially_refunded');
  assert.equal(result.refundedAmount, 200);
  const sql = db.calls.map(call => call.query).join('\n');
  assert.doesNotMatch(sql, /UPDATE licenses SET revoked_at/);
  assert.doesNotMatch(sql, /UPDATE bookings SET status/);
  assert.doesNotMatch(sql, /UPDATE booking_availability/);
});

test('a full booking refund cancels the booking and frees its slots', async () => {
  const db = createFakeDb({ booking: { id: 4, preferred_date: '2020-01-01' } });
  const result = await applyRefund(db, order({ items_json: JSON.stringify([{ type: 'booking', name: 'Mixtape', feeGhs: 700 }]) }), { amountGhs: 800, reference: 'UBB-REFUND-1' });

  const sql = db.calls.map(call => call.query).join('\n');
  assert.match(sql, /UPDATE bookings SET status = \?/);
  assert.match(sql, /UPDATE booking_availability SET status = \?, booking_id = NULL/);
  assert.deepEqual(result.manualReview, ['booking_session_in_past']);
});

test('successive partial refunds cap at the order total and become a full refund', async () => {
  const db = createFakeDb();
  const result = await applyRefund(db, order({ status: 'partially_refunded', refunded_amount: 700 }), { amountGhs: 500, reference: 'UBB-REFUND-1' });
  assert.equal(result.full, true);
  assert.equal(result.refundedAmount, 800);
});

test('an already refunded order is ignored without side effects', async () => {
  const db = createFakeDb();
  const result = await applyRefund(db, order({ status: 'refunded', refunded_amount: 800 }), { amountGhs: 800, reference: 'UBB-REFUND-1' });
  assert.equal(result.ignored, true);
  assert.equal(result.reason, 'already_refunded');
  assert.equal(db.calls.length, 0);
});

test('an unpaid order is ignored and invalid amounts are rejected', async () => {
  const db = createFakeDb();
  const ignored = await applyRefund(db, order({ status: 'pending' }), { amountGhs: 800, reference: 'UBB-REFUND-1' });
  assert.equal(ignored.ignored, true);
  assert.equal(db.calls.length, 0);

  await assert.rejects(applyRefund(db, order(), { amountGhs: 0, reference: 'UBB-REFUND-1' }), error => error.code === 'INVALID_REFUND_AMOUNT');
});
