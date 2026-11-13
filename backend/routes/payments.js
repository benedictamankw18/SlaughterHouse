const express = require('express');
const crypto = require('node:crypto');
const database = require('../database');
const config = require('../config');
const { getDownloadItems } = require('../services/downloads');
const { parseOrderItems } = require('../services/order-items');
const { priceCartItems, hasPaidExclusiveLicense } = require('../services/order-pricing');
const { getChargeQuote, isSupportedCurrency, QUOTE_TTL_MS } = require('../services/fx');
const {
  createCheckout: createFlutterwaveCheckout,
  isConfigured: isFlutterwaveConfigured,
  hasWebhookHash: hasFlutterwaveWebhookHash,
  verifyTransaction: verifyFlutterwaveTransaction,
  verifyWebhookHash: verifyFlutterwaveWebhookHash
} = require('../services/flutterwave');
const { databaseError } = require('../services/error-messages');
const validators = require('../services/input-validation');
const { recordAuditSafely } = require('../services/audit');
const { createNotificationSafely, notifyAdminsSafely } = require('../services/notifications');
const { loadLicenseRights, rightsFor } = require('../services/license-rights');
const { issueCertificateRecord } = require('../services/license-certificates');
const { refundEventDetails, refundEventKey, flutterwaveRefundDetails, flutterwaveRefundKey, applyRefund, applyPaymentReversal } = require('../services/refunds');
const { paymentFailureStatus, isRefundEvent, recordNonSuccessPayment } = require('../services/payment-events');
const { queueEmailSafely } = require('../services/email/outbox');
const { fulfillPaidBooking } = require('../services/booking-fulfillment');
const { rateLimit } = require('../services/rate-limit');
const logger = require('../services/logger');

const router = express.Router();
const { apiPublicUrl, paymentCallbackUrl, paystackSecretKey } = config;
const LOW_STOCK_THRESHOLD = 5;
const paymentInitializationRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many payment initialization requests. Try again later.' });
const paymentQuoteRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, message: 'Too many price quote requests. Try again shortly.' });
const paymentVerificationRateLimit = rateLimit({ windowMs: 60 * 1000, max: 30, message: 'Too many payment verification requests. Try again shortly.' });
const paymentWebhookRateLimit = rateLimit({ windowMs: 60 * 1000, max: 300, message: 'Too many payment webhook requests. Try again shortly.' });
const run = (query, parameters = []) => new Promise((resolve, reject) => database.run(query, parameters, function (error) { error ? reject(error) : resolve(this); }));
const get = (query, parameters = []) => new Promise((resolve, reject) => database.get(query, parameters, (error, row) => error ? reject(error) : resolve(row)));

const FX_HTTP_STATUS = Object.freeze({
  FX_CURRENCY_UNSUPPORTED: 400,
  FX_AMOUNT_INVALID: 400,
  FX_CHARGING_DISABLED: 409,
  FX_RATE_STALE: 503,
  FX_RATE_INVALID: 503,
  FX_MARKUP_INVALID: 503,
  USD_GHS_RATE_INVALID: 503,
  USD_GHS_RATE_STALE: 503,
  CART_ITEM_INVALID: 400,
  FLW_NOT_CONFIGURED: 503,
  FLW_UNAVAILABLE: 503,
  FLW_REJECTED: 502,
  FLW_AMOUNT_INVALID: 400,
  FLW_VERIFY_FAILED: 502,
  FLW_REFUND_INVALID: 400,
  FLW_REFUND_FAILED: 502
});

function quoteErrorStatus(code) {
  return FX_HTTP_STATUS[code] || null;
}

function rejectWebhook(httpStatus, body) {
  throw Object.assign(new Error(body.error), { webhookResponse: { httpStatus, body } });
}

async function decrementMerchandiseStock(db, items, orderReference) {
  for (const item of items.filter(candidate => candidate.type === 'merchandise')) {
    const inventory = await db.get('SELECT title, stock_quantity, catalog_status FROM merchandise WHERE id = ? FOR UPDATE', [item.productId]);
    if (!inventory || inventory.catalog_status !== 'published') {
      throw Object.assign(new Error(`${item.name} is no longer available.`), { code: 'PRODUCT_UNAVAILABLE' });
    }
    const result = await db.run("UPDATE merchandise SET stock_quantity = stock_quantity - 1 WHERE id = ? AND catalog_status = 'published' AND (stock_quantity IS NULL OR stock_quantity > 0)", [item.productId]);
    if (!result.changes) throw Object.assign(new Error(`${item.name} is out of stock.`), { code: 'OUT_OF_STOCK' });
    const remaining = inventory?.stock_quantity === null ? null : Number(inventory?.stock_quantity) - 1;
    if (remaining !== null && remaining >= 0 && remaining <= LOW_STOCK_THRESHOLD && Number(inventory?.stock_quantity) > LOW_STOCK_THRESHOLD) {
      await notifyAdminsSafely(db, {
        type: 'low_stock',
        title: 'Merchandise stock is low',
        message: `${inventory.title || item.name} has ${remaining} item${remaining === 1 ? '' : 's'} remaining.`,
        dedupeKey: `low-stock:${item.productId}:${orderReference}`
      });
    }
  }
}

