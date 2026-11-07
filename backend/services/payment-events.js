const { createNotificationSafely, notifyAdminsSafely } = require('./notifications');
const { releaseBookingHold } = require('./booking-reservations');

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

async function recordNonSuccessPayment(db, order, { reference, status, paymentData }) {
  if (!order) return;
  const settledStatuses = ['paid', 'partially_refunded', 'refunded'];
  if (settledStatuses.includes(String(order.status || ''))) return;
  await db.run(
    `INSERT INTO payments (order_id, provider, provider_reference, status, amount, currency, provider_payload)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (provider_reference) DO UPDATE SET order_id = EXCLUDED.order_id, status = EXCLUDED.status,
       amount = EXCLUDED.amount, currency = EXCLUDED.currency, provider_payload = EXCLUDED.provider_payload`,
    [order.id, 'paystack', reference, status, Number(paymentData?.amount || 0) / 100, paymentData?.currency || order.currency || 'GHS', JSON.stringify(paymentData || {})]
  );
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
    message: `Payment ${reference} for order ${order.reference} (${Number(paymentData?.amount || 0) / 100} ${paymentData?.currency || order.currency}) was ${status}.`,
    dedupeKey: `payment-${status}:${reference}`
  });
}

module.exports = { paymentFailureStatus, isRefundEvent, recordNonSuccessPayment };
