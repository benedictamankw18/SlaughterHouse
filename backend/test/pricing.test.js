const test = require('node:test');
const assert = require('node:assert/strict');
const { getPricing } = require('../services/pricing');

const settingRows = [
  { setting_key: 'booking_fee_mixtape_ghs', setting_value: '700' },
  { setting_key: 'booking_fee_full_production_ghs', setting_value: '1000' },
  { setting_key: 'booking_fee_beat_production_ghs', setting_value: '500' },
  { setting_key: 'booking_fee_adverts_promos_ghs', setting_value: '1000' },
  { setting_key: 'beat_request_license_basic_ghs', setting_value: '500' },
  { setting_key: 'beat_request_license_premium_ghs', setting_value: '1000' },
  { setting_key: 'beat_request_license_unlimited_ghs', setting_value: '2000' },
  { setting_key: 'beat_request_license_exclusive_ghs', setting_value: '4700' },
  { setting_key: 'beat_default_basic_usd', setting_value: '25' },
  { setting_key: 'beat_default_premium_usd', setting_value: '45' },
  { setting_key: 'beat_default_unlimited_usd', setting_value: '150' },
  { setting_key: 'beat_default_exclusive_usd', setting_value: '420' }
];

function fakeDatabase(rows) {
  return {
    all(query, parameters, callback) {
      assert.match(query, /FROM settings WHERE setting_key IN/);
      assert.equal(parameters.length, 12);
      callback(null, rows);
    }
  };
}

test('getPricing maps settings rows into numeric fee groups', async () => {
  const pricing = await getPricing(fakeDatabase(settingRows));
  assert.deepEqual(pricing.bookingFees, {
    mixtape: 700,
    'full-production': 1000,
    'beat-production': 500,
    'adverts-promos': 1000
  });
  assert.deepEqual(pricing.beatRequestLicensePrices, { basic: 500, premium: 1000, unlimited: 2000, exclusive: 4700 });
  assert.deepEqual(pricing.beatDefaultPrices, { basic: 25, premium: 45, unlimited: 150, exclusive: 420 });
});

test('getPricing leaves missing settings undefined so callers can detect them', async () => {
  const pricing = await getPricing(fakeDatabase(settingRows.slice(0, 1)));
  assert.equal(pricing.bookingFees.mixtape, 700);
  assert.equal(pricing.bookingFees['full-production'], undefined);
  assert.equal(pricing.beatDefaultPrices.basic, undefined);
});

test('getPricing rejects when the settings query fails', async () => {
  const database = {
    all(query, parameters, callback) {
      callback(Object.assign(new Error('boom'), { code: 'ER_NO_SUCH_TABLE' }));
    }
  };
  await assert.rejects(() => getPricing(database), /boom/);
});
