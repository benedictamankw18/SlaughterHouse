const crypto = require('node:crypto');
const config = require('../config');
const { CURRENCY_DECIMALS } = require('./fx');

const REQUEST_TIMEOUT_MS = 30000;

function flutterwaveError(message, code, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

function isConfigured() {
  return Boolean(config.flutterwaveSecretKey);
}

function hasWebhookHash() {
  return Boolean(config.flutterwaveWebhookHash);
}

function formatAmount(amount, currency) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw flutterwaveError('The Flutterwave charge amount is invalid.', 'FLW_AMOUNT_INVALID');
  }
  const decimals = CURRENCY_DECIMALS[String(currency || '').toUpperCase()] ?? 2;
  return numeric.toFixed(decimals);
}

async function request(path, { method = 'GET', body } = {}) {
  if (!isConfigured()) {
    throw flutterwaveError('Flutterwave payments are not configured. Add FLUTTERWAVE_SECRET_KEY to the backend environment.', 'FLW_NOT_CONFIGURED');
  }
  let response;
  try {
    response = await fetch(`${config.flutterwaveApiBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.flutterwaveSecretKey}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch {
    throw flutterwaveError('Flutterwave could not be reached. Try again shortly.', 'FLW_UNAVAILABLE');
  }
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // A non-JSON body is treated as an invalid provider response below.
  }
  return { response, payload };
}

async function createCheckout({ reference, amount, currency, customer, redirectUrl, meta = null }) {
  const normalizedCurrency = String(currency || '').toUpperCase();
  const { response, payload } = await request('/payments', {
    method: 'POST',
    body: {
      tx_ref: reference,
      amount: formatAmount(amount, normalizedCurrency),
      currency: normalizedCurrency,
      redirect_url: redirectUrl,
      customer: {
        email: customer?.email,
        ...(customer?.name ? { name: customer.name } : {})
      },
      customizations: { title: 'UltBigBoy' },
      ...(meta ? { meta } : {})
    }
  });
  if (!response.ok || payload?.status !== 'success' || !payload?.data?.link) {
    throw flutterwaveError(
      payload?.message || 'Flutterwave rejected the checkout request.',
      'FLW_REJECTED',
      { httpStatus: response.status }
    );
  }
  return {
    provider: 'flutterwave',
    providerReference: reference,
    authorizationUrl: payload.data.link,
    payload: payload.data
  };
}

async function verifyTransaction(reference) {
  const { response, payload } = await request(`/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`);
  if (response.status === 404) return null;
  if (!response.ok || payload?.status !== 'success' || !payload?.data) {
    throw flutterwaveError(
      payload?.message || 'Flutterwave could not verify the transaction.',
      'FLW_VERIFY_FAILED',
      { httpStatus: response.status }
    );
  }
  const data = payload.data;
  return {
    provider: 'flutterwave',
    reference: data.tx_ref,
    transactionId: data.id,
    status: data.status,
    amount: Number(data.amount),
    currency: String(data.currency || '').toUpperCase(),
    raw: data
  };
}

async function verifyTransactionById(transactionId) {
  const { response, payload } = await request(`/transactions/${encodeURIComponent(transactionId)}/verify`);
  if (response.status === 404) return null;
  if (!response.ok || payload?.status !== 'success' || !payload?.data) {
    throw flutterwaveError(
      payload?.message || 'Flutterwave could not verify the transaction.',
      'FLW_VERIFY_FAILED',
      { httpStatus: response.status }
    );
  }
  const data = payload.data;
  return {
    provider: 'flutterwave',
    reference: data.tx_ref,
    transactionId: data.id,
    status: data.status,
    amount: Number(data.amount),
    currency: String(data.currency || '').toUpperCase(),
    raw: data
  };
}

async function refundTransaction({ transactionId, amount = null }) {
  if (!transactionId) {
    throw flutterwaveError('A Flutterwave transaction ID is required to refund a payment.', 'FLW_REFUND_INVALID');
  }
  const numericAmount = Number(amount);
  const { response, payload } = await request(`/transactions/${encodeURIComponent(transactionId)}/refund`, {
    method: 'POST',
    body: Number.isFinite(numericAmount) && numericAmount > 0 ? { amount: numericAmount } : {}
  });
  if (!response.ok || payload?.status !== 'success') {
    throw flutterwaveError(
      payload?.message || 'Flutterwave rejected the refund request.',
      'FLW_REFUND_FAILED',
      { httpStatus: response.status }
    );
  }
  return {
    provider: 'flutterwave',
    transactionId,
    status: payload.data?.status || 'success',
    payload: payload.data ?? payload
  };
}

// Flutterwave signs webhooks with a shared secret echoed in the `verif-hash` header.
function verifyWebhookHash(headerValue) {
  const expected = config.flutterwaveWebhookHash;
  if (!expected || !headerValue) return false;
  const provided = Buffer.from(String(headerValue));
  const secret = Buffer.from(expected);
  return provided.length === secret.length && crypto.timingSafeEqual(provided, secret);
}

module.exports = {
  isConfigured,
  hasWebhookHash,
  createCheckout,
  verifyTransaction,
  verifyTransactionById,
  refundTransaction,
  verifyWebhookHash
};
