const test = require('node:test');
const assert = require('node:assert/strict');
const { FULFILLMENT_STATUSES, updateFulfillmentStatus } = require('../services/fulfillment');

function fakeTransactionDb(currentStatus = 'unfulfilled') {
  const calls = [];
  return {
    calls,
    async get(query, parameters) {
      calls.push({ query, parameters });
      return { id: parameters[0], fulfillment_status: currentStatus };
    },
    async run(query, parameters) {
      calls.push({ query, parameters });
      return { changes: 1 };
    }
  };
}

test('fulfillment status transitions are validated and recorded', async () => {
  assert.deepEqual(FULFILLMENT_STATUSES, ['unfulfilled', 'shipped', 'delivered']);
  const database = fakeTransactionDb('unfulfilled');
  const result = await updateFulfillmentStatus(database, { orderId: 5, status: 'shipped', adminId: 9 });
  assert.deepEqual(result, { changed: true, previousStatus: 'unfulfilled', status: 'shipped' });
  assert.match(database.calls[0].query, /FOR UPDATE/);
  assert.match(database.calls[1].query, /UPDATE orders SET fulfillment_status/);
  assert.match(database.calls[2].query, /INSERT INTO order_fulfillment_history/);
  assert.deepEqual(database.calls[2].parameters, [5, 'shipped', 9]);
});

test('unchanged fulfillment status does not create duplicate history entries', async () => {
  const database = fakeTransactionDb('delivered');
  const result = await updateFulfillmentStatus(database, { orderId: 5, status: 'delivered', adminId: 9 });
  assert.deepEqual(result, { changed: false, status: 'delivered' });
  assert.equal(database.calls.length, 1);
});

test('missing orders and invalid states are explicit', async () => {
  const database = fakeTransactionDb();
  await assert.rejects(
    updateFulfillmentStatus(database, { orderId: 5, status: 'lost', adminId: 9 }),
    /Fulfillment status must be one of/
  );
  database.get = async () => null;
  assert.deepEqual(await updateFulfillmentStatus(database, { orderId: 5, status: 'shipped', adminId: 9 }), { notFound: true });
});
