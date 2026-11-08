const { createNotificationSafely } = require('./notifications');
const { isEmailAddress, queueEmailSafely } = require('./email/outbox');
const config = require('../config');
const logger = require('./logger');
const { releaseBookingHold } = require('./booking-reservations');
const { parseOrderItems } = require('./order-items');

const FULL_REFUND_TOLERANCE = 0.005;

function refundEventDetails(event) {
  const data = event?.data || {};
  const reference = String(data.transaction_reference || data.transaction?.reference || data.reference || '');
  const rawAmount = Number(data.amount);
  return {
    reference,
    amountGhs: Number.isFinite(rawAmount) ? rawAmount / 100 : null,
    currency: data.currency || null,
    reason: data.reason || data.merchant_note || null,
    eventId: data.id ?? null
  };
}

function refundEventKey(event) {
  const data = event?.data || {};
  const identifier = data.id ?? data.transaction_reference ?? data.transaction?.reference ?? data.reference;
  return identifier === undefined || identifier === null || identifier === '' ? '' : `refund:${identifier}`;
}

async function notifyAdmins(db, { type, title, message }) {
  const admins = await db.all("SELECT id FROM users WHERE role IN ('admin', 'super_admin')");
  for (const admin of admins || []) {
    await createNotificationSafely(db, { userId: admin.id, type, title, message });
  }
}

async function notifyCustomer(db, order, { type, title, message }) {
  const customer = await db.get("SELECT id FROM users WHERE lower(email) = lower(?) AND role NOT IN ('admin', 'super_admin')", [order.customer_email]);
  if (customer?.id) await createNotificationSafely(db, { userId: customer.id, type, title, message });
}

async function emailAdmins(db, order, refundedAmount) {
  let admins;
  try {
    admins = await db.all("SELECT id, name, email FROM users WHERE role IN ('admin', 'super_admin')");
  } catch (error) {
    logger.error('refund_admin_recipients_load_failed', { code: error.code });
    return;
  }
  for (const admin of admins || []) {
    if (!isEmailAddress(admin.email)) continue;
    await queueEmailSafely(db, {
      to: admin.email,
      template: 'admin_alert',
      idempotencyKey: `refund-review:${order.reference}:${refundedAmount.toFixed(2)}:${admin.id}`,
      data: {
        title: 'Refund needs manual review',
        message: `Order ${order.reference} needs review after a full refund. Merchandise fulfillment or a past booking may require follow-up.`,
        reference: order.reference
      }
    });
  }
}

function parseItems(order) {
  return parseOrderItems(order.items_json) || [];
}

