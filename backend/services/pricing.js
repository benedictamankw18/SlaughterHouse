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

module.exports = { getPricing };