function saleAmount(item) {
  if (item.type === 'merchandise') return item.priceGhs;
  if (item.type === 'booking') return item.feeGhs;
  return item.priceGhs !== null && item.priceGhs !== undefined && Number.isFinite(Number(item.priceGhs))
    ? Number(item.priceGhs)
    : null;
}

function amountToCents(amount) {
  return Math.round(Number(amount) * 100);
}

// Receipts show the amount actually charged. Line items are stored in GHS, so
// allocate the charged total proportionally and give the last line the remainder
// to guarantee the lines always sum to the charged total.
function allocateReceiptItems(order, items) {
  const totalCents = amountToCents(order.amount);
  const weights = items.map(item => {
    const amount = Number(saleAmount(item));
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  });
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  let allocatedCents = 0;
  return items.map((item, index) => {
    const isLast = index === items.length - 1;
    const cents = isLast
      ? Math.max(0, totalCents - allocatedCents)
      : weightTotal > 0
        ? Math.round(totalCents * weights[index] / weightTotal)
        : 0;
    allocatedCents += cents;
    return {
      name: item.name,
      license: item.license,
      amount: cents / 100
    };
  });
}

function paymentProvider(order) {
  return String(order?.provider || 'paystack').toLowerCase() === 'flutterwave' ? 'flutterwave' : 'paystack';
}

// Canonical charge shape shared by both providers: amounts are major units.
function normalizePaystackPayment(data = {}) {
  return {
    provider: 'paystack',
    reference: String(data.reference || ''),
    transactionId: data.id ?? null,
    status: String(data.status || '').toLowerCase(),
    amount: Number(data.amount) / 100,
    currency: String(data.currency || '').toUpperCase(),
    raw: data
  };
}

function normalizeFlutterwavePayment(data = {}) {
  const status = String(data.status || '').toLowerCase();
  return {
    provider: 'flutterwave',
    reference: String(data.tx_ref || data.reference || ''),
    transactionId: data.id ?? null,
    status: status === 'successful' ? 'success' : status,
    amount: Number(data.amount),
    currency: String(data.currency || '').toUpperCase(),
    raw: data
  };
}

function chargeMatchesOrder(order, payment) {
  if (!payment.currency || payment.currency !== String(order.currency || '').toUpperCase()) return false;
  const expected = Number(order.amount);
  const actual = Number(payment.amount);
  if (!Number.isFinite(expected) || !Number.isFinite(actual)) return false;
  return amountToCents(actual) === amountToCents(expected);
}

function orderAmountGhs(order, fallback) {
  const stored = Number(order.amount_ghs);
  if (Number.isFinite(stored) && stored > 0) return stored;
  return Number(fallback);
}

function snapshotLegacyBeatPrices(order, items) {
  const missing = items.filter(item => (item.type || 'beat') === 'beat'
    && (item.priceGhs === null || item.priceGhs === undefined || !Number.isFinite(Number(item.priceGhs))));
  if (!missing.length) return items;
  const missingSet = new Set(missing);
  const knownAmount = items.reduce((sum, item) => {
    if (missingSet.has(item)) return sum;
    const amount = item.type === 'booking' ? item.feeGhs : item.priceGhs;
    return sum + (Number.isFinite(Number(amount)) ? amountToCents(amount) : 0);
  }, 0);
  const remainingCents = amountToCents(order.amount) - knownAmount;
  const totalUsd = missing.reduce((sum, item) => sum + Number(item.priceUsd), 0);
  if (!Number.isFinite(remainingCents) || remainingCents <= 0 || !Number.isFinite(totalUsd) || totalUsd <= 0 || missing.some(item => !Number.isFinite(Number(item.priceUsd)) || Number(item.priceUsd) <= 0)) {
    throw Object.assign(new Error('The saved order prices cannot be reconciled to its quoted total.'), { code: 'ORDER_PRICING_INVALID' });
  }
  const rate = remainingCents / 100 / totalUsd;
  let allocatedCents = 0;
  let remainingItems = missing.length;
  return items.map(item => {
    if (!missingSet.has(item)) return item;
    remainingItems -= 1;
    const priceCents = remainingItems === 0
      ? remainingCents - allocatedCents
      : Math.round(remainingCents * Number(item.priceUsd) / totalUsd);
    allocatedCents += priceCents;
    return { ...item, priceGhs: priceCents / 100, exchangeRate: rate };
  });
}

// Idempotent per order line: a retried verification/webhook cannot double-count revenue.
async function recordOrderSales(db, order, items) {
  for (const [lineIndex, item] of items.entries()) {
    const amount = saleAmount(item);
    if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) continue;
    await db.run(
      `INSERT INTO sales (order_reference, line_index, sale_type, product_id, product_name, buyer_name, buyer_email, amount, currency, amount_ghs)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'GHS', ?)
       ON CONFLICT (order_reference, line_index) DO UPDATE SET amount = EXCLUDED.amount, amount_ghs = EXCLUDED.amount_ghs`,
      [
        order.reference,
        lineIndex,
        item.type || 'beat',
        item.type === 'booking' ? null : item.productId,
        item.type === 'beat' || !item.type ? `${item.name} (${item.license})` : item.name,
        order.customer_name,
        order.customer_email,
        amount,
        amount
      ]
    );
  }
}

