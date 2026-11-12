const SUPPORTED_CURRENCIES = Object.freeze(['GHS', 'USD', 'NGN', 'GBP', 'EUR']);
const FOREIGN_CURRENCIES = Object.freeze(SUPPORTED_CURRENCIES.filter(currency => currency !== 'GHS'));
// Every approved rate is stored as GHS per one unit of the foreign currency.
const CURRENCY_DECIMALS = Object.freeze({ GHS: 2, USD: 2, NGN: 0, GBP: 2, EUR: 2 });
const PROVIDER_BY_CURRENCY = Object.freeze({ GHS: 'paystack', USD: 'flutterwave', NGN: 'flutterwave', GBP: 'flutterwave', EUR: 'flutterwave' });

const RATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const QUOTE_TTL_MS = 15 * 60 * 1000;
const BOOKING_QUOTE_TTL_MS = 30 * 60 * 1000;
const SUGGESTION_CACHE_MS = 10 * 60 * 1000;
const SUGGESTION_SOURCE = 'open.er-api.com';
const SUGGESTION_URL = 'https://open.er-api.com/v6/latest/USD';

const DEFAULT_MARKUP_PERCENT = 2;
const MAX_MARKUP_PERCENT = 50;
const MAX_RATE = 1000000;
const RATE_DECIMALS = 8;

const FX_MARKUP_SETTING_KEY = 'fx_markup_percent';
const FX_CHARGE_ENABLED_SETTING_KEY = 'multi_currency_charge_enabled';

function fxError(message, code) {
  return Object.assign(new Error(message), { code });
}

function roundUpTo(value, decimals) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw fxError('A finite amount is required.', 'FX_AMOUNT_INVALID');
  const factor = 10 ** decimals;
  return Math.ceil(numeric * factor - 1e-9) / factor;
}

function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function parseDecimalString(value, maxDecimals) {
  const raw = typeof value === 'number' ? String(value) : String(value ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const decimals = raw.includes('.') ? raw.split('.')[1].length : 0;
  if (decimals > maxDecimals) return null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return null;
  return { raw, value: numeric };
}

function isSupportedCurrency(currency) {
  return SUPPORTED_CURRENCIES.includes(String(currency || '').toUpperCase());
}

function providerForCurrency(currency) {
  return PROVIDER_BY_CURRENCY[String(currency || '').toUpperCase()] || null;
}

function all(database, query, parameters = []) {
  return new Promise((resolve, reject) => {
    database.all(query, parameters, (error, rows) => error ? reject(error) : resolve(rows || []));
  });
}

function get(database, query, parameters = []) {
  return new Promise((resolve, reject) => {
    database.get(query, parameters, (error, row) => error ? reject(error) : resolve(row));
  });
}

async function getFxSettings(database) {
  const rows = await all(
    database,
    'SELECT setting_key, setting_value FROM settings WHERE setting_key IN (?, ?)',
    [FX_MARKUP_SETTING_KEY, FX_CHARGE_ENABLED_SETTING_KEY]
  );
  const values = Object.fromEntries(rows.map(row => [row.setting_key, row.setting_value]));
  const rawMarkup = values[FX_MARKUP_SETTING_KEY];
  let markupPercent = DEFAULT_MARKUP_PERCENT;
  if (rawMarkup !== undefined && rawMarkup !== null && String(rawMarkup).trim() !== '') {
    const parsed = Number(rawMarkup);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_MARKUP_PERCENT) {
      throw fxError(`The FX markup setting is invalid. Set ${FX_MARKUP_SETTING_KEY} between 0 and ${MAX_MARKUP_PERCENT}.`, 'FX_MARKUP_INVALID');
    }
    markupPercent = parsed;
  }
  const enabledValue = String(values[FX_CHARGE_ENABLED_SETTING_KEY] ?? '').trim().toLowerCase();
  return {
    markupPercent,
    chargeEnabled: ['1', 'true', 'yes', 'on'].includes(enabledValue)
  };
}

