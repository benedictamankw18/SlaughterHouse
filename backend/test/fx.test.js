const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_MARKUP_PERCENT,
  QUOTE_TTL_MS,
  RATE_MAX_AGE_MS,
  computeCharge,
  getChargeQuote,
  getFxSettings,
  listFxRates,
  roundUpTo,
  validateApprovedRate,
  validateMarkupPercent,
  fetchSuggestedRates,
  clearSuggestionCache
} = require('../services/fx');

function fakeDatabase({ settings = {}, rates = {} } = {}) {
  return {
    all(query, parameters, callback) {
      if (/FROM settings WHERE setting_key IN/.test(query)) {
        const rows = parameters
          .filter(key => Object.hasOwn(settings, key))
          .map(key => ({ setting_key: key, setting_value: String(settings[key]) }));
        return callback(null, rows);
      }
      if (/FROM fx_rates/.test(query)) {
        return callback(null, Object.values(rates));
      }
      return callback(new Error(`Unexpected query: ${query}`));
    },
    get(query, parameters, callback) {
      if (/FROM fx_rates WHERE currency = /.test(query)) {
        return callback(null, rates[parameters[0]] || null);
      }
      return callback(new Error(`Unexpected query: ${query}`));
    }
  };
}

function rateRow(currency, rate, { approvedAt = new Date(), suggestedRate = null, suggestedSource = 'open.er-api.com' } = {}) {
  return {
    currency,
    ghs_per_unit: String(rate),
    suggested_ghs_per_unit: suggestedRate,
    suggested_source: suggestedSource,
    suggested_at: suggestedRate ? approvedAt : null,
    approved_at: approvedAt,
    updated_at: approvedAt
  };
}

test('roundUpTo always rounds up and leaves exact values alone', () => {
  assert.equal(roundUpTo(1.001, 2), 1.01);
  assert.equal(roundUpTo(81.6, 2), 81.6);
  assert.equal(roundUpTo(0.1 + 0.2, 2), 0.3);
  assert.equal(roundUpTo(45000.0001, 0), 45001);
  assert.equal(roundUpTo(45000, 0), 45000);
});

test('computeCharge passes GHS through and rounds up', () => {
  const quote = computeCharge(10.005, 'GHS');
  assert.deepEqual(quote, {
    currency: 'GHS',
    amount: 10.01,
    amountGhs: 10.01,
    midRate: 1,
    markupPercent: 0,
    effectiveRate: 1,
    decimals: 2
  });
});

test('computeCharge converts GHS with the markup and reports the GHS equivalent', () => {
  const quote = computeCharge(1000, 'USD', { midRate: 12.5, markupPercent: 2 });
  assert.equal(quote.amount, 81.6);
  assert.equal(quote.amountGhs, 1020);
  assert.equal(quote.effectiveRate, 12.5 / 1.02);
  assert.equal(quote.decimals, 2);
});

test('computeCharge rounds NGN to whole naira', () => {
  const quote = computeCharge(100, 'NGN', { midRate: 0.0105, markupPercent: 2 });
  assert.equal(quote.amount, 9715);
  assert.equal(quote.amountGhs, 102.01);
  assert.equal(quote.decimals, 0);
});

test('computeCharge rejects unsupported currencies and invalid amounts', () => {
  assert.throws(() => computeCharge(10, 'KES'), error => error.code === 'FX_CURRENCY_UNSUPPORTED');
  assert.throws(() => computeCharge(0, 'USD', { midRate: 12 }), error => error.code === 'FX_AMOUNT_INVALID');
  assert.throws(() => computeCharge(10, 'USD', { midRate: 0 }), error => error.code === 'FX_RATE_INVALID');
});

test('getFxSettings defaults the markup and keeps charging disabled until switched on', async () => {
  const settings = await getFxSettings(fakeDatabase());
  assert.deepEqual(settings, { markupPercent: DEFAULT_MARKUP_PERCENT, chargeEnabled: false });
});

test('getFxSettings rejects an invalid stored markup instead of guessing', async () => {
  await assert.rejects(
    getFxSettings(fakeDatabase({ settings: { fx_markup_percent: '75' } })),
    error => error.code === 'FX_MARKUP_INVALID'
  );
});

test('getChargeQuote returns a locked foreign quote with provider and expiry', async () => {
  const now = Date.now();
  const database = fakeDatabase({
    settings: { multi_currency_charge_enabled: '1', fx_markup_percent: '2.00' },
    rates: { USD: rateRow('USD', '12.50000000', { approvedAt: new Date(now - 1000), suggestedRate: '12.4' }) }
  });
  const quote = await getChargeQuote(database, 1000, 'USD', { now });
  assert.equal(quote.currency, 'USD');
  assert.equal(quote.amount, 81.6);
  assert.equal(quote.amountGhs, 1020);
  assert.equal(quote.provider, 'flutterwave');
  assert.equal(quote.source, 'admin_approved:open.er-api.com');
  assert.equal(quote.expiresAt, new Date(now + QUOTE_TTL_MS).toISOString());
});

test('getChargeQuote rejects stale, missing, and malformed rates', async () => {
  const now = Date.now();
  const cases = [
    [fakeDatabase({ settings: { multi_currency_charge_enabled: '1' } }), 'FX_RATE_INVALID'],
    [fakeDatabase({
      settings: { multi_currency_charge_enabled: '1' },
      rates: { USD: rateRow('USD', '12.5', { approvedAt: new Date(now - RATE_MAX_AGE_MS - 1) }) }
    }), 'FX_RATE_STALE'],
    [fakeDatabase({
      settings: { multi_currency_charge_enabled: '1' },
      rates: { USD: rateRow('USD', '12.123456789') }
    }), 'FX_RATE_INVALID']
  ];
  for (const [database, code] of cases) {
    await assert.rejects(getChargeQuote(database, 1000, 'USD', { now }), error => error.code === code);
  }
});

