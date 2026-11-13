const test = require('node:test');
const assert = require('node:assert/strict');
const {
  recordPayment,
  paymentReferenceConflict,
  PAYMENT_REFERENCE_CONFLICT,
  PAYMENT_REFERENCE_CONFLICT_MESSAGE
} = require('../services/payment-records');

function createRunner({ changes = 1 } = {}) {
  const calls = [];
  const run = async (query, parameters) => {
    calls.push({ query, parameters });
    return { lastID: 7, changes };
  };
  return { run, calls };
}

const basePayment = {
  orderId: 21,
  provider: 'paystack',
  reference: 'UBB-ORDER-21',
  transactionId: 99,
  status: 'paid',
  amount: 125,
  currency: 'GHS',
  amountGhs: 125,
  payload: { id: 99 },
  verified: true
};

function setClause(sql) {
  return sql.slice(sql.indexOf('DO UPDATE SET'), sql.indexOf('WHERE payments.order_id'));
}

test('a confirmed payment is inserted with its immutable ownership protected', async () => {
  const { run, calls } = createRunner();
  await recordPayment(run, basePayment);

  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.match(call.query, /INSERT INTO payments/);
  assert.match(call.query, /verified_at/);
  assert.match(call.query, /CURRENT_TIMESTAMP/);
  assert.ok(call.query.includes('WHERE payments.order_id = EXCLUDED.order_id AND payments.provider = EXCLUDED.provider'));
  assert.match(call.query, /RETURNING id/);
  assert.doesNotMatch(setClause(call.query), /order_id\s*=/);
  assert.doesNotMatch(setClause(call.query), /(?:^|[^_])provider\s*=/m);
  assert.deepEqual(call.parameters, [21, 'paystack', 'UBB-ORDER-21', 99, 'paid', 125, 'GHS', 125, '{"id":99}']);
});

test('a pending payment keeps an existing verification timestamp', async () => {
  const { run, calls } = createRunner();
  await recordPayment(run, { ...basePayment, status: 'pending', verified: false });

  const [call] = calls;
  assert.doesNotMatch(setClause(call.query), /verified_at/);
  assert.doesNotMatch(call.query, /CURRENT_TIMESTAMP/);
  assert.ok(call.query.includes('WHERE payments.order_id = EXCLUDED.order_id AND payments.provider = EXCLUDED.provider'));
});

test('an existing payload string is stored without double encoding', async () => {
  const { run, calls } = createRunner();
  await recordPayment(run, { ...basePayment, payload: '{"already":"encoded"}' });
  assert.equal(calls[0].parameters[8], '{"already":"encoded"}');
});

test('a blocked conflict raises a reference conflict instead of reassigning the payment', async () => {
  const { run } = createRunner({ changes: 0 });
  await assert.rejects(
    recordPayment(run, basePayment),
    error => {
      assert.equal(error.code, PAYMENT_REFERENCE_CONFLICT);
      assert.equal(error.reference, 'UBB-ORDER-21');
      assert.equal(error.orderId, 21);
      assert.equal(error.message, PAYMENT_REFERENCE_CONFLICT_MESSAGE);
      return true;
    }
  );
});

test('reference conflict errors are identifiable without exposing another order', () => {
  const error = paymentReferenceConflict('UBB-ORDER-21', 21);
  assert.equal(error.code, 'PAYMENT_REFERENCE_CONFLICT');
  assert.match(error.message, /already recorded for another order/);
});