async function applyRefund(db, order, { amountGhs, reference, reason = null }) {
  const status = String(order.status || '');
  if (status === 'refunded') return { ignored: true, reason: 'already_refunded', refundedAmount: Number(order.refunded_amount || order.amount) };
  if (!['paid', 'partially_refunded'].includes(status)) return { ignored: true, reason: `order_${status || 'unknown'}` };

  const total = Number(order.amount);
  if (!Number.isFinite(amountGhs) || amountGhs <= 0 || !Number.isFinite(total) || total <= 0) {
    throw Object.assign(new Error('Refund amount could not be validated.'), { code: 'INVALID_REFUND_AMOUNT' });
  }
  const alreadyRefunded = Number(order.refunded_amount || 0);
  const refundedAmount = Math.min(total, Number((alreadyRefunded + amountGhs).toFixed(2)));
  const full = refundedAmount >= total - FULL_REFUND_TOLERANCE;
  const nextStatus = full ? 'refunded' : 'partially_refunded';
  const actions = [];

  await db.run(
    'UPDATE orders SET status = ?, refunded_amount = ?, refunded_at = CURRENT_TIMESTAMP WHERE id = ?',
    [nextStatus, refundedAmount, order.id]
  );
  if (full) {
    await db.run(
      `UPDATE orders
       SET fulfillment_review_required = FALSE, fulfillment_review_reason = NULL,
           fulfillment_reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND fulfillment_review_required = TRUE`,
      [order.id]
    );
  }

  const manualReview = [];
  if (full) {
    const items = parseItems(order);
    const revoked = await db.run(
      'UPDATE licenses SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP), revoked_reason = ? WHERE order_id = ? AND revoked_at IS NULL',
      [reason ? `Refund: ${reason}` : `Refund ${reference}`, order.id]
    );
    if (revoked.changes) actions.push(`revoked ${revoked.changes} license${revoked.changes === 1 ? '' : 's'}`);

    const merchandiseItems = items.filter(item => item.type === 'merchandise');
    if (merchandiseItems.length) {
      if (String(order.fulfillment_status || 'unfulfilled') === 'unfulfilled') {
        for (const item of merchandiseItems) {
          await db.run('UPDATE merchandise SET stock_quantity = stock_quantity + 1 WHERE id = ? AND stock_quantity IS NOT NULL', [item.productId]);
        }
        actions.push('restored merchandise stock');
      } else {
        manualReview.push('merchandise_already_fulfilled');
        actions.push('merchandise already fulfilled; stock not restored');
      }
    }

    const booking = await db.get('SELECT id, preferred_date FROM bookings WHERE payment_reference = ?', [order.reference]);
    if (booking) {
      await db.run('UPDATE bookings SET status = ? WHERE id = ?', ['cancelled', booking.id]);
      await db.run('UPDATE booking_availability SET status = ?, booking_id = NULL WHERE booking_id = ?', ['available', booking.id]);
      actions.push('cancelled booking and freed its slots');
      const sessionDate = String(booking.preferred_date || '').slice(0, 10);
      if (sessionDate && sessionDate < new Date().toISOString().slice(0, 10)) {
        manualReview.push('booking_session_in_past');
      }
    }
  }

  const summary = actions.length ? ` ${actions.join('; ')}.` : '';
  await notifyCustomer(db, order, {
    type: full ? 'order_refunded' : 'order_partially_refunded',
    title: full ? 'Order refunded' : 'Partial refund processed',
    message: `Order ${order.reference} was ${full ? 'fully' : 'partially'} refunded.${full ? ' Its downloads and bookings have been cancelled.' : ' Your licences remain active.'}`
  });
  await notifyAdmins(db, {
    type: manualReview.length ? 'refund_manual_review' : 'refund_processed',
    title: manualReview.length ? 'Refund needs manual review' : 'Refund processed',
    message: `Order ${order.reference}: ${full ? 'full' : 'partial'} refund of ${refundedAmount.toFixed(2)} ${order.currency}.${summary}`
  });
  await queueEmailSafely(db, {
    to: order.customer_email,
    template: 'refund_processed',
    idempotencyKey: `refund-customer:${order.reference}:${refundedAmount.toFixed(2)}`,
    data: {
      name: order.customer_name,
      reference: order.reference,
      amount: amountGhs,
      currency: order.currency,
      full,
      orderUrl: new URL('/', config.frontendOrigin).toString()
    }
  });
  if (manualReview.length) await emailAdmins(db, order, refundedAmount);

  return {
    full,
    status: nextStatus,
    refundedAmount,
    actions,
    manualReview,
    reason
  };
}

async function applyPaymentReversal(db, order, { reference, paymentData }) {
  const amountGhs = Number.isFinite(Number(paymentData?.amount)) && Number(paymentData.amount) > 0
    ? Number(paymentData.amount) / 100
    : Number(order.amount);
  await db.run(
    `INSERT INTO payments (order_id, provider, provider_reference, status, amount, currency, provider_payload, verified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (provider_reference) DO UPDATE SET order_id = EXCLUDED.order_id, status = EXCLUDED.status,
       amount = EXCLUDED.amount, currency = EXCLUDED.currency, provider_payload = EXCLUDED.provider_payload,
       verified_at = EXCLUDED.verified_at`,
    [order.id, 'paystack', reference, 'reversed', amountGhs, paymentData?.currency || order.currency, JSON.stringify(paymentData || {})]
  );
  if (['paid', 'partially_refunded'].includes(String(order.status || ''))) {
    return applyRefund(db, order, {
      amountGhs,
      reference,
      reason: 'Payment reversed by provider'
    });
  }
  if (['pending', 'failed', 'abandoned'].includes(String(order.status || ''))) {
    await db.run(
      'UPDATE orders SET status = ?, refunded_amount = amount, refunded_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['refunded', order.id]
    );
    await releaseBookingHold(db, reference);
    await notifyAdmins(db, {
      type: 'payment_reversed',
      title: 'Payment reversed',
      message: `Payment for order ${order.reference} was reversed before settlement.`
    });
    return {
      full: true,
      status: 'refunded',
      refundedAmount: Number(order.amount),
      actions: ['marked the unsettled order refunded'],
      manualReview: []
    };
  }
  return { ignored: true, reason: `order_${order.status || 'unknown'}` };
}

module.exports = { FULL_REFUND_TOLERANCE, refundEventDetails, refundEventKey, applyRefund, applyPaymentReversal };