test('getChargeQuote blocks foreign currencies while the feature flag is off', async () => {
  const database = fakeDatabase({
    settings: {},
    rates: { USD: rateRow('USD', '12.5') }
  });
  await assert.rejects(getChargeQuote(database, 1000, 'USD'), error => error.code === 'FX_CHARGING_DISABLED');
  const ghs = await getChargeQuote(database, 1000, 'GHS');
  assert.equal(ghs.amount, 1000);
  assert.equal(ghs.provider, 'paystack');
});

test('getChargeQuote prices GHS without reading FX settings or rates', async () => {
  const database = {
    all() { throw new Error('GHS must not read settings'); },
    get() { throw new Error('GHS must not read fx_rates'); }
  };
  const quote = await getChargeQuote(database, 500, 'GHS');
  assert.equal(quote.amount, 500);
  assert.equal(quote.amountGhs, 500);
  assert.equal(quote.source, 'catalog_ghs');
});

test('getChargeQuote can price without the flag for admin previews', async () => {
  const database = fakeDatabase({ rates: { USD: rateRow('USD', '12.5') } });
  const quote = await getChargeQuote(database, 1000, 'USD', { requireEnabled: false });
  assert.equal(quote.amount, 81.6);
});

test('listFxRates reports configuration, freshness, and suggestions', async () => {
  const now = Date.now();
  const database = fakeDatabase({
    rates: {
      USD: rateRow('USD', '12.5', { approvedAt: new Date(now - 1000), suggestedRate: '12.4' }),
      NGN: rateRow('NGN', '0.008', { approvedAt: new Date(now - RATE_MAX_AGE_MS - 1) })
    }
  });
  const rates = await listFxRates(database, now);
  assert.deepEqual(rates.map(rate => rate.currency), ['USD', 'NGN', 'GBP', 'EUR']);
  const usd = rates.find(rate => rate.currency === 'USD');
  assert.equal(usd.configured, true);
  assert.equal(usd.stale, false);
  assert.equal(usd.midRate, 12.5);
  assert.equal(usd.suggestion.rate, 12.4);
  const ngn = rates.find(rate => rate.currency === 'NGN');
  assert.equal(ngn.stale, true);
  const gbp = rates.find(rate => rate.currency === 'GBP');
  assert.equal(gbp.configured, false);
  assert.equal(gbp.stale, true);
});

test('validateApprovedRate enforces precision and bounds', () => {
  assert.deepEqual(validateApprovedRate('USD', '12.34567891'), { value: '12.34567891' });
  assert.match(validateApprovedRate('USD', '0').error, /greater than zero/);
  assert.match(validateApprovedRate('USD', '1000000').error, /less than 1000000/);
  assert.match(validateApprovedRate('USD', '12.123456789').error, /decimal places/);
  assert.match(validateApprovedRate('USD', 'abc').error, /positive number/);
  assert.match(validateApprovedRate('GHS', '1').error, /only be approved for/);
});

test('validateMarkupPercent accepts two decimals and rejects out-of-range values', () => {
  assert.deepEqual(validateMarkupPercent('2'), { value: '2.00' });
  assert.deepEqual(validateMarkupPercent(2.5), { value: '2.50' });
  assert.match(validateMarkupPercent('-1').error, /non-negative/);
  assert.match(validateMarkupPercent('51').error, /between 0/);
  assert.match(validateMarkupPercent('2.123').error, /two decimal places/);
});

test('fetchSuggestedRates derives GHS cross-rates from the USD table', async () => {
  clearSuggestionCache();
  const now = Date.now();
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      result: 'success',
      rates: { GHS: 12, USD: 1, NGN: 1500, GBP: 0.8, EUR: 0.9 }
    })
  });
  const suggestion = await fetchSuggestedRates({ fetchImpl, now });
  assert.equal(suggestion.source, 'open.er-api.com');
  assert.deepEqual(suggestion.rates, {
    USD: 12,
    NGN: 0.008,
    GBP: 15,
    EUR: 13.33333333
  });

  let calls = 0;
  const cached = await fetchSuggestedRates({
    fetchImpl: async () => { calls += 1; throw new Error('should not be called'); },
    now: now + 1000
  });
  assert.equal(cached.rates.USD, 12);
  assert.equal(calls, 0);
});

test('fetchSuggestedRates rejects upstream failures and malformed payloads', async () => {
  clearSuggestionCache();
  await assert.rejects(
    fetchSuggestedRates({ fetchImpl: async () => ({ ok: false, json: async () => ({}) }), now: 1 }),
    error => error.code === 'FX_SUGGESTION_UNAVAILABLE'
  );
  clearSuggestionCache();
  await assert.rejects(
    fetchSuggestedRates({ fetchImpl: async () => ({ ok: true, json: async () => ({ result: 'error' }) }), now: 2 }),
    error => error.code === 'FX_SUGGESTION_UNAVAILABLE'
  );
  clearSuggestionCache();
  await assert.rejects(
    fetchSuggestedRates({ fetchImpl: async () => { throw new Error('offline'); }, now: 3 }),
    error => error.code === 'FX_SUGGESTION_UNAVAILABLE'
  );
});