async function normalizePaidOrder(db, order, items, payment) {
  for (const item of items) {
    if (item.type === 'booking') continue;
    await db.run(
      `INSERT INTO order_items (order_id, product_type, product_id, product_name, license_type, unit_amount, currency, exchange_rate, quantity)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, 1
       WHERE NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = ? AND product_type = ? AND product_id = ? AND COALESCE(license_type, '') = COALESCE(?, ''))`,
      [order.id, item.type || 'beat', item.productId, item.name, item.license || null, item.priceGhs, 'GHS', item.exchangeRate || null, order.id, item.type || 'beat', item.productId, item.license || null]
    );
  }

  await db.run(
    `INSERT INTO payments (order_id, provider, provider_reference, provider_transaction_id, status, amount, currency, amount_ghs, provider_payload, verified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (provider_reference) DO UPDATE SET order_id = EXCLUDED.order_id, status = EXCLUDED.status,
       amount = EXCLUDED.amount, currency = EXCLUDED.currency, amount_ghs = EXCLUDED.amount_ghs,
       provider_transaction_id = EXCLUDED.provider_transaction_id,
       provider_payload = EXCLUDED.provider_payload, verified_at = EXCLUDED.verified_at`,
    [
      order.id,
      payment.provider,
      payment.reference,
      payment.transactionId ?? null,
      'paid',
      payment.amount,
      payment.currency,
      orderAmountGhs(order, payment.amount),
      JSON.stringify(payment.raw ?? payment)
    ]
  );

  const customer = await db.get("SELECT id FROM users WHERE lower(email) = lower(?) AND role NOT IN ('admin', 'super_admin')", [order.customer_email]);
  if (!customer) return;
  const licenseRights = await loadLicenseRights(db);
  for (const item of items.filter(candidate => candidate.type === 'beat')) {
    const rights = rightsFor(licenseRights, item.license);
    await db.run(
      `INSERT INTO licenses (user_id, beat_id, order_id, license_type, rights_json, expires_at)
       SELECT ?, ?, ?, ?, ?, CURRENT_TIMESTAMP + INTERVAL '1 year'
       WHERE NOT EXISTS (SELECT 1 FROM licenses WHERE order_id = ? AND beat_id = ? AND license_type = ?)`,
      [customer.id, item.productId, order.id, item.license, JSON.stringify(rights), order.id, item.productId, item.license]
    );
    const license = await db.get(
      'SELECT id FROM licenses WHERE order_id = ? AND beat_id = ? AND license_type = ? FOR UPDATE',
      [order.id, item.productId, item.license]
    );
    if (license?.id) await issueCertificateRecord(db, license.id);
  }
  await createNotificationSafely(db, {
    userId: customer.id,
    type: 'order_paid',
    title: 'Payment confirmed',
    message: `Order ${order.reference} was paid successfully.`
  });
  const licenseCount = items.filter(item => item.type === 'beat').length;
  if (licenseCount) {
    await createNotificationSafely(db, {
      userId: customer.id,
      type: 'license_created',
      title: 'License ready',
      message: `${licenseCount} beat license${licenseCount === 1 ? '' : 's'} is now available in your account.`
    });
    await queueEmailSafely(db, {
      to: order.customer_email,
      template: 'license_issued',
      idempotencyKey: `license-issued:${order.reference}`,
      data: {
        name: order.customer_name,
        licenses: items
          .filter(item => item.type === 'beat')
          .map(item => ({ name: item.name, license: item.license })),
        accountUrl: new URL('/', config.frontendOrigin).toString()
      }
    });
  }
}

async function completePaidOrder(db, order, items, payment) {
  await decrementMerchandiseStock(db, items, order.reference);
  await db.run('UPDATE orders SET status = ?, items_json = ? WHERE reference = ? AND status <> ?', ['paid', JSON.stringify(items), order.reference, 'paid']);
  await recordOrderSales(db, order, items);
  await normalizePaidOrder(db, order, items, payment);
  if (!items.some(item => item.type === 'booking')) await notifyAdminsSafely(db, {
    type: 'order_paid',
    title: 'Order paid',
    message: `Order ${order.reference} from ${order.customer_name} was paid for ${Number(order.amount).toFixed(2)} ${order.currency}.`,
    dedupeKey: `order-paid:${order.reference}`
  });
  await queueEmailSafely(db, {
    to: order.customer_email,
    template: 'order_receipt',
    idempotencyKey: `order-receipt:${order.reference}`,
    data: {
      name: order.customer_name,
      reference: order.reference,
      currency: order.currency,
      total: order.amount,
      items: allocateReceiptItems(order, items),
      orderUrl: new URL('/', config.frontendOrigin).toString()
    }
  });
}

async function markBookingForReview(db, order, items, payment, reason = 'booking_slot_unavailable') {
  await markOrderForReview(db, order, items, payment, reason);
}