async function getApprovedRate(database, currency, now = Date.now()) {
  const normalized = String(currency || '').toUpperCase();
  if (!FOREIGN_CURRENCIES.includes(normalized)) {
    throw fxError(`No exchange rate is required for ${normalized || 'this currency'}.`, 'FX_CURRENCY_UNSUPPORTED');
  }
  const row = await get(
    database,
    'SELECT currency, ghs_per_unit, suggested_source, approved_at, updated_at FROM fx_rates WHERE currency = ?',
    [normalized]
  );
  if (!row) {
    throw fxError(`No approved ${normalized} exchange rate is configured. Approve one in Admin before charging in ${normalized}.`, 'FX_RATE_INVALID');
  }
  const parsed = parseDecimalString(row.ghs_per_unit, RATE_DECIMALS);
  if (!parsed || parsed.value <= 0 || parsed.value >= MAX_RATE) {
    throw fxError(`The approved ${normalized} exchange rate is invalid. Approve a new rate in Admin.`, 'FX_RATE_INVALID');
  }
  const approvedAt = row.approved_at ? new Date(row.approved_at).getTime() : NaN;
  if (!Number.isFinite(approvedAt)) {
    throw fxError(`The approved ${normalized} exchange rate has no approval time. Approve it again in Admin.`, 'FX_RATE_INVALID');
  }
  const age = now - approvedAt;
  if (age < -5 * 60 * 1000 || age > RATE_MAX_AGE_MS) {
    throw fxError(`The approved ${normalized} exchange rate is more than 24 hours old. Approve a fresh rate in Admin before charging in ${normalized}.`, 'FX_RATE_STALE');
  }
  return {
    currency: normalized,
    midRate: parsed.value,
    approvedAt: new Date(approvedAt).toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    source: row.suggested_source ? `admin_approved:${row.suggested_source}` : 'admin_approved'
  };
}

function computeCharge(amountGhs, currency, { midRate = 1, markupPercent = 0 } = {}) {
  const normalized = String(currency || '').toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(normalized)) {
    throw fxError(`Unsupported currency "${currency}". Choose one of: ${SUPPORTED_CURRENCIES.join(', ')}.`, 'FX_CURRENCY_UNSUPPORTED');
  }
  const base = Number(amountGhs);
  if (!Number.isFinite(base) || base <= 0) {
    throw fxError('The amount to charge must be greater than zero.', 'FX_AMOUNT_INVALID');
  }
  const decimals = CURRENCY_DECIMALS[normalized];
  if (normalized === 'GHS') {
    const amount = roundUpTo(base, decimals);
    return {
      currency: normalized,
      amount,
      amountGhs: amount,
      midRate: 1,
      markupPercent: 0,
      effectiveRate: 1,
      decimals
    };
  }
  const rate = Number(midRate);
  const markup = Number(markupPercent);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw fxError(`The ${normalized} exchange rate is invalid.`, 'FX_RATE_INVALID');
  }
  if (!Number.isFinite(markup) || markup < 0 || markup > MAX_MARKUP_PERCENT) {
    throw fxError('The FX markup percentage is invalid.', 'FX_MARKUP_INVALID');
  }
  const amount = roundUpTo(base * (1 + markup / 100) / rate, decimals);
  const equivalentGhs = roundTo(amount * rate, 2);
  return {
    currency: normalized,
    amount,
    amountGhs: equivalentGhs,
    midRate: rate,
    markupPercent: markup,
    effectiveRate: rate / (1 + markup / 100),
    decimals
  };
}

async function getChargeQuote(database, amountGhs, currency, { now = Date.now(), requireEnabled = true, ttlMs = QUOTE_TTL_MS } = {}) {
  const normalized = String(currency || '').toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(normalized)) {
    throw fxError(`Unsupported currency "${currency}". Choose one of: ${SUPPORTED_CURRENCIES.join(', ')}.`, 'FX_CURRENCY_UNSUPPORTED');
  }
  if (normalized === 'GHS') {
    const charge = computeCharge(amountGhs, normalized);
    return {
      ...charge,
      rateUpdatedAt: null,
      source: 'catalog_ghs',
      provider: providerForCurrency(normalized),
      quotedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlMs).toISOString()
    };
  }
  const settings = await getFxSettings(database);
  if (requireEnabled && !settings.chargeEnabled) {
    throw fxError(`Charging in ${normalized} is not enabled yet. Choose GHS to complete this payment.`, 'FX_CHARGING_DISABLED');
  }
  const rate = await getApprovedRate(database, normalized, now);
  const charge = computeCharge(amountGhs, normalized, {
    midRate: rate.midRate,
    markupPercent: settings.markupPercent
  });
  return {
    ...charge,
    rateUpdatedAt: rate.approvedAt,
    source: rate.source,
    provider: providerForCurrency(normalized),
    quotedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString()
  };
}

function validateApprovedRate(currency, value) {
  const normalized = String(currency || '').toUpperCase();
  if (!FOREIGN_CURRENCIES.includes(normalized)) {
    return { error: `Exchange rates can only be approved for ${FOREIGN_CURRENCIES.join(', ')}.` };
  }
  const parsed = parseDecimalString(value, RATE_DECIMALS);
  if (!parsed) {
    return { error: `The ${normalized} exchange rate must be a positive number with at most ${RATE_DECIMALS} decimal places.` };
  }
  if (parsed.value <= 0 || parsed.value >= MAX_RATE) {
    return { error: `The ${normalized} exchange rate must be greater than zero and less than ${MAX_RATE}.` };
  }
  return { value: parsed.raw };
}

