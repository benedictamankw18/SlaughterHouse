const PAYMENT_PROVIDERS = Object.freeze(['paystack', 'flutterwave']);

// Payment provider values are security-sensitive: an unrecognized value must
// never silently fall back to another provider. Callers decide how to fail.
function normalizePaymentProvider(value) {
  if (typeof value !== 'string') return null;
  const provider = value.trim().toLowerCase();
  return PAYMENT_PROVIDERS.includes(provider) ? provider : null;
}

function paymentProvider(order) {
  return normalizePaymentProvider(order?.provider);
}

module.exports = { PAYMENT_PROVIDERS, normalizePaymentProvider, paymentProvider };