async function markOrderForReview(db, order, items, payment, reason) {
  await db.run(
    'UPDATE orders SET status = ?, items_json = ?, fulfillment_review_required = TRUE, fulfillment_review_reason = ? WHERE id = ?',
    ['paid', JSON.stringify(items), reason, order.id]
  );
  await db.run(
    `INSERT INTO payments (order_id, provider, provider_reference, provider_transaction_id, status, amount, currency, amount_ghs, provider_payload, verified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (provider_reference) DO UPDATE SET order_id = EXCLUDED.order_id, status = EXCLUDED.status,
       amount = EXCLUDED.amount, currency = EXCLUDED.currency, amount_ghs = EXCLUDED.amount_ghs,
       provider_transaction_id = EXCLUDED.provider_transaction_id,
       provider_payload = EXCLUDED.provider_payload, verified_at = EXCLUDED.verified_at`,
    [
      order.id,
      payment.provider,
      payment.reference,
      payment.transactionId ?? null,
      'paid',
      payment.amount,
      payment.currency,
      orderAmountGhs(order, payment.amount),
      JSON.stringify(payment.raw ?? payment)
    ]
  );
  await recordOrderSales(db, order, items);
}

async function notifyBookingNeedsReview(db, order, reason) {
  await notifyOrderNeedsReview(db, order, reason, 'booking');
}

async function notifyOrderNeedsReview(db, order, reason, type = 'booking') {
  await notifyAdminsSafely(db, {
    type: 'payment_reconciliation',
    title: `Paid ${type} needs fulfillment review`,
    message: `Order ${order.reference} was paid but its ${type} could not be fulfilled automatically (${reason}). Review the order and arrange fulfillment or refund.`,
    dedupeKey: `payment-reconciliation:${order.reference}:${reason}`
  });
  const customer = await db.get("SELECT id FROM users WHERE lower(email) = lower(?) AND role NOT IN ('admin', 'super_admin')", [order.customer_email]);
  if (customer?.id) await createNotificationSafely(db, {
    userId: customer.id,
    type: `${type}_payment_review`,
    title: 'Your paid order needs follow-up',
    message: 'We received your payment, but your order could not be fulfilled automatically. Our team will contact you to arrange fulfillment or a refund.'
  });
  await recordAuditSafely(database, {
    action: `${type}_payment_reconciliation_required`,
    entityType: 'order',
    entityId: order.id,
    details: { reference: order.reference, reason }
  });
}

async function lockExclusiveBeats(db, items) {
  const beatIds = [...new Set(items
    .filter(item => item.type === 'beat' && item.license === 'exclusive')
    .map(item => Number(item.productId)))].sort((left, right) => left - right);
  for (const beatId of beatIds) await db.get('SELECT id FROM beats WHERE id = ? FOR UPDATE', [beatId]);
  return beatIds;
}

async function hasConflictingExclusiveSale(db, items, orderReference) {
  const beatIds = [...new Set(items
    .filter(item => item.type === 'beat' && item.license === 'exclusive')
    .map(item => Number(item.productId)))];
  for (const beatId of beatIds) {
    if (await hasPaidExclusiveLicense(db.all.bind(db), beatId, orderReference)) return beatId;
  }
  return null;
}