function validateMarkupPercent(value) {
  const parsed = parseDecimalString(value, 2);
  if (!parsed) {
    return { error: 'The FX markup must be a non-negative percentage with at most two decimal places.' };
  }
  if (parsed.value < 0 || parsed.value > MAX_MARKUP_PERCENT) {
    return { error: `The FX markup must be between 0 and ${MAX_MARKUP_PERCENT} percent.` };
  }
  return { value: parsed.value.toFixed(2) };
}

async function listFxRates(database, now = Date.now()) {
  const rows = await all(
    database,
    'SELECT currency, ghs_per_unit, suggested_ghs_per_unit, suggested_source, suggested_at, approved_at, updated_at FROM fx_rates'
  );
  return FOREIGN_CURRENCIES.map(currency => {
    const row = rows.find(candidate => String(candidate.currency).toUpperCase() === currency);
    const parsed = row ? parseDecimalString(row.ghs_per_unit, RATE_DECIMALS) : null;
    const approvedAt = row?.approved_at ? new Date(row.approved_at).getTime() : NaN;
    const fresh = Boolean(parsed) && Number.isFinite(approvedAt) && now - approvedAt >= -5 * 60 * 1000 && now - approvedAt <= RATE_MAX_AGE_MS;
    const suggestion = row?.suggested_ghs_per_unit === null || row?.suggested_ghs_per_unit === undefined
      ? null
      : { rate: Number(row.suggested_ghs_per_unit), source: row.suggested_source || null, at: row.suggested_at ? new Date(row.suggested_at).toISOString() : null };
    return {
      currency,
      provider: providerForCurrency(currency),
      decimals: CURRENCY_DECIMALS[currency],
      configured: Boolean(parsed),
      midRate: parsed ? parsed.value : null,
      approvedAt: Number.isFinite(approvedAt) ? new Date(approvedAt).toISOString() : null,
      updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
      stale: !fresh,
      suggestion
    };
  });
}

let suggestionCache = null;

function clearSuggestionCache() {
  suggestionCache = null;
}

async function fetchSuggestedRates({ fetchImpl = globalThis.fetch, now = Date.now(), force = false } = {}) {
  if (!force && suggestionCache && now - suggestionCache.cachedAtMs < SUGGESTION_CACHE_MS) {
    return suggestionCache.value;
  }
  let response;
  try {
    response = await fetchImpl(SUGGESTION_URL, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw fxError('Could not reach the exchange-rate suggestion service. Approve a rate manually.', 'FX_SUGGESTION_UNAVAILABLE');
  }
  if (!response?.ok) {
    throw fxError('The exchange-rate suggestion service returned an error. Approve a rate manually.', 'FX_SUGGESTION_UNAVAILABLE');
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw fxError('The exchange-rate suggestion service returned an invalid response.', 'FX_SUGGESTION_UNAVAILABLE');
  }
  const usdRates = payload?.result === 'success' ? payload?.rates : null;
  if (!usdRates || typeof usdRates !== 'object') {
    throw fxError('The exchange-rate suggestion service returned an invalid response.', 'FX_SUGGESTION_UNAVAILABLE');
  }
  const ghsPerUsd = Number(usdRates.GHS);
  if (!Number.isFinite(ghsPerUsd) || ghsPerUsd <= 0) {
    throw fxError('The exchange-rate suggestion service did not return a GHS rate.', 'FX_SUGGESTION_UNAVAILABLE');
  }
  const rates = {};
  for (const currency of FOREIGN_CURRENCIES) {
    const perUsd = Number(usdRates[currency]);
    if (!Number.isFinite(perUsd) || perUsd <= 0) {
      throw fxError(`The exchange-rate suggestion service did not return a ${currency} rate.`, 'FX_SUGGESTION_UNAVAILABLE');
    }
    rates[currency] = Number((ghsPerUsd / perUsd).toFixed(RATE_DECIMALS));
  }
  const value = {
    source: SUGGESTION_SOURCE,
    fetchedAt: new Date(now).toISOString(),
    base: 'GHS per unit of currency',
    rates
  };
  suggestionCache = { cachedAtMs: now, value };
  return value;
}

module.exports = {
  SUPPORTED_CURRENCIES,
  FOREIGN_CURRENCIES,
  CURRENCY_DECIMALS,
  RATE_MAX_AGE_MS,
  QUOTE_TTL_MS,
  BOOKING_QUOTE_TTL_MS,
  DEFAULT_MARKUP_PERCENT,
  MAX_MARKUP_PERCENT,
  FX_MARKUP_SETTING_KEY,
  FX_CHARGE_ENABLED_SETTING_KEY,
  isSupportedCurrency,
  providerForCurrency,
  roundUpTo,
  computeCharge,
  getFxSettings,
  getApprovedRate,
  getChargeQuote,
  listFxRates,
  validateApprovedRate,
  validateMarkupPercent,
  fetchSuggestedRates,
  clearSuggestionCache
};
