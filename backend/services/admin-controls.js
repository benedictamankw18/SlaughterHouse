const BUSINESS_SETTINGS = Object.freeze({
  booking_fee_mixtape_ghs: 'Mixtape booking fee (GHS)',
  booking_fee_full_production_ghs: 'Full production booking fee (GHS)',
  booking_fee_beat_production_ghs: 'Beat production booking fee (GHS)',
  booking_fee_adverts_promos_ghs: 'Adverts and promos booking fee (GHS)',
  booking_ep_album_discount_percent: 'EP / Album discount (%)',
  beat_request_license_basic_ghs: 'Basic custom beat license (GHS)',
  beat_request_license_premium_ghs: 'Premium custom beat license (GHS)',
  beat_request_license_unlimited_ghs: 'Unlimited custom beat license (GHS)',
  beat_request_license_exclusive_ghs: 'Exclusive custom beat license (GHS)',
  beat_default_basic_usd: 'Default basic beat license (USD)',
  beat_default_premium_usd: 'Default premium beat license (USD)',
  beat_default_unlimited_usd: 'Default unlimited beat license (USD)',
  beat_default_exclusive_usd: 'Default exclusive beat license (USD)',
  usd_to_ghs_rate: 'USD to GHS exchange rate'
});

function validateSettingUpdates(updates) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return { error: 'Settings must be provided as an object.' };
  }
  const entries = Object.entries(updates);
  if (!entries.length) return { error: 'Provide at least one setting to update.' };
  for (const [key, value] of entries) {
    if (!Object.hasOwn(BUSINESS_SETTINGS, key)) return { error: `Setting "${key}" cannot be changed through this endpoint.` };
    if ((typeof value === 'string' && !value.trim()) || value === null || value === undefined || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100000000) {
      return { error: `${BUSINESS_SETTINGS[key]} must be a non-negative amount no greater than 100000000.` };
    }
    if (key === 'usd_to_ghs_rate' && (Number(value) <= 0 || Number(value) >= 1000000)) {
      return { error: 'USD to GHS exchange rate must be greater than zero and less than 1000000.' };
    }
    if (key === 'booking_ep_album_discount_percent' && Number(value) >= 100) {
      return { error: 'EP / Album discount must be less than 100%.' };
    }
    const decimalPlaces = key === 'usd_to_ghs_rate' ? 6 : 2;
    if (Number(value) !== Number(Number(value).toFixed(decimalPlaces))) {
      const precision = decimalPlaces === 2 ? 'two' : String(decimalPlaces);
      return { error: `${BUSINESS_SETTINGS[key]} can have at most ${precision} decimal places.` };
    }
  }
  return {
    value: entries.map(([key, value]) => [key, Number(value).toFixed(key === 'usd_to_ghs_rate' ? 6 : 2)])
  };
}

function validateDateRange(from, to) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  for (const [name, value] of [['from', from], ['to', to]]) {
    const parsedDate = value && datePattern.test(value) ? new Date(`${value}T00:00:00.000Z`) : null;
    if (value && (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== value)) {
      return { error: `${name} must be a valid date in YYYY-MM-DD format.` };
    }
  }
  if (from && to && from > to) return { error: 'The start date must be on or before the end date.' };
  if (from && to && Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 366 * 24 * 60 * 60 * 1000) {
    return { error: 'Date ranges cannot exceed 366 days.' };
  }
  return { value: { from: from || null, to: to || null } };
}

module.exports = { BUSINESS_SETTINGS, validateSettingUpdates, validateDateRange };
