const test = require('node:test');
const assert = require('node:assert/strict');
const { priceCartItems, hasPaidExclusiveLicense, getSoldExclusiveBeatIds } = require('../services/order-pricing');

const baseSettings = {
  booking_fee_mixtape_ghs: '700',
  booking_fee_full_production_ghs: '1000',
  booking_fee_beat_production_ghs: '500',
  booking_fee_adverts_promos_ghs: '1000',
  booking_ep_album_discount_percent: '20',
  beat_request_license_basic_ghs: '500',
  beat_request_license_premium_ghs: '1000',
  beat_request_license_unlimited_ghs: '2000',
  beat_request_license_exclusive_ghs: '4700',
  beat_default_basic_usd: '25',
  beat_default_premium_usd: '45',
  beat_default_unlimited_usd: '150',
  beat_default_exclusive_usd: '470',
  usd_to_ghs_rate: '12.5'
};

function fakeDatabase({
  settings = baseSettings,
  licenseStatus = [],
  beats = {},
  merchandise = {},
  exclusiveSales = [],
  orders = [],
  exclusiveLicenses = []
} = {}) {
  return {
    all(query, parameters, callback) {
      if (/FROM settings WHERE setting_key IN/.test(query)) {
        const rows = parameters
          .filter(key => Object.hasOwn(settings, key))
          .map(key => ({ setting_key: key, setting_value: String(settings[key]) }));
        return callback(null, rows);
      }
      if (/FROM license_definition_status/.test(query)) return callback(null, licenseStatus);
      if (/FROM orders o/.test(query)) return callback(null, exclusiveSales);
      if (/FROM orders WHERE status/.test(query)) return callback(null, orders);
      if (/FROM licenses WHERE license_type = 'exclusive'/.test(query)) return callback(null, exclusiveLicenses);
      return callback(new Error(`Unexpected all query: ${query}`));
    },
    get(query, parameters, callback) {
      if (/FROM beats WHERE lower\(title\)/.test(query)) {
        return callback(null, beats[String(parameters[1]).toLowerCase()] || null);
      }
      if (/FROM merchandise WHERE id/.test(query)) {
        return callback(null, merchandise[parameters[0]] || null);
      }
      if (/FROM settings WHERE setting_key = /.test(query)) {
        const key = parameters[0];
        return callback(null, Object.hasOwn(settings, key)
          ? { setting_value: String(settings[key]), updated_at: new Date().toISOString() }
          : null);
      }
      return callback(new Error(`Unexpected get query: ${query}`));
    }
  };
}

test('priceCartItems prices merchandise at its published GHS price', async () => {
  const database = fakeDatabase({
    merchandise: { 4: { id: 4, title: 'Tour Tee', price: '89.999', stock_quantity: 3 } }
  });
  const result = await priceCartItems(database, [{ type: 'merchandise', productId: 4, name: 'Tour Tee' }]);
  assert.deepEqual(result.items, [
    { type: 'merchandise', productId: 4, name: 'Tour Tee', priceGhs: 90 }
  ]);
  assert.equal(result.amountGhs, 90);
});

test('priceCartItems converts beat USD prices with the approved rate and snapshots the rate', async () => {
  const database = fakeDatabase({
    beats: { 'night drive': { id: 8, title: 'Night Drive', price: '12.5' } }
  });
  const result = await priceCartItems(database, [
    { type: 'beat', name: 'Night Drive', license: 'basic' }
  ]);
  assert.deepEqual(result.items, [{
    type: 'beat',
    productId: 8,
    name: 'Night Drive',
    license: 'basic',
    priceUsd: 12.5,
    priceGhs: 156.25,
    exchangeRate: 12.5
  }]);
  assert.equal(result.amountGhs, 156.25);
});

test('priceCartItems totals in cents so mixed carts do not drift', async () => {
  const database = fakeDatabase({
    beats: { 'night drive': { id: 8, title: 'Night Drive', price: '1.01' } },
    merchandise: { 4: { id: 4, title: 'Sticker', price: '0.1', stock_quantity: null } }
  });
  const result = await priceCartItems(database, [
    { type: 'beat', name: 'Night Drive', license: 'basic' },
    { type: 'merchandise', productId: 4 }
  ]);
  assert.equal(result.amountGhs, 12.73);
});

