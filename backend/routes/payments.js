const express = require('express');
const crypto = require('node:crypto');
const database = require('../database');
const config = require('../config');
const { getPricing } = require('../services/pricing');
const { normalizeBookingSlots } = require('../services/booking');
const { getDownloadItems } = require('../services/downloads');
const { databaseError } = require('../services/error-messages');
const validators = require('../services/input-validation');
const { recordAuditSafely } = require('../services/audit');
const { createNotificationSafely, notifyAdminsSafely } = require('../services/notifications');
const { loadLicenseRights, rightsFor } = require('../services/license-rights');
const { issueCertificateRecord } = require('../services/license-certificates');
const { refundEventDetails, refundEventKey, applyRefund, applyPaymentReversal } = require('../services/refunds');
const { paymentFailureStatus, isRefundEvent, recordNonSuccessPayment } = require('../services/payment-events');
const { queueEmailSafely } = require('../services/email/outbox');
const logger = require('../services/logger');

const router = express.Router();
const { apiPublicUrl, paymentCallbackUrl, paystackSecretKey, usdToGhsRate, bookingServiceLabels } = config;
const LOW_STOCK_THRESHOLD = 5;
const queryRows = (query, parameters = []) => new Promise((resolve, reject) => database.all(query, parameters, (error, rows) => error ? reject(error) : resolve(rows || [])));
const run = (query, parameters = []) => new Promise((resolve, reject) => database.run(query, parameters, function (error) { error ? reject(error) : resolve(this); }));

function rejectWebhook(httpStatus, body) {
  throw Object.assign(new Error(body.error), { webhookResponse: { httpStatus, body } });
}

async function hasPaidExclusiveLicense(queryAll, beatId, excludedReference = null) {
  const parameters = excludedReference ? [beatId, 'paid', excludedReference] : [beatId, 'paid'];
  const rows = await queryAll(
    `SELECT o.reference, o.items_json, l.id AS license_id, l.revoked_at,
            (l.expires_at IS NULL OR l.expires_at > CURRENT_TIMESTAMP) AS license_active
     FROM orders o
     LEFT JOIN licenses l ON l.order_id = o.id AND l.beat_id = ? AND l.license_type = 'exclusive'
     WHERE o.status = ?${excludedReference ? ' AND o.reference <> ?' : ''}`,
    parameters
  );
  return rows.some(order => {
    let items;
    try { items = JSON.parse(order.items_json); } catch { return false; }
    const purchasedExclusive = items.some(item => item.type === 'beat' && Number(item.productId) === Number(beatId) && item.license === 'exclusive');
    return purchasedExclusive && (!order.license_id || (!order.revoked_at && Number(order.license_active)));
  });
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
  return item.priceUsd * usdToGhsRate;
}

// Idempotent per order line: a retried verification/webhook cannot double-count revenue.
async function recordOrderSales(db, order, items) {
  for (const [lineIndex, item] of items.entries()) {
    const amount = saleAmount(item);
    if (!Number.isFinite(Number(amount))) continue;
    await db.run(
      `INSERT INTO sales (order_reference, line_index, sale_type, product_id, product_name, buyer_name, buyer_email, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (order_reference, line_index) DO UPDATE SET amount = EXCLUDED.amount`,
      [
        order.reference,
        lineIndex,
        item.type || 'beat',
        item.type === 'booking' ? null : item.productId,
        item.type === 'beat' || !item.type ? `${item.name} (${item.license})` : item.name,
        order.customer_name,
        order.customer_email,
        amount
      ]
    );
  }
}

