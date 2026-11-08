const test = require('node:test');
const assert = require('node:assert/strict');
const {
  HOLD_DURATION_MINUTES,
  reserveBookingSlots,
  confirmBookingSlots,
  releaseBookingHold,
  expireBookingHolds
} = require('../services/booking-reservations');

function createDatabase(changesByCall = []) {
  const calls = [];
  return {
    calls,
    async run(query, parameters) {
      calls.push({ query, parameters });
      return { changes: changesByCall.length ? changesByCall.shift() : 1 };
    }
  };
}

test('booking slot holds use a bounded database expiry and reserve every requested slot', async () => {
  const db = createDatabase();
  const slots = [
    { date: '2030-01-09', time: '11:00' },
    { date: '2030-01-08', time: '11:00' }
  ];

  await reserveBookingSlots(db, 'BOOKING-1', slots);

  assert.equal(HOLD_DURATION_MINUTES, 30);
  assert.equal(db.calls.length, 2);
  assert.deepEqual(db.calls.map(call => call.parameters[1]), ['2030-01-08', '2030-01-09']);
  for (const [index, call] of db.calls.entries()) {
    assert.match(call.query, /SET status = 'reserved'/);
    assert.match(call.query, /hold_expires_at = CURRENT_TIMESTAMP \+ INTERVAL '30 minutes'/);
    assert.match(call.query, /status = 'available'/);
    assert.match(call.query, /hold_expires_at <= CURRENT_TIMESTAMP/);
    assert.match(call.query, /booking_order_reference = \?/);
    assert.deepEqual(call.parameters, ['BOOKING-1', ['2030-01-08', '2030-01-09'][index], '11:00', 'BOOKING-1']);
  }
});

test('expired booking holds support the callback-style database adapter', async () => {
  const calls = [];
  const db = {
    run(query, parameters, callback) {
      calls.push({ query, parameters });
      setImmediate(() => callback.call({ changes: 1 }, null));
    }
  };

  await expireBookingHolds(db, '2030-01-08');

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].parameters, ['2030-01-08']);
});

test('booking slot reservation fails when any slot is already held', async () => {
  const db = createDatabase([1, 0]);

  await assert.rejects(
    reserveBookingSlots(db, 'BOOKING-2', [
      { date: '2030-01-08', time: '11:00' },
      { date: '2030-01-09', time: '11:00' }
    ]),
    { code: 'BOOKING_SLOT_UNAVAILABLE' }
  );
  assert.equal(db.calls.length, 2);
});

test('paid booking confirmation consumes only its own active hold', async () => {
  const db = createDatabase();
  const slot = { date: '2030-01-08', time: '11:00' };

  await confirmBookingSlots(db, 'BOOKING-3', [slot]);

  assert.match(db.calls[0].query, /SET status = 'booked', booking_order_reference = NULL, hold_expires_at = NULL/);
  assert.match(db.calls[0].query, /status = 'reserved'/);
  assert.match(db.calls[0].query, /booking_order_reference = \?/);
  assert.match(db.calls[0].query, /hold_expires_at > CURRENT_TIMESTAMP/);
  assert.doesNotMatch(db.calls[0].query, /status = 'available'/);
  assert.deepEqual(db.calls[0].parameters, [slot.date, slot.time, 'BOOKING-3']);
});

test('expired or competing booking holds cannot be confirmed after payment', async () => {
  for (const reference of ['BOOKING-EXPIRED', 'BOOKING-COMPETING']) {
    const db = createDatabase([0]);
    await assert.rejects(
      confirmBookingSlots(db, reference, [{ date: '2030-01-08', time: '11:00' }]),
      { code: 'BOOKING_SLOT_UNAVAILABLE' }
    );
    assert.equal(db.calls.length, 1);
    assert.match(db.calls[0].query, /hold_expires_at > CURRENT_TIMESTAMP/);
    assert.equal(db.calls[0].parameters[2], reference);
  }
});

test('failed and expired booking holds are released by order reference or expiry', async () => {
  const db = createDatabase();

  await releaseBookingHold(db, 'BOOKING-4');
  await expireBookingHolds(db, '2030-01-08');

  assert.match(db.calls[0].query, /WHERE status = 'reserved' AND booking_order_reference = \?/);
  assert.deepEqual(db.calls[0].parameters, ['BOOKING-4']);
  assert.match(db.calls[1].query, /hold_expires_at <= CURRENT_TIMESTAMP AND slot_date = \?/);
  assert.deepEqual(db.calls[1].parameters, ['2030-01-08']);
});