router.post('/payments/webhook', paymentWebhookRateLimit, async (request, response) => {
  const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.from('');
  const flutterwaveHash = request.get('verif-hash');
  let provider;
  let event;
  if (flutterwaveHash !== undefined) {
    if (!isFlutterwaveConfigured() || !hasFlutterwaveWebhookHash()) {
      return response.status(503).json({ error: 'Flutterwave webhooks are unavailable because FLUTTERWAVE_SECRET_KEY or FLUTTERWAVE_WEBHOOK_HASH is not configured.' });
    }
    if (!verifyFlutterwaveWebhookHash(flutterwaveHash)) return response.status(401).json({ error: 'Invalid Flutterwave webhook signature.' });
    provider = 'flutterwave';
    try { event = JSON.parse(rawBody.toString('utf8')); } catch { return response.status(400).json({ error: 'Payment webhook payload is invalid JSON.' }); }
  } else {
    if (!paystackSecretKey) return response.status(503).json({ error: 'Payment webhooks are unavailable because PAYSTACK_SECRET_KEY is not configured.' });
    const signature = request.get('x-paystack-signature');
    const expectedSignature = crypto.createHmac('sha512', paystackSecretKey).update(rawBody).digest('hex');
    if (!signature || signature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return response.status(401).json({ error: 'Invalid payment webhook signature.' });
    provider = 'paystack';
    try { event = JSON.parse(rawBody.toString('utf8')); } catch { return response.status(400).json({ error: 'Payment webhook payload is invalid JSON.' }); }
  }

  let eventType;
  let eventReference;
  let isRefund = false;
  let isReversal = false;
  let flutterwaveRefund = false;
  let failureStatus = null;
  let refund = null;
  let payment = null;

  if (provider === 'flutterwave') {
    // Refund notifications arrive as a flat object with no `event` field and no currency.
    flutterwaveRefund = !event.event && (event.AmountRefunded !== undefined || event.TransactionId !== undefined);
    if (flutterwaveRefund) {
      isRefund = true;
      refund = flutterwaveRefundDetails(event);
      if (!refund.transactionId) return response.status(400).json({ error: 'Flutterwave refund webhook is missing its transaction id.' });
      eventType = 'refund.completed';
      eventReference = flutterwaveRefundKey(event) || `refund:${refund.transactionId}`;
    } else {
      if (String(event.event || '').toLowerCase() !== 'charge.completed') {
        return response.json({ received: true, ignored: true });
      }
      const txRef = String(event.data?.tx_ref || event.data?.reference || '');
      if (!txRef) return response.status(400).json({ error: 'Flutterwave webhook is missing its transaction reference.' });
      let verified;
      try {
        verified = await verifyFlutterwaveTransaction(txRef);
      } catch (error) {
        logger.error('flutterwave_webhook_verify_failed', { code: error.code });
        return response.status(quoteErrorStatus(error.code) || 502).json({ error: 'The Flutterwave transaction could not be verified.' });
      }
      if (!verified) return response.status(404).json({ error: `No Flutterwave transaction was found for reference ${txRef}.` });
      payment = normalizeFlutterwavePayment(verified.raw);
      eventReference = payment.reference || txRef;
      failureStatus = paymentFailureStatus(event.event, payment.status);
      isReversal = failureStatus === 'reversed';
      eventType = payment.status === 'success' ? 'charge.success' : failureStatus ? `charge.${failureStatus}` : 'charge.pending';
    }
  } else {
    eventType = String(event.event || '').toLowerCase();
    isRefund = isRefundEvent(eventType);
    failureStatus = paymentFailureStatus(eventType, event.data?.status);
    isReversal = !isRefund && failureStatus === 'reversed';
    refund = isRefund || isReversal ? refundEventDetails(event) : null;
    eventReference = isRefund
      ? refundEventKey(event)
      : isReversal
        ? String(refund.reference || event.data?.id || '')
        : String(event.data?.reference || event.data?.id || '');
    payment = normalizePaystackPayment(event.data || {});
  }

  if (!eventReference || !eventType) return response.status(400).json({ error: 'Payment webhook is missing its event reference or type.' });

  try {
    const outcome = await database.transaction(async tx => {
      const stored = await tx.get(
        `INSERT INTO payment_webhook_events (provider, event_reference, event_type, payload)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (provider, event_reference, event_type) DO NOTHING
         RETURNING id`,
        [provider, eventReference, eventType, JSON.stringify(event)]
      );
      if (!stored) return { duplicate: true };
      if (isRefund || isReversal) {
        let order;
        if (flutterwaveRefund) {
          order = await tx.get(
            `SELECT o.* FROM orders o
             JOIN payments p ON p.order_id = o.id
             WHERE p.provider = ? AND p.provider_transaction_id = ?
             ORDER BY p.verified_at DESC NULLS LAST LIMIT 1 FOR UPDATE`,
            ['flutterwave', String(refund.transactionId)]
          );
          if (!order) rejectWebhook(404, { error: `No order was found for Flutterwave refund ${refund.transactionId}.` });
        } else {
          if (!refund.reference) rejectWebhook(400, { error: 'Refund webhook is missing its transaction reference.' });
          order = await tx.get('SELECT * FROM orders WHERE reference = ? FOR UPDATE', [refund.reference]);
          if (!order) rejectWebhook(404, { error: `No order was found for refund reference ${refund.reference}.` });
        }
        const refundCompleted = flutterwaveRefund
          ? ['completed', 'successful'].includes(String(refund.status || '').toLowerCase())
          : eventType === 'refund.processed';
        if (isRefund && !refundCompleted) {
          return { processed: true, audit: { action: 'refund_event_ignored', details: { reference: order.reference, event: eventType } } };
        }
        if (refund.currency && refund.currency !== order.currency) rejectWebhook(400, { error: 'Refund currency does not match the order currency.' });
        const refundAmount = isReversal
          ? (Number.isFinite(refund.amountGhs) ? refund.amountGhs : Number(order.amount))
          : (flutterwaveRefund ? refund.amount : refund.amountGhs);
        if (!Number.isFinite(refundAmount) || refundAmount <= 0) rejectWebhook(400, { error: 'Refund amount could not be validated.' });
        if (isReversal) {
          const result = await applyPaymentReversal(tx, order, { reference: order.reference, payment });
          return { processed: true, orderId: order.id, refund: result, eventType };
        }
        const result = await applyRefund(tx, order, {
          amountGhs: refundAmount,
          reference: order.reference,
          reason: refund.reason || null
        });
        return { processed: true, orderId: order.id, refund: result, eventType };
      }
      const order = await tx.get('SELECT * FROM orders WHERE reference = ? FOR UPDATE', [eventReference]);
      if (eventType !== 'charge.success' || payment.status !== 'success') {
        await recordNonSuccessPayment(tx, order, {
          reference: eventReference,
          status: failureStatus || payment.status || eventType,
          payment
        });
        return { processed: true };
      }
      if (!order) rejectWebhook(404, { error: `No order was found for payment reference ${eventReference}.` });
      if (order.status === 'paid' || order.status === 'partially_refunded') return { processed: true, orderId: order.id };
      if (order.status === 'refunded') return {
        processed: true,
        orderId: order.id,
        conflict: { reason: 'order_already_refunded', reference: eventReference }
      };
      if (!chargeMatchesOrder(order, payment)) rejectWebhook(400, { error: 'Payment webhook amount could not be reconciled.' });
      const orderItems = parseOrderItems(order.items_json);
      if (!orderItems) rejectWebhook(500, { error: 'Order data is invalid.' });
      let items;
      try { items = snapshotLegacyBeatPrices(order, orderItems); } catch (error) {
        rejectWebhook(500, { error: error.code === 'ORDER_PRICING_INVALID' ? error.message : 'Order data is invalid.' });
      }
      await lockExclusiveBeats(tx, items);
      const conflictingBeatId = await hasConflictingExclusiveSale(tx, items, order.reference);
      if (conflictingBeatId) {
        return {
          processed: true,
          orderId: order.id,
          conflict: { reason: 'exclusive_license_already_sold', beatId: conflictingBeatId, reference: eventReference }
        };
      }
      const bookingItem = items.find(item => item.type === 'booking');
      if (bookingItem) {
        try {
          await fulfillPaidBooking(tx, order, bookingItem);
        } catch (error) {
          if (error.code === 'BOOKING_SLOT_UNAVAILABLE' || error.code === 'ER_DUP_ENTRY') {
            await markBookingForReview(tx, order, items, payment);
            return {
              processed: true,
              orderId: order.id,
              order,
              reviewRequired: true,
              conflict: { reason: 'booking_slot_unavailable', reference: eventReference }
            };
          }
          throw error;
        }
      }
      try {
        await completePaidOrder(tx, order, items, payment);
      } catch (error) {
        if (error.code !== 'OUT_OF_STOCK') throw error;
        await markOrderForReview(tx, order, items, payment, 'merchandise_out_of_stock');
        return {
          processed: true,
          orderId: order.id,
          reviewRequired: true,
          conflict: { reason: 'merchandise_out_of_stock', reference: eventReference }
        };
      }
      return { processed: true, orderId: order.id };
    });
    if (outcome.duplicate) return response.json({ received: true, duplicate: true });
    if (outcome.conflict) {
      if (outcome.reviewRequired) {
        const reviewType = outcome.conflict.reason === 'merchandise_out_of_stock' ? 'merchandise' : 'booking';
        await notifyOrderNeedsReview(database, outcome.order, outcome.conflict.reason, reviewType);
        return response.json({ received: true, conflict: outcome.conflict.reason });
      }
      recordAuditSafely(database, { action: 'payment_webhook_conflict', entityType: 'order', entityId: outcome.orderId, details: { ...outcome.conflict, event: eventType } });
      await notifyAdminsSafely(database, {
        type: 'payment_reconciliation',
        title: 'Paid order needs fulfillment review',
        message: `Order ${eventReference} was paid but could not be fulfilled automatically (${outcome.conflict.reason}). Review the order and arrange fulfillment or refund.`,
        dedupeKey: `payment-reconciliation:${eventReference}:${eventType}`
      });
      return response.json({ received: true, conflict: outcome.conflict.reason || 'exclusive_license_already_sold' });
    }
    if (outcome.audit) {
      recordAuditSafely(database, { action: outcome.audit.action, entityType: 'order', entityId: outcome.orderId, details: outcome.audit.details });
    }
    if (outcome.refund) {
      const action = outcome.refund.ignored
        ? 'refund_ignored'
        : outcome.refund.full ? 'order_refunded' : 'order_partially_refunded';
      recordAuditSafely(database, { action, entityType: 'order', entityId: outcome.orderId, details: { ...outcome.refund, event: outcome.eventType } });
      return response.json({ received: true, refund: { status: outcome.refund.status || 'ignored', full: Boolean(outcome.refund.full) } });
    }
    if (outcome.orderId) {
      recordAuditSafely(database, { action: 'payment_webhook_processed', entityType: 'order', entityId: outcome.orderId, details: { reference: eventReference, event: eventType } });
    }
    response.json({ received: true });
  } catch (error) {
    if (error?.webhookResponse) {
      return response.status(error.webhookResponse.httpStatus).json(error.webhookResponse.body);
    }
    response.status(500).json({ error: databaseError('Payment webhook processing failed.', error) });
  }
});

router.post('/payments/quote', paymentQuoteRateLimit, async (request, response) => {
  const { items, currency } = request.body || {};
  const normalizedCurrency = String(currency || 'GHS').trim().toUpperCase();
  if (!Array.isArray(items) || !items.length || items.length > 100) {
    return response.status(400).json({ error: 'A quote must contain between 1 and 100 items.' });
  }
  try {
    const { items: pricedItems, amountGhs } = await priceCartItems(database, items);
    const quote = await getChargeQuote(database, amountGhs, normalizedCurrency);
    response.json({
      ...quote,
      items: pricedItems.map(item => ({
        type: item.type,
        productId: item.productId,
        name: item.name,
        license: item.license || null,
        amountGhs: item.priceGhs
      }))
    });
  } catch (error) {
    if (error.code === 'CART_ITEM_INVALID') {
      return response.status(400).json({ error: error.message, code: error.code });
    }
    const status = quoteErrorStatus(error.code);
    if (status) {
      return response.status(status).json({ error: error.message, code: error.code });
    }
    logger.error('payment_quote_failed', { code: error.code });
    response.status(500).json({ error: databaseError('The price quote could not be prepared.', error) });
  }
});

router.post('/payments/initialize', paymentInitializationRateLimit, async (request, response) => {
  const { name, email, items, paymentMethod } = request.body;
  const requestedCurrency = String(request.body.currency || 'GHS').trim().toUpperCase();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const paymentError = validators.text(name, 'Customer name', { required: true, max: 255 }) || validators.email(email);
  if (paymentError) return response.status(400).json({ error: paymentError });
  if (!Array.isArray(items) || !items.length || items.length > 100) return response.status(400).json({ error: 'Payment must contain between 1 and 100 items.' });
  if (!['card', 'mobile_money'].includes(paymentMethod)) return response.status(400).json({ error: 'Choose Card or Mobile Money to continue.' });
  if (!isSupportedCurrency(requestedCurrency)) return response.status(400).json({ error: `Unsupported currency "${requestedCurrency}". Choose one of: GHS, USD, NGN, GBP, EUR.` });
  try {
    const { items: pricedItems, amountGhs } = await priceCartItems(database, items);
    const quote = await getChargeQuote(database, amountGhs, requestedCurrency, { ttlMs: QUOTE_TTL_MS });
    if (quote.provider === 'paystack' && !paystackSecretKey) {
      return response.status(503).json({ error: 'Store payments are unavailable because PAYSTACK_SECRET_KEY is missing or still set to the example placeholder. Add a valid Paystack secret key to backend/.env and restart the server.' });
    }
    if (quote.provider === 'flutterwave' && !isFlutterwaveConfigured()) {
      return response.status(503).json({ error: 'Charging in this currency is unavailable because FLUTTERWAVE_SECRET_KEY is not configured. Choose GHS to continue.' });
    }
    const reference = `UBB-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const foreign = quote.provider === 'flutterwave';
    await run(
      `INSERT INTO orders (reference, customer_name, customer_email, amount, currency, items_json, amount_ghs, fx_rate, fx_markup_percent, fx_source, fx_quoted_at, provider)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reference,
        String(name).trim(),
        normalizedEmail,
        quote.amount,
        quote.currency,
        JSON.stringify(pricedItems),
        quote.amountGhs,
        foreign ? quote.midRate : null,
        foreign ? quote.markupPercent : null,
        foreign ? quote.source : null,
        foreign ? new Date() : null,
        quote.provider
      ]
    );
    let checkout;
    if (foreign) {
      checkout = await createFlutterwaveCheckout({
        reference,
        amount: quote.amount,
        currency: quote.currency,
        customer: { email: normalizedEmail, name: String(name).trim() },
        redirectUrl: paymentCallbackUrl.toString(),
        meta: { order_reference: reference }
      });
    } else {
      const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', { method: 'POST', headers: { Authorization: `Bearer ${paystackSecretKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: normalizedEmail, amount: Math.round(quote.amount * 100), currency: quote.currency, reference, channels: [paymentMethod], callback_url: paymentCallbackUrl.toString() }) });
      const payment = await paystackResponse.json();
      if (!paystackResponse.ok || !payment.status) throw new Error(payment.message || 'Could not start payment.');
      checkout = {
        authorizationUrl: payment.data.authorization_url,
        providerReference: payment.data.reference,
        payload: payment.data
      };
    }
    await run(
      `INSERT INTO payments (order_id, provider, provider_reference, status, amount, currency, amount_ghs, provider_payload)
       SELECT id, ?, ?, ?, ?, ?, ?, ? FROM orders WHERE reference = ?
       ON CONFLICT (provider_reference) DO UPDATE SET order_id = EXCLUDED.order_id, status = EXCLUDED.status,
         amount = EXCLUDED.amount, currency = EXCLUDED.currency, amount_ghs = EXCLUDED.amount_ghs,
         provider_payload = EXCLUDED.provider_payload`,
      [quote.provider, checkout.providerReference, 'pending', quote.amount, quote.currency, quote.amountGhs, JSON.stringify(checkout.payload), reference]
    );
    response.json({ authorizationUrl: checkout.authorizationUrl, reference, amount: quote.amount, currency: quote.currency });
  } catch (error) {
    const status = quoteErrorStatus(error.code) || 400;
    response.status(status).json({
      error: error.message || 'Store payment initialization failed because the order could not be prepared.',
      ...(error.code ? { code: error.code } : {})
    });
  }
});