test('priceCartItems rejects unpublished, out-of-stock, and malformed merchandise', async () => {
  const outOfStock = fakeDatabase({
    merchandise: { 4: { id: 4, title: 'Tour Tee', price: '90', stock_quantity: 0 } }
  });
  await assert.rejects(
    priceCartItems(outOfStock, [{ type: 'merchandise', productId: 4 }]),
    /Tour Tee is out of stock/
  );
  await assert.rejects(
    priceCartItems(fakeDatabase(), [{ type: 'merchandise', productId: 99 }]),
    /Merchandise unavailable/
  );
  await assert.rejects(
    priceCartItems(fakeDatabase(), [{ type: 'merchandise', productId: 'abc' }]),
    /Invalid merchandise selected/
  );
});

test('priceCartItems rejects invalid, unavailable, and unknown beat licenses', async () => {
  const database = fakeDatabase({
    licenseStatus: [
      { license_type: 'basic', is_active: true },
      { license_type: 'exclusive', is_active: false }
    ],
    beats: { 'night drive': { id: 8, title: 'Night Drive', price: '12.5' } }
  });
  await assert.rejects(
    priceCartItems(database, [{ type: 'beat', name: 'Night Drive', license: 'premium' }]),
    /no longer available/
  );
  await assert.rejects(
    priceCartItems(database, [{ type: 'beat', name: 'Night Drive', license: 'remix' }]),
    /Invalid license selected/
  );
  await assert.rejects(
    priceCartItems(database, [{ type: 'beat', name: '', license: 'basic' }]),
    /must include a title/
  );
  await assert.rejects(
    priceCartItems(database, [null]),
    /must be an object/
  );
});

test('priceCartItems rejects a beat that is missing or has no valid price', async () => {
  const database = fakeDatabase({
    beats: { 'free beat': { id: 9, title: 'Free Beat', price: '0' } }
  });
  await assert.rejects(
    priceCartItems(database, [{ type: 'beat', name: 'Unknown', license: 'basic' }]),
    /Beat unavailable: Unknown/
  );
  await assert.rejects(
    priceCartItems(database, [{ type: 'beat', name: 'Free Beat', license: 'basic' }]),
    /Beat unavailable: Free Beat/
  );
});

test('priceCartItems refuses an exclusive license that was already sold', async () => {
  const database = fakeDatabase({
    beats: { 'night drive': { id: 8, title: 'Night Drive', price: '470' } },
    exclusiveSales: [{
      reference: 'UBB-EXCLUSIVE-1',
      items_json: JSON.stringify([{ type: 'beat', productId: 8, license: 'exclusive' }]),
      license_id: null,
      revoked_at: null,
      license_active: true
    }]
  });
  await assert.rejects(
    priceCartItems(database, [{ type: 'beat', name: 'Night Drive', license: 'exclusive' }]),
    /already been sold/
  );
});

test('hasPaidExclusiveLicense ignores revoked, expired, and unrelated sales', async () => {
  const items = JSON.stringify([{ type: 'beat', productId: 8, license: 'exclusive' }]);
  const queryAll = rows => async () => rows;
  assert.equal(await hasPaidExclusiveLicense(queryAll([]), 8), false);
  assert.equal(await hasPaidExclusiveLicense(queryAll([
    { reference: 'A', items_json: items, license_id: 3, revoked_at: new Date(), license_active: true }
  ]), 8), false);
  assert.equal(await hasPaidExclusiveLicense(queryAll([
    { reference: 'A', items_json: items, license_id: 3, revoked_at: null, license_active: false }
  ]), 8), false);
  assert.equal(await hasPaidExclusiveLicense(queryAll([
    { reference: 'A', items_json: items, license_id: 3, revoked_at: null, license_active: true }
  ]), 8), true);
  assert.equal(await hasPaidExclusiveLicense(queryAll([
    { reference: 'A', items_json: JSON.stringify([{ type: 'beat', productId: 8, license: 'basic' }]), license_id: null }
  ]), 8), false);
});

test('getSoldExclusiveBeatIds reports paid exclusives and skips revoked licenses', async () => {
  const database = fakeDatabase({
    orders: [
      { id: 1, items_json: JSON.stringify([{ type: 'beat', productId: 8, license: 'exclusive' }]) },
      { id: 2, items_json: JSON.stringify([{ type: 'beat', productId: 9, license: 'exclusive' }]) },
      { id: 3, items_json: JSON.stringify([{ type: 'beat', productId: 10, license: 'basic' }]) },
      { id: 4, items_json: JSON.stringify([{ type: 'beat', productId: 11, license: 'exclusive' }]) }
    ],
    exclusiveLicenses: [
      { order_id: 1, beat_id: 8, revoked_at: null, license_active: true },
      { order_id: 2, beat_id: 9, revoked_at: new Date(), license_active: true }
    ]
  });
  const sold = await getSoldExclusiveBeatIds(database);
  assert.deepEqual([...sold], [8, 11]);
});
