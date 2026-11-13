const PAYMENT_REFERENCE_CONFLICT = 'PAYMENT_REFERENCE_CONFLICT';
const PAYMENT_REFERENCE_CONFLICT_MESSAGE = 'This payment reference is already recorded for another order.';

function paymentReferenceConflict(reference, orderId) {
  return Object.assign(new Error(PAYMENT_REFERENCE_CONFLICT_MESSAGE), {
    code: PAYMENT_REFERENCE_CONFLICT,
    reference,
    orderId
  });
}

// A payment row is keyed by provider_reference, which mirrors the order reference.
// Once written, its order_id and provider are immutable: a conflicting insert must
// never re-point an existing payment at another order or provider. The guard turns
// a would-be reassignment into an explicit conflict for the caller to reconcile.
const CONFLICT_GUARD = 'WHERE payments.order_id = EXCLUDED.order_id AND payments.provider = EXCLUDED.provider';

const INSERT_VERIFIED = `INSERT INTO payments (order_id, provider, provider_reference, provider_transaction_id, status, amount, currency, amount_ghs, provider_payload, verified_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT (provider_reference) DO UPDATE SET
    status = EXCLUDED.status,
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    amount_ghs = EXCLUDED.amount_ghs,
    provider_transaction_id = EXCLUDED.provider_transaction_id,
    provider_payload = EXCLUDED.provider_payload,
    verified_at = EXCLUDED.verified_at
  ${CONFLICT_GUARD}
  RETURNING id`;

const INSERT_PENDING = `INSERT INTO payments (order_id, provider, provider_reference, provider_transaction_id, status, amount, currency, amount_ghs, provider_payload)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (provider_reference) DO UPDATE SET
    status = EXCLUDED.status,
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    amount_ghs = EXCLUDED.amount_ghs,
    provider_transaction_id = EXCLUDED.provider_transaction_id,
    provider_payload = EXCLUDED.provider_payload
  ${CONFLICT_GUARD}
  RETURNING id`;

// `run` is any promise-returning runner exposing `changes` (the database helper in
// the route modules and the transaction runner both satisfy this).
async function recordPayment(run, {
  orderId,
  provider,
  reference,
  transactionId = null,
  status,
  amount,
  currency,
  amountGhs,
  payload,
  verified = false
}) {
  const providerPayload = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
  const result = await run(verified ? INSERT_VERIFIED : INSERT_PENDING, [
    orderId,
    provider,
    reference,
    transactionId,
    status,
    amount,
    currency,
    amountGhs,
    providerPayload
  ]);
  if (!result?.changes) throw paymentReferenceConflict(reference, orderId);
  return result;
}

module.exports = {
  PAYMENT_REFERENCE_CONFLICT,
  PAYMENT_REFERENCE_CONFLICT_MESSAGE,
  paymentReferenceConflict,
  recordPayment
};
