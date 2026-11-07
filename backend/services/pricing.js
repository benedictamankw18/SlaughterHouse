const settingKeys = [
  'booking_fee_mixtape_ghs',
  'booking_fee_full_production_ghs',
  'booking_fee_beat_production_ghs',
  'booking_fee_adverts_promos_ghs',
  'beat_request_license_basic_ghs',
  'beat_request_license_premium_ghs',
  'beat_request_license_unlimited_ghs',
  'beat_request_license_exclusive_ghs',
  'beat_default_basic_usd',
  'beat_default_premium_usd',
  'beat_default_unlimited_usd',
  'beat_default_exclusive_usd'
];
const USD_GHS_RATE_KEY = 'usd_to_ghs_rate';
const USD_GHS_RATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isUsdGhsRateFresh(updatedAt, now = Date.now()) {
  const timestamp = new Date(updatedAt).getTime();
  const age = now - timestamp;
  return Number.isFinite(timestamp) && age >= -5 * 60 * 1000 && age <= USD_GHS_RATE_MAX_AGE_MS;
}

function getPricing(database) {
  return new Promise((resolve, reject) => {
    database.all(
      'SELECT setting_key, setting_value FROM settings WHERE setting_key IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      settingKeys,
      (error, rows) => {
        if (error) return reject(error);
        const values = Object.fromEntries((rows || []).map(row => [row.setting_key, Number(row.setting_value)]));
        resolve({
          bookingFees: {
            mixtape: values.booking_fee_mixtape_ghs,
            'full-production': values.booking_fee_full_production_ghs,
            'beat-production': values.booking_fee_beat_production_ghs,
            'adverts-promos': values.booking_fee_adverts_promos_ghs
          },
          beatRequestLicensePrices: {
            basic: values.beat_request_license_basic_ghs,
            premium: values.beat_request_license_premium_ghs,
            unlimited: values.beat_request_license_unlimited_ghs,
            exclusive: values.beat_request_license_exclusive_ghs
          },
          beatDefaultPrices: {
            basic: values.beat_default_basic_usd,
            premium: values.beat_default_premium_usd,
            unlimited: values.beat_default_unlimited_usd,
            exclusive: values.beat_default_exclusive_usd
          }
        });
      }
    );
  });
}

function getUsdGhsRate(database, now = Date.now()) {
  return new Promise((resolve, reject) => {
    database.get(
      'SELECT setting_value, updated_at FROM settings WHERE setting_key = ?',
      [USD_GHS_RATE_KEY],
      (error, row) => {
        if (error) return reject(error);
        const rate = Number(row?.setting_value);
        if (!row || !Number.isFinite(rate) || rate <= 0 || rate >= 1000000 || Number(rate) !== Number(rate.toFixed(6))) {
          return reject(Object.assign(new Error('Set a valid USD to GHS exchange rate in Admin > Settings before accepting beat payments.'), { code: 'USD_GHS_RATE_INVALID' }));
        }
        const updatedAt = new Date(row.updated_at).getTime();
        if (!isUsdGhsRateFresh(updatedAt, now)) {
          return reject(Object.assign(new Error('The USD to GHS exchange rate is missing a valid update time or is older than 24 hours. Update it in Admin > Settings before accepting beat payments.'), { code: 'USD_GHS_RATE_STALE' }));
        }
        resolve({ rate, updatedAt: new Date(updatedAt).toISOString() });
      }
    );
  });
}

module.exports = { getPricing, getUsdGhsRate, isUsdGhsRateFresh, USD_GHS_RATE_MAX_AGE_MS };
