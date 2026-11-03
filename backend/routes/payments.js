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
const { createNotificationSafely } = require('../services/notifications');
const { loadLicenseRights, rightsFor } = require('../services/license-rights');
const { refundEventDetails, refundEventKey, applyRefund } = require('../services/refunds');

const router = express.Router();
const { apiPublicUrl, paymentCallbackUrl, paystackSecretKey, usdToGhsRate, bookingServiceLabels } = config;
const queryRows = (query, parameters = []) => new Promise((resolve, reject) => database.all(query, parameters, (error, rows) => error ? reject(error) : resolve(rows || [])));
const run = (query, parameters = []) => new Promise((resolve, reject) => database.run(query, parameters, function (error) { error ? reject(error) : resolve(this); }));

async function hasPaidExclusiveLicense(queryAll, beatId, excludedReference = null) {
  const parameters = excludedReference ? ['paid', excludedReference] : ['paid'];
  const rows = await queryAll(
    `SELECT reference, items_json FROM orders WHERE status = ?${excludedReference ? ' AND reference <> ?' : ''}`,
    parameters
  );
  return rows.some(order => {
    let items;
    try { items = JSON.parse(order.items_json); } catch { return false; }
    return items.some(item => item.type === 'beat' && Number(item.productId) === Number(beatId) && item.license === 'exclusive');
  });
}

async function decrementMerchandiseStock(db, items) {
  for (const item of items.filter(candidate => candidate.type === 'merchandise')) {
    const result = await db.run('UPDATE merchandise SET stock_quantity = stock_quantity - 1 WHERE id = ? AND (stock_quantity IS NULL OR stock_quantity > 0)', [item.productId]);
    if (!result.changes) throw Object.assign(new Error(`${item.name} is out of stock.`), { code: 'OUT_OF_STOCK' });
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
       ON DUPLICATE KEY UPDATE amount = VALUES(amount)`,
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
     ON DUPLICATE KEY UPDATE order_id = VALUES(order_id), status = VALUES(status), amount = VALUES(amount), currency = VALUES(currency), provider_payload = VALUES(provider_payload), verified_at = VALUES(verified_at)`,
    [order.id, 'paystack', paymentData.reference, 'paid', Number(paymentData.amount) / 100, paymentData.currency, JSON.stringify(paymentData)]
  );

  const customer = await db.get('SELECT id FROM users WHERE lower(email) = lower(?) AND role <> ?', [order.customer_email, 'admin']);
  if (!customer) return;
  const licenseRights = await loadLicenseRights(db);
  for (const item of items.filter(candidate => candidate.type === 'beat')) {
    const rights = rightsFor(licenseRights, item.license);
    await db.run(
      `INSERT INTO licenses (user_id, beat_id, order_id, license_type, rights_json)
       SELECT ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM licenses WHERE order_id = ? AND beat_id = ? AND license_type = ?)`,
      [customer.id, item.productId, order.id, item.license, JSON.stringify(rights), order.id, item.productId, item.license]
    );
  }
  await createNotificationSafely(db, {
    userId: customer.id,
    type: 'order_paid',
    title: 'Payment confirmed',
    message: `Order ${order.reference} was paid successfully.`
  });
  const licenseCount = items.filter(item => item.type === 'beat').length;
  if (licenseCount) await createNotificationSafely(db, {
    userId: customer.id,
    type: 'license_created',
    title: 'License ready',
    message: `${licenseCount} beat license${licenseCount === 1 ? '' : 's'} is now available in your account.`
  });
}