router.get('/payments/verify/:reference', paymentVerificationRateLimit, async (request, response) => {
  const reference = request.params.reference;
  let order;
  try {
    order = await get('SELECT * FROM orders WHERE reference = ?', [reference]);
  } catch (error) {
    logger.error('payment_verification_order_load_failed', { code: error.code });
    return response.status(500).json({ error: databaseError('Payment verification failed.', error) });
  }
  if (!order) return response.status(404).json({ error: `No order was found for payment reference ${reference}.` });

  const provider = paymentProvider(order);
  let payment;
  try {
    if (provider === 'flutterwave') {
      if (!isFlutterwaveConfigured()) return response.status(503).json({ error: 'Payment verification is unavailable because FLUTTERWAVE_SECRET_KEY is not configured.' });
      const verified = await verifyFlutterwaveTransaction(reference);
      if (!verified) return response.status(400).json({ error: 'Payment was not completed.' });
      payment = normalizeFlutterwavePayment(verified.raw);
    } else {
      if (!paystackSecretKey) return response.status(503).json({ error: 'Payment verification is unavailable because PAYSTACK_SECRET_KEY is missing or still set to the example placeholder. Add a valid Paystack secret key to backend/.env and restart the server.' });
      const paymentResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${paystackSecretKey}` } });
      const payload = await paymentResponse.json();
      if (!paymentResponse.ok || payload.data?.reference !== reference) return response.status(400).json({ error: 'Payment was not completed.' });
      payment = normalizePaystackPayment(payload.data || {});
    }
  } catch (error) {
    logger.error('payment_verification_failed', { code: error.code });
    return response.status(quoteErrorStatus(error.code) || 502).json({ error: error.code ? databaseError('Payment verification failed.', error) : `Payment verification failed: ${error.message}` });
  }

  try {
    if (payment.status !== 'success') {
      const failureStatus = paymentFailureStatus('', payment.status);
      if (failureStatus) {
        const failureOutcome = await database.transaction(async tx => {
          const lockedOrder = await tx.get('SELECT * FROM orders WHERE reference = ? FOR UPDATE', [reference]);
          if (!lockedOrder) return { httpStatus: 404, body: { error: `No order was found for payment reference ${reference}.` } };
          if (failureStatus === 'reversed') {
            if (payment.currency !== lockedOrder.currency) return { httpStatus: 400, body: { error: 'Payment currency could not be verified.' } };
            const result = await applyPaymentReversal(tx, lockedOrder, { reference, payment });
            return { orderId: lockedOrder.id, refund: result };
          }
          await recordNonSuccessPayment(tx, lockedOrder, { reference, status: failureStatus, payment });
          return { orderId: lockedOrder.id };
        });
        if (failureOutcome.httpStatus) return response.status(failureOutcome.httpStatus).json(failureOutcome.body);
        if (failureOutcome.orderId) recordAuditSafely(database, {
          action: failureStatus === 'reversed' ? 'payment_reversed' : `payment_${failureStatus}`,
          entityType: 'order',
          entityId: failureOutcome.orderId,
          details: { reference, status: failureStatus }
        });
      }
      return response.status(400).json({ error: 'Payment was not completed.' });
    }
    const outcome = await database.transaction(async tx => {
      const lockedOrder = await tx.get('SELECT * FROM orders WHERE reference = ? FOR UPDATE', [reference]);
      if (!lockedOrder) return { httpStatus: 404, body: { error: `No order was found for payment reference ${reference}.` } };
      const orderItems = parseOrderItems(lockedOrder.items_json);
      if (!orderItems) return { httpStatus: 500, body: { error: 'Order data is invalid.' } };
      let items;
      try { items = snapshotLegacyBeatPrices(lockedOrder, orderItems); } catch (error) {
        return { httpStatus: 500, body: { error: error.code === 'ORDER_PRICING_INVALID' ? error.message : 'Order data is invalid.' } };
      }
      const bookingItem = items.find(item => item.type === 'booking');
      const licenseRights = await loadLicenseRights(tx);
      const success = () => ({
        httpStatus: 200,
        body: {
          status: 'success',
          reference: lockedOrder.reference,
          booking: bookingItem ? { service: bookingItem.name, feeGhs: bookingItem.feeGhs } : null,
          downloads: lockedOrder.status === 'paid' ? getDownloadItems(lockedOrder, apiPublicUrl, licenseRights) : []
        }
      });
      if (lockedOrder.status === 'paid' || lockedOrder.status === 'partially_refunded') return success();
      if (lockedOrder.status === 'refunded') return { httpStatus: 409, body: { error: 'This order was refunded and cannot be marked paid again.' } };
      if (!chargeMatchesOrder(lockedOrder, payment)) return { httpStatus: 400, body: { error: 'Payment amount could not be verified.' } };
      await lockExclusiveBeats(tx, items);
      const conflictingBeatId = await hasConflictingExclusiveSale(tx, items, lockedOrder.reference);
      if (conflictingBeatId) return { httpStatus: 409, body: { error: `The exclusive license for beat ${conflictingBeatId} has already been sold. Payment cannot unlock this order.` } };
      if (bookingItem) {
        try {
          await fulfillPaidBooking(tx, lockedOrder, bookingItem);
        } catch (error) {
          if (error.code === 'BOOKING_SLOT_UNAVAILABLE' || error.code === 'ER_DUP_ENTRY') {
            await markBookingForReview(tx, lockedOrder, items, payment);
            return {
              httpStatus: 409,
              order: lockedOrder,
              conflict: 'booking_slot_unavailable',
              body: { error: 'Payment was received, but the selected booking slot is no longer available. The team has been notified to resolve your booking.' }
            };
          }
          throw error;
        }
      }
      await completePaidOrder(tx, lockedOrder, items, payment);
      return success();
    });
    if (outcome.conflict) {
      await notifyBookingNeedsReview(database, outcome.order, outcome.conflict);
      return response.status(outcome.httpStatus).json(outcome.body);
    }
    return response.status(outcome.httpStatus).json(outcome.body);
  } catch (error) {
    logger.error('payment_verification_failed', { code: error.code });
    if (error.code === 'ER_DUP_ENTRY') return response.status(409).json({ error: 'This booking could not be completed because one or more selected slots were reserved by another customer.' });
    response.status(502).json({ error: error.code ? databaseError('Payment verification failed.', error) : `Payment verification failed: ${error.message}` });
  }
});

module.exports = router;
