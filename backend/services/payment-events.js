const { createNotificationSafely, notifyAdminsSafely } = require('./notifications');
const { releaseBookingHold } = require('./booking-reservations');
const { recordPayment } = require('./payment-records');

function paymentFailureStatus(eventType, paymentStatus) {
  const event = String(eventType || '').toLowerCase();
  const status = String(paymentStatus || '').toLowerCase();
  if (event === 'charge.reversed' || status === 'reversed') return 'reversed';
  if (event === 'transaction.abandoned' || status === 'abandoned') return 'abandoned';
  if (event === 'charge.failed' || status === 'failed') return 'failed';
  return null;
}

function isRefundEvent(eventType) {
  return String(eventType || '').toLowerCase().startsWith('refund.');
}

async function recordNonSuccessPayment(db, order, { reference, status, paymentData, payment }) {
  if (!order) return;
  const settledStatuses = ['paid', 'partially_refunded', 'refunded'];
  if (settledStatuses.includes(String(order.status || ''))) return;
  const provider = payment?.provider || order.provider || 'paystack';
  const paymentAmount = Number(payment?.amount);
  const legacyAmount = Number(paymentData?.amount);
  const amount = Number.isFinite(paymentAmount) && paymentAmount > 0
    ? paymentAmount
    : Number.isFinite(legacyAmount) && legacyAmount > 0
      ? (provider === 'paystack' ? legacyAmount / 100 : legacyAmount)
      : 0;
  const currency = payment?.currency || paymentData?.currency || order.currency || 'GHS';
  const amountGhs = Number(order.amount_ghs ?? amount);
  await recordPayment(db.run.bind(db), {
    orderId: order.id,
    provider,
    reference,
    transactionId: payment?.transactionId ?? null,
    status,
    amount,
    currency,
    amountGhs: Number.isFinite(amountGhs) && amountGhs > 0 ? amountGhs : amount,
    payload: payment?.raw ?? paymentData ?? {}
  });
  if (status !== 'failed' && status !== 'abandoned') return;
  await db.run(
    'UPDATE orders SET status = ? WHERE id = ? AND status IN (?, ?, ?)',
    [status, order.id, 'pending', 'failed', 'abandoned']
  );
  await releaseBookingHold(db, reference);
  const customer = await db.get("SELECT id FROM users WHERE lower(email) = lower(?) AND role NOT IN ('admin', 'super_admin')", [order.customer_email]);
  if (customer?.id) await createNotificationSafely(db, {
    userId: customer.id,
    type: `payment_${status}`,
    title: status === 'abandoned' ? 'Payment not completed' : 'Payment failed',
    message: `Payment for order ${order.reference} was ${status}. You can retry checkout from your order page.`,
    dedupeKey: `payment-${status}:${reference}:${customer.id}`
  });
  await notifyAdminsSafely(db, {
    type: 'payment_failed',
    title: status === 'abandoned' ? 'Payment abandoned' : 'Payment failed',
    message: `Payment ${reference} for order ${order.reference} (${amount} ${currency}) was ${status}.`,
    dedupeKey: `payment-${status}:${reference}`
  });
}

module.exports = { paymentFailureStatus, isRefundEvent, recordNonSuccessPayment };