async function completePaidOrder(db, order, items, paymentData) {
  await decrementMerchandiseStock(db, items);
  await db.run('UPDATE orders SET status = ? WHERE reference = ? AND status <> ?', ['paid', order.reference, 'paid']);
  await recordOrderSales(db, order, items);
  await normalizePaidOrder(db, order, items, paymentData);
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
    await db.run('INSERT INTO booking_availability (slot_date, start_time, end_time, status) VALUES (?, ?, ADDTIME(?, "02:20:00"), ?)', [slot.date, slot.time, slot.time, 'booked']);
  }
  const bookingResult = await db.run('INSERT INTO bookings (name, email, phone, service, artist_count, song_count, booking_slots_json, preferred_date, preferred_time, details, payment_reference, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [booking.name, booking.email, booking.phone, serviceName, booking.artistCount, booking.songCount || null, JSON.stringify(sessionSlots), firstSlot?.date || null, firstSlot?.time || null, booking.details, order.reference, 'paid']);
  for (const slot of sessionSlots) {
    await db.run('UPDATE booking_availability SET booking_id = ? WHERE slot_date = ? AND start_time = ?', [bookingResult.lastID, slot.date, slot.time]);
  }
  const customer = await db.get('SELECT id FROM users WHERE lower(email) = lower(?) AND role <> ?', [order.customer_email, 'admin']);
  if (customer?.id) await createNotificationSafely(db, {
    userId: customer.id,
    type: 'booking_paid',
    title: 'Booking confirmed',
    message: `${serviceName} booking ${order.reference} is paid and awaiting studio confirmation.`
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
  const eventType = String(event.event || '');
  const isRefund = eventType.startsWith('refund.');
  const eventReference = isRefund ? refundEventKey(event) : String(event.data?.reference || event.data?.id || '');
  if (!eventReference || !eventType) return response.status(400).json({ error: 'Payment webhook is missing its event reference or type.' });
  try {
    const outcome = await database.transaction(async tx => {
      const stored = await tx.run(
        'INSERT INTO payment_webhook_events (provider, event_reference, event_type, payload) VALUES (?, ?, ?, ?)',
        ['paystack', eventReference, eventType, JSON.stringify(event)]
      ).catch(error => error?.code === 'ER_DUP_ENTRY' ? null : Promise.reject(error));
      if (!stored) return { duplicate: true };
      if (isRefund) {
        const refund = refundEventDetails(event);
        if (!refund.reference) return { httpStatus: 400, body: { error: 'Refund webhook is missing its transaction reference.' } };
        if (eventType !== 'refund.processed') {
          return { processed: true, audit: { action: 'refund_event_ignored', details: { reference: refund.reference, event: eventType } } };
        }
        const order = await tx.get('SELECT * FROM orders WHERE reference = ? FOR UPDATE', [refund.reference]);
        if (!order) return { httpStatus: 404, body: { error: `No order was found for refund reference ${refund.reference}.` } };
        if (refund.currency && refund.currency !== order.currency) return { httpStatus: 400, body: { error: 'Refund currency does not match the order currency.' } };
        if (!Number.isFinite(refund.amountGhs) || refund.amountGhs <= 0) return { httpStatus: 400, body: { error: 'Refund amount could not be validated.' } };
        const result = await applyRefund(tx, order, { amountGhs: refund.amountGhs, reference: refund.reference, reason: refund.reason });
        return { processed: true, orderId: order.id, refund: result, eventType };
      }
      const order = await tx.get('SELECT * FROM orders WHERE reference = ? FOR UPDATE', [eventReference]);
      if (eventType !== 'charge.success' || event.data?.status !== 'success') {
        if (order) {
          await tx.run(
            `INSERT INTO payments (order_id, provider, provider_reference, status, amount, currency, provider_payload)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE order_id = VALUES(order_id), status = VALUES(status), amount = VALUES(amount), currency = VALUES(currency), provider_payload = VALUES(provider_payload)`,
            [order.id, 'paystack', eventReference, String(event.data?.status || eventType).toLowerCase(), Number(event.data?.amount || 0) / 100, event.data?.currency || 'GHS', JSON.stringify(event.data || event)]
          );
        }
        return { processed: true };
      }
      if (!order) return { httpStatus: 404, body: { error: `No order was found for payment reference ${eventReference}.` } };
      if (Number(event.data.amount) !== Math.round(Number(order.amount) * 100) || event.data.currency !== order.currency) return { httpStatus: 400, body: { error: 'Payment webhook amount could not be reconciled.' } };
      let items;
      try { items = JSON.parse(order.items_json); } catch { return { httpStatus: 500, body: { error: 'Order data is invalid.' } }; }
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
      await completePaidOrder(tx, order, items, event.data);
      return { processed: true, orderId: order.id };
    });
    if (outcome.duplicate) return response.json({ received: true, duplicate: true });
    if (outcome.httpStatus) return response.status(outcome.httpStatus).json(outcome.body);
    if (outcome.conflict) {
      recordAuditSafely(database, { action: 'payment_webhook_conflict', entityType: 'order', entityId: outcome.orderId, details: { ...outcome.conflict, event: eventType } });
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
    const { beatDefaultPrices } = await getPricing(database);
    const validatedItems = await Promise.all(items.map(item => new Promise((resolve, reject) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return reject(new Error('Each payment item must be an object.'));
      if (item.type === 'merchandise') {
        const productId = Number(item.productId);
        if (!Number.isInteger(productId) || productId < 1) return reject(new Error('Invalid merchandise selected.'));
        database.get('SELECT id, title, price, stock_quantity FROM merchandise WHERE id = ?', [productId], (error, product) => {
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
       ON DUPLICATE KEY UPDATE order_id = VALUES(order_id), status = VALUES(status), amount = VALUES(amount), currency = VALUES(currency), provider_payload = VALUES(provider_payload)`,
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
    if (!paymentResponse.ok || payment.data?.status !== 'success' || payment.data?.reference !== request.params.reference) return response.status(400).json({ error: 'Payment was not completed.' });
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
          downloads: getDownloadItems(order, apiPublicUrl, licenseRights)
        }
      });
      if (order.status === 'paid') return success();
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
    console.error('Payment verification failed:', error.code || error.message);
    if (error.code === 'ER_DUP_ENTRY') return response.status(409).json({ error: 'This booking could not be completed because one or more selected slots were reserved by another customer.' });
    response.status(502).json({ error: error.code ? databaseError('Payment verification failed.', error) : `Payment verification failed: ${error.message}` });
  }
});

module.exports = router;