async function normalizePaidOrder(db, order, items, paymentData) {
  for (const item of items) {
    if (item.type === 'booking') continue;
    await db.run(
      `INSERT INTO order_items (order_id, product_type, product_id, product_name, license_type, unit_amount, currency, quantity)
       SELECT ?, ?, ?, ?, ?, ?, ?, 1
       WHERE NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = ? AND product_type = ? AND product_id = ? AND COALESCE(license_type, '') = COALESCE(?, ''))`,
      [order.id, item.type || 'beat', item.productId, item.name, item.license || null, item.type === 'merchandise' ? item.priceGhs : item.priceUsd * usdToGhsRate, 'GHS', order.id, item.type || 'beat', item.productId, item.license || null]
    );
  }

  await db.run(
    `INSERT INTO payments (order_id, provider, provider_reference, status, amount, currency, provider_payload, verified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (provider_reference) DO UPDATE SET order_id = EXCLUDED.order_id, status = EXCLUDED.status,
       amount = EXCLUDED.amount, currency = EXCLUDED.currency, provider_payload = EXCLUDED.provider_payload,
       verified_at = EXCLUDED.verified_at`,
    [order.id, 'paystack', paymentData.reference, 'paid', Number(paymentData.amount) / 100, paymentData.currency, JSON.stringify(paymentData)]
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

async function completePaidOrder(db, order, items, paymentData) {
  await decrementMerchandiseStock(db, items, order.reference);
  await db.run('UPDATE orders SET status = ? WHERE reference = ? AND status <> ?', ['paid', order.reference, 'paid']);
  await recordOrderSales(db, order, items);
  await normalizePaidOrder(db, order, items, paymentData);
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
      items: items.map(item => ({
        name: item.name,
        license: item.license,
        amount: item.type === 'booking' ? item.feeGhs : saleAmount(item)
      })),
      orderUrl: new URL('/', config.frontendOrigin).toString()
    }
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

async function reserveBookingSlots(db, order, bookingItem) {
  const booking = bookingItem.booking;
  if (!booking) throw Object.assign(new Error('Booking details are missing from this order.'), { code: 'INVALID_BOOKING' });
  const serviceName = bookingServiceLabels[bookingItem.service] || bookingItem.service;
  const sessionSlots = normalizeBookingSlots(booking.sessionSlots || (booking.preferredDate && booking.preferredTime ? [{ date: booking.preferredDate, time: booking.preferredTime }] : []));
  const firstSlot = sessionSlots[0];
  for (const slot of sessionSlots) {
    await db.run("INSERT INTO booking_availability (slot_date, start_time, end_time, status) VALUES (?, ?, ?::time + INTERVAL '2 hours 20 minutes', ?)", [slot.date, slot.time, slot.time, 'booked']);
  }
  const bookingResult = await db.run('INSERT INTO bookings (name, email, phone, service, artist_count, song_count, booking_slots_json, preferred_date, preferred_time, details, payment_reference, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [booking.name, booking.email, booking.phone, serviceName, booking.artistCount, booking.songCount || null, JSON.stringify(sessionSlots), firstSlot?.date || null, firstSlot?.time || null, booking.details, order.reference, 'paid']);
  for (const slot of sessionSlots) {
    await db.run('UPDATE booking_availability SET booking_id = ? WHERE slot_date = ? AND start_time = ?', [bookingResult.lastID, slot.date, slot.time]);
  }
  const customer = await db.get("SELECT id FROM users WHERE lower(email) = lower(?) AND role NOT IN ('admin', 'super_admin')", [order.customer_email]);
  if (customer?.id) await createNotificationSafely(db, {
    userId: customer.id,
    type: 'booking_paid',
    title: 'Booking confirmed',
    message: `${serviceName} booking ${order.reference} is paid and awaiting studio confirmation.`
  });
  await notifyAdminsSafely(db, {
    type: 'booking_paid',
    title: 'Booking payment received',
    message: `${serviceName} booking ${order.reference} from ${booking.name || order.customer_name} was paid.`,
    dedupeKey: `booking-paid:${order.reference}`
  });
  await queueEmailSafely(db, {
    to: booking.email || order.customer_email,
    template: 'booking_confirmation',
    idempotencyKey: `booking-confirmation:${order.reference}`,
    data: {
      name: booking.name || order.customer_name,
      reference: order.reference,
      service: bookingItem.name,
      feeGhs: bookingItem.feeGhs,
      currency: order.currency,
      slots: sessionSlots,
      bookingUrl: new URL('/', config.frontendOrigin).toString()
    }
  });
  return bookingResult.lastID;
}

router.post('/payments/webhook', async (request, response) => {
  if (!paystackSecretKey) return response.status(503).json({ error: 'Payment webhooks are unavailable because PAYSTACK_SECRET_KEY is not configured.' });
  const signature = request.get('x-paystack-signature');
  const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.from('');
  const expectedSignature = crypto.createHmac('sha512', paystackSecretKey).update(rawBody).digest('hex');
  if (!signature || signature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return response.status(401).json({ error: 'Invalid payment webhook signature.' });
  let event;
  try { event = JSON.parse(rawBody.toString('utf8')); } catch { return response.status(400).json({ error: 'Payment webhook payload is invalid JSON.' }); }
  const eventType = String(event.event || '').toLowerCase();
  const isRefund = isRefundEvent(eventType);
  const failureStatus = paymentFailureStatus(eventType, event.data?.status);
  const isReversal = !isRefund && failureStatus === 'reversed';
  const refund = isRefund || isReversal ? refundEventDetails(event) : null;
  const eventReference = isRefund
    ? refundEventKey(event)
    : isReversal
      ? String(refund.reference || event.data?.id || '')
      : String(event.data?.reference || event.data?.id || '');
  if (!eventReference || !eventType) return response.status(400).json({ error: 'Payment webhook is missing its event reference or type.' });
  try {
    const outcome = await database.transaction(async tx => {
      const stored = await tx.get(
        `INSERT INTO payment_webhook_events (provider, event_reference, event_type, payload)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (provider, event_reference, event_type) DO NOTHING
         RETURNING id`,
        ['paystack', eventReference, eventType, JSON.stringify(event)]
      );
      if (!stored) return { duplicate: true };
      if (isRefund || isReversal) {
        if (!refund.reference) rejectWebhook(400, { error: 'Refund webhook is missing its transaction reference.' });
        if (isRefund && eventType !== 'refund.processed') {
          return { processed: true, audit: { action: 'refund_event_ignored', details: { reference: refund.reference, event: eventType } } };
        }
        const order = await tx.get('SELECT * FROM orders WHERE reference = ? FOR UPDATE', [refund.reference]);
        if (!order) rejectWebhook(404, { error: `No order was found for refund reference ${refund.reference}.` });
        if (refund.currency && refund.currency !== order.currency) rejectWebhook(400, { error: 'Refund currency does not match the order currency.' });
        const reversalAmount = isReversal && !Number.isFinite(refund.amountGhs) ? Number(order.amount) : refund.amountGhs;
        if (!Number.isFinite(reversalAmount) || reversalAmount <= 0) rejectWebhook(400, { error: 'Refund amount could not be validated.' });
        if (isReversal) {
          const result = await applyPaymentReversal(tx, order, {
            reference: refund.reference,
            paymentData: { ...event.data, amount: Number.isFinite(refund.amountGhs) ? Number(event.data?.amount) : Number(order.amount) * 100, currency: refund.currency || order.currency }
          });
          return { processed: true, orderId: order.id, refund: result, eventType };
        }
        const result = await applyRefund(tx, order, {
          amountGhs: reversalAmount,
          reference: refund.reference,
          reason: refund.reason || (isReversal ? 'Payment reversed by provider' : null)
        });
        return { processed: true, orderId: order.id, refund: result, eventType };
      }
      const order = await tx.get('SELECT * FROM orders WHERE reference = ? FOR UPDATE', [eventReference]);
      if (eventType !== 'charge.success' || event.data?.status !== 'success') {
        await recordNonSuccessPayment(tx, order, {
          reference: eventReference,
          status: failureStatus || String(event.data?.status || eventType).toLowerCase(),
          paymentData: event.data || event
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
      if (Number(event.data.amount) !== Math.round(Number(order.amount) * 100) || event.data.currency !== order.currency) rejectWebhook(400, { error: 'Payment webhook amount could not be reconciled.' });
      let items;
      try { items = JSON.parse(order.items_json); } catch { rejectWebhook(500, { error: 'Order data is invalid.' }); }
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
          await reserveBookingSlots(tx, order, bookingItem);
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY') return { processed: true, orderId: order.id, conflict: { reason: 'booking_slot_unavailable', reference: eventReference } };
          throw error;
        }
      }
      try {
        await completePaidOrder(tx, order, items, event.data);
      } catch (error) {
        if (error.code !== 'OUT_OF_STOCK') throw error;
        return {
          processed: true,
          orderId: order.id,
          conflict: { reason: 'merchandise_out_of_stock', reference: eventReference }
        };
      }
      return { processed: true, orderId: order.id };
    });
    if (outcome.duplicate) return response.json({ received: true, duplicate: true });
    if (outcome.conflict) {
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

router.post('/payments/initialize', async (request, response) => {
  const { name, email, items, paymentMethod } = request.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const paymentError = validators.text(name, 'Customer name', { required: true, max: 255 }) || validators.email(email);
  if (paymentError) return response.status(400).json({ error: paymentError });
  if (!Array.isArray(items) || !items.length || items.length > 100) return response.status(400).json({ error: 'Payment must contain between 1 and 100 items.' });
  if (!['card', 'mobile_money'].includes(paymentMethod)) return response.status(400).json({ error: 'Choose Card or Mobile Money to continue.' });
  if (!paystackSecretKey) return response.status(503).json({ error: 'Store payments are unavailable because PAYSTACK_SECRET_KEY is missing or still set to the example placeholder. Add a valid Paystack secret key to backend/.env and restart the server.' });
  try {
    const [{ beatDefaultPrices }, licenseStatusRows] = await Promise.all([
      getPricing(database),
      queryRows('SELECT license_type, is_active FROM license_definition_status')
    ]);
    const availableLicenseTypes = new Set(
      licenseStatusRows.length
        ? licenseStatusRows.filter(row => Boolean(Number(row.is_active))).map(row => String(row.license_type).toLowerCase())
        : ['basic', 'premium', 'unlimited', 'exclusive']
    );
    const validatedItems = await Promise.all(items.map(item => new Promise((resolve, reject) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return reject(new Error('Each payment item must be an object.'));
      if (item.type === 'merchandise') {
        const productId = Number(item.productId);
        if (!Number.isInteger(productId) || productId < 1) return reject(new Error('Invalid merchandise selected.'));
        database.get("SELECT id, title, price, stock_quantity FROM merchandise WHERE id = ? AND catalog_status = 'published'", [productId], (error, product) => {
          if (error) return reject(error);
          if (!product || !Number.isFinite(Number(product.price)) || Number(product.price) <= 0) return reject(new Error(`Merchandise unavailable: ${item.name || 'Unknown item'}.`));
          if (product.stock_quantity !== null && Number(product.stock_quantity) < 1) return reject(new Error(`${product.title} is out of stock.`));
          resolve({ type: 'merchandise', productId: product.id, name: product.title, priceGhs: Number(product.price) });
        });
        return;
      }
      const license = String(item.license || '').toLowerCase();
      if (typeof item.name !== 'string' || !item.name.trim() || item.name.trim().length > 255) return reject(new Error('Each beat item must include a title up to 255 characters.'));
      const priceColumns = { basic: 'basic_price', premium: 'premium_price', unlimited: 'unlimited_price', exclusive: 'exclusive_price' };
      if (!priceColumns[license]) return reject(new Error('Invalid license selected.'));
      if (!availableLicenseTypes.has(license)) return reject(new Error('This license is no longer available for new purchases.'));
      database.get('SELECT id, title, cover_art, COALESCE(NULLIF(' + priceColumns[license] + ', 0), ?) AS price FROM beats WHERE lower(title) = lower(?)', [beatDefaultPrices[license], String(item.name || '')], (error, beat) => {
        if (error) return reject(error);
        if (!beat || !Number.isFinite(Number(beat.price)) || Number(beat.price) <= 0) return reject(new Error(`Beat unavailable: ${item.name || 'Unknown beat'}.`));
        if (license !== 'exclusive') return resolve({ type: 'beat', productId: beat.id, name: beat.title, license, priceUsd: Number(beat.price) });
        hasPaidExclusiveLicense(queryRows, beat.id)
          .then(isSold => isSold ? reject(new Error(`The exclusive license for "${beat.title}" has already been sold.`)) : resolve({ type: 'beat', productId: beat.id, name: beat.title, license, priceUsd: Number(beat.price) }))
          .catch(reject);
      });
    })));
    const amountGhs = validatedItems.reduce((total, item) => total + (item.type === 'merchandise' ? item.priceGhs : item.priceUsd * usdToGhsRate), 0);
    const reference = `UBB-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    await run('INSERT INTO orders (reference, customer_name, customer_email, amount, currency, items_json) VALUES (?, ?, ?, ?, ?, ?)', [reference, String(name).trim(), normalizedEmail, amountGhs, 'GHS', JSON.stringify(validatedItems)]);
    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', { method: 'POST', headers: { Authorization: `Bearer ${paystackSecretKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: normalizedEmail, amount: Math.round(amountGhs * 100), currency: 'GHS', reference, channels: [paymentMethod], callback_url: paymentCallbackUrl.toString() }) });
    const payment = await paystackResponse.json();
    if (!paystackResponse.ok || !payment.status) throw new Error(payment.message || 'Could not start payment.');
    await run(
      `INSERT INTO payments (order_id, provider, provider_reference, status, amount, currency, provider_payload)
       SELECT id, ?, ?, ?, ?, ?, ? FROM orders WHERE reference = ?
       ON CONFLICT (provider_reference) DO UPDATE SET order_id = EXCLUDED.order_id, status = EXCLUDED.status,
         amount = EXCLUDED.amount, currency = EXCLUDED.currency, provider_payload = EXCLUDED.provider_payload`,
      [ 'paystack', payment.data.reference, 'pending', amountGhs, 'GHS', JSON.stringify(payment.data), reference ]
    );
    response.json({ authorizationUrl: payment.data.authorization_url, reference });
  } catch (error) {
    response.status(400).json({ error: error.message || 'Store payment initialization failed because the order could not be prepared.' });
  }
});

router.get('/payments/verify/:reference', async (request, response) => {
  if (!paystackSecretKey) return response.status(503).json({ error: 'Payment verification is unavailable because PAYSTACK_SECRET_KEY is missing or still set to the example placeholder. Add a valid Paystack secret key to backend/.env and restart the server.' });
  try {
    const paymentResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(request.params.reference)}`, { headers: { Authorization: `Bearer ${paystackSecretKey}` } });
    const payment = await paymentResponse.json();
    if (!paymentResponse.ok || payment.data?.reference !== request.params.reference) return response.status(400).json({ error: 'Payment was not completed.' });
    if (payment.data?.status !== 'success') {
      const failureStatus = paymentFailureStatus('', payment.data?.status);
      if (failureStatus) {
        const failureOutcome = await database.transaction(async tx => {
          const order = await tx.get('SELECT * FROM orders WHERE reference = ? FOR UPDATE', [request.params.reference]);
          if (!order) return { httpStatus: 404, body: { error: `No order was found for payment reference ${request.params.reference}.` } };
          if (failureStatus === 'reversed') {
            if (payment.data.currency !== order.currency) return { httpStatus: 400, body: { error: 'Payment currency could not be verified.' } };
            const result = await applyPaymentReversal(tx, order, { reference: request.params.reference, paymentData: payment.data });
            return { orderId: order.id, refund: result };
          }
          await recordNonSuccessPayment(tx, order, {
            reference: request.params.reference,
            status: failureStatus,
            paymentData: payment.data
          });
          return { orderId: order.id };
        });
        if (failureOutcome.httpStatus) return response.status(failureOutcome.httpStatus).json(failureOutcome.body);
        if (failureOutcome.orderId) recordAuditSafely(database, {
          action: failureStatus === 'reversed' ? 'payment_reversed' : `payment_${failureStatus}`,
          entityType: 'order',
          entityId: failureOutcome.orderId,
          details: { reference: request.params.reference, status: failureStatus }
        });
      }
      return response.status(400).json({ error: 'Payment was not completed.' });
    }
    const outcome = await database.transaction(async tx => {
      const order = await tx.get('SELECT * FROM orders WHERE reference = ? FOR UPDATE', [request.params.reference]);
      if (!order) return { httpStatus: 404, body: { error: `No order was found for payment reference ${request.params.reference}.` } };
      let items;
      try { items = JSON.parse(order.items_json); } catch { return { httpStatus: 500, body: { error: 'Order data is invalid.' } }; }
      const bookingItem = items.find(item => item.type === 'booking');
      const licenseRights = await loadLicenseRights(tx);
      const success = () => ({
        httpStatus: 200,
        body: {
          status: 'success',
          reference: order.reference,
          booking: bookingItem ? { service: bookingItem.name, feeGhs: bookingItem.feeGhs } : null,
          downloads: order.status === 'paid' ? getDownloadItems(order, apiPublicUrl, licenseRights) : []
        }
      });
      if (order.status === 'paid' || order.status === 'partially_refunded') return success();
      if (order.status === 'refunded') return { httpStatus: 409, body: { error: 'This order was refunded and cannot be marked paid again.' } };
      if (Number(payment.data.amount) !== Math.round(order.amount * 100) || payment.data.currency !== order.currency) return { httpStatus: 400, body: { error: 'Payment amount could not be verified.' } };
      await lockExclusiveBeats(tx, items);
      const conflictingBeatId = await hasConflictingExclusiveSale(tx, items, order.reference);
      if (conflictingBeatId) return { httpStatus: 409, body: { error: `The exclusive license for beat ${conflictingBeatId} has already been sold. Payment cannot unlock this order.` } };
      if (bookingItem) await reserveBookingSlots(tx, order, bookingItem);
      await completePaidOrder(tx, order, items, payment.data);
      return success();
    });
    return response.status(outcome.httpStatus).json(outcome.body);
  } catch (error) {
    logger.error('payment_verification_failed', { code: error.code });
    if (error.code === 'ER_DUP_ENTRY') return response.status(409).json({ error: 'This booking could not be completed because one or more selected slots were reserved by another customer.' });
    response.status(502).json({ error: error.code ? databaseError('Payment verification failed.', error) : `Payment verification failed: ${error.message}` });
  }
});

module.exports = router;
