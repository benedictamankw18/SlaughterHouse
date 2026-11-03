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

const router = express.Router();
const { apiPublicUrl, paymentCallbackUrl, paystackSecretKey, usdToGhsRate, bookingServiceLabels } = config;
const queryRows = (query, parameters = []) => new Promise((resolve, reject) => database.all(query, parameters, (error, rows) => error ? reject(error) : resolve(rows || [])));
const queryOne = (query, parameters = []) => new Promise((resolve, reject) => database.get(query, parameters, (error, row) => error ? reject(error) : resolve(row)));
const run = (query, parameters = []) => new Promise((resolve, reject) => database.run(query, parameters, function (error) { error ? reject(error) : resolve(this); }));

async function hasPaidExclusiveLicense(beatId, excludedReference = null) {
  const parameters = excludedReference ? ['paid', excludedReference] : ['paid'];
  const rows = await queryRows(
    `SELECT reference, items_json FROM orders WHERE status = ?${excludedReference ? ' AND reference <> ?' : ''}`,
    parameters
  );
  return rows.some(order => {
    let items;
    try { items = JSON.parse(order.items_json); } catch { return false; }
    return items.some(item => item.type === 'beat' && Number(item.productId) === Number(beatId) && item.license === 'exclusive');
  });
}

async function decrementMerchandiseStock(items) {
  for (const item of items.filter(candidate => candidate.type === 'merchandise')) {
    const result = await run('UPDATE merchandise SET stock_quantity = stock_quantity - 1 WHERE id = ? AND (stock_quantity IS NULL OR stock_quantity > 0)', [item.productId]);
    if (!result.changes) throw Object.assign(new Error(`${item.name} is out of stock.`), { code: 'OUT_OF_STOCK' });
  }
}

const licenseRights = {
  basic: { formats: ['mp3'], commercialUse: false, distribution: false, stems: false },
  premium: { formats: ['mp3', 'wav'], commercialUse: true, distribution: false, stems: false },
  unlimited: { formats: ['mp3', 'wav', 'stems'], commercialUse: true, distribution: true, stems: true },
  exclusive: { formats: ['mp3', 'wav', 'stems'], commercialUse: true, distribution: true, stems: true, resaleProhibited: true }
};

async function normalizePaidOrder(order, items, paymentData) {
  for (const item of items) {
    if (item.type === 'booking') continue;
    await run(
      `INSERT INTO order_items (order_id, product_type, product_id, product_name, license_type, unit_amount, currency, quantity)
       SELECT ?, ?, ?, ?, ?, ?, ?, 1
       WHERE NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = ? AND product_type = ? AND product_id = ? AND COALESCE(license_type, '') = COALESCE(?, ''))`,
      [order.id, item.type || 'beat', item.productId, item.name, item.license || null, item.type === 'merchandise' ? item.priceGhs : item.priceUsd * usdToGhsRate, 'GHS', order.id, item.type || 'beat', item.productId, item.license || null]
    );
  }

  await run(
    `INSERT INTO payments (order_id, provider, provider_reference, status, amount, currency, provider_payload, verified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE order_id = VALUES(order_id), status = VALUES(status), amount = VALUES(amount), currency = VALUES(currency), provider_payload = VALUES(provider_payload), verified_at = VALUES(verified_at)`,
    [order.id, 'paystack', paymentData.reference, 'paid', Number(paymentData.amount) / 100, paymentData.currency, JSON.stringify(paymentData)]
  );

  const customer = await queryOne('SELECT id FROM users WHERE lower(email) = lower(?) AND role <> ?', [order.customer_email, 'admin']);
  if (!customer) return;
  for (const item of items.filter(candidate => candidate.type === 'beat')) {
    const rights = licenseRights[item.license] || licenseRights.basic;
    await run(
      `INSERT INTO licenses (user_id, beat_id, order_id, license_type, rights_json)
       SELECT ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM licenses WHERE order_id = ? AND beat_id = ? AND license_type = ?)`,
      [customer.id, item.productId, order.id, item.license, JSON.stringify(rights), order.id, item.productId, item.license]
    );
  }
  await createNotificationSafely(database, {
    userId: customer.id,
    type: 'order_paid',
    title: 'Payment confirmed',
    message: `Order ${order.reference} was paid successfully.`
  });
  const licenseCount = items.filter(item => item.type === 'beat').length;
  if (licenseCount) await createNotificationSafely(database, {
    userId: customer.id,
    type: 'license_created',
    title: 'License ready',
    message: `${licenseCount} beat license${licenseCount === 1 ? '' : 's'} is now available in your account.`
  });
}

router.post('/payments/webhook', async (request, response) => {
  if (!paystackSecretKey) return response.status(503).json({ error: 'Payment webhooks are unavailable because PAYSTACK_SECRET_KEY is not configured.' });
  const signature = request.get('x-paystack-signature');
  const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.from('');
  const expectedSignature = crypto.createHmac('sha512', paystackSecretKey).update(rawBody).digest('hex');
  if (!signature || signature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return response.status(401).json({ error: 'Invalid payment webhook signature.' });
  let event;
  try { event = JSON.parse(rawBody.toString('utf8')); } catch { return response.status(400).json({ error: 'Payment webhook payload is invalid JSON.' }); }
  const eventReference = String(event.data?.reference || event.data?.id || '');
  const eventType = String(event.event || '');
  if (!eventReference || !eventType) return response.status(400).json({ error: 'Payment webhook is missing its event reference or type.' });
  try {
    const stored = await run(
      'INSERT INTO payment_webhook_events (provider, event_reference, event_type, payload) VALUES (?, ?, ?, ?)',
      ['paystack', eventReference, eventType, JSON.stringify(event)]
    ).catch(error => error?.code === 'ER_DUP_ENTRY' ? null : Promise.reject(error));
    if (!stored) return response.json({ received: true, duplicate: true });
    if (eventType !== 'charge.success' || event.data?.status !== 'success') {
      const order = await queryOne('SELECT id FROM orders WHERE reference = ?', [eventReference]);
      if (order) {
        await run(
          `INSERT INTO payments (order_id, provider, provider_reference, status, amount, currency, provider_payload)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE order_id = VALUES(order_id), status = VALUES(status), amount = VALUES(amount), currency = VALUES(currency), provider_payload = VALUES(provider_payload)`,
          [order.id, 'paystack', eventReference, String(event.data?.status || eventType).toLowerCase(), Number(event.data?.amount || 0) / 100, event.data?.currency || 'GHS', JSON.stringify(event.data || event)]
        );
      }
      return response.json({ received: true });
    }
    const order = await queryOne('SELECT * FROM orders WHERE reference = ?', [eventReference]);
    if (!order) return response.status(404).json({ error: `No order was found for payment reference ${eventReference}.` });
    if (Number(event.data.amount) !== Math.round(Number(order.amount) * 100) || event.data.currency !== order.currency) return response.status(400).json({ error: 'Payment webhook amount could not be reconciled.' });
    let items;
    try { items = JSON.parse(order.items_json); } catch { return response.status(500).json({ error: 'Order data is invalid.' }); }
    if (items.some(item => item.type === 'booking')) return response.json({ received: true, deferred: 'booking_requires_slot_reservation' });
    await decrementMerchandiseStock(items);
    await run('UPDATE orders SET status = ? WHERE reference = ? AND status <> ?', ['paid', order.reference, 'paid']);
    await Promise.all(items.map(item => run(
      `INSERT INTO sales (sale_type, product_id, product_name, buyer_name, buyer_email, amount)
       SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS
       (SELECT 1 FROM sales WHERE sale_type = ? AND product_id = ? AND buyer_email = ? AND product_name = ?)`,
      [item.type || 'beat', item.productId, item.type === 'merchandise' ? item.name : `${item.name} (${item.license})`, order.customer_name, order.customer_email, item.type === 'merchandise' ? item.priceGhs : item.priceUsd * usdToGhsRate, item.type || 'beat', item.productId, order.customer_email, item.type === 'merchandise' ? item.name : `${item.name} (${item.license})`]
    )));
    await normalizePaidOrder(order, items, event.data);
    recordAuditSafely(database, { action: 'payment_webhook_processed', entityType: 'order', entityId: order.id, details: { reference: eventReference, event: eventType } });
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
        hasPaidExclusiveLicense(beat.id)
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
    const order = await queryOne('SELECT * FROM orders WHERE reference = ?', [request.params.reference]);
    if (!order) return response.status(404).json({ error: `No order was found for payment reference ${request.params.reference}.` });
    let items;
    try { items = JSON.parse(order.items_json); } catch { return response.status(500).json({ error: 'Order data is invalid.' }); }
    const bookingItem = items.find(item => item.type === 'booking');
    const respondWithSuccess = () => response.json({ status: 'success', reference: order.reference, booking: bookingItem ? { service: bookingItem.name, feeGhs: bookingItem.feeGhs } : null, downloads: getDownloadItems(order, apiPublicUrl) });
    if (order.status === 'paid') return respondWithSuccess();
    if (Number(payment.data.amount) !== Math.round(order.amount * 100) || payment.data.currency !== order.currency) return response.status(400).json({ error: 'Payment amount could not be verified.' });
    const exclusiveBeatIds = items.filter(item => item.type === 'beat' && item.license === 'exclusive').map(item => item.productId);
    for (const beatId of exclusiveBeatIds) {
      if (await hasPaidExclusiveLicense(beatId, order.reference)) return response.status(409).json({ error: `The exclusive license for beat ${beatId} has already been sold. Payment cannot unlock this order.` });
    }
    const markOrderPaid = async () => {
      await decrementMerchandiseStock(items);
      const result = await run('UPDATE orders SET status = ? WHERE reference = ? AND status <> ?', ['paid', order.reference, 'paid']);
      if (!result.changes) {
        await normalizePaidOrder(order, items, payment.data);
        return respondWithSuccess();
      }
      await Promise.all(items.filter(item => item.type !== 'booking').map(item => run('INSERT INTO sales (sale_type, product_id, product_name, buyer_name, buyer_email, amount) VALUES (?, ?, ?, ?, ?, ?)', [item.type || 'beat', item.productId, item.type === 'merchandise' ? item.name : `${item.name} (${item.license})`, order.customer_name, order.customer_email, item.type === 'merchandise' ? item.priceGhs : item.priceUsd * usdToGhsRate])));
      await normalizePaidOrder(order, items, payment.data);
      respondWithSuccess();
    };
    if (!bookingItem) return markOrderPaid();
    const booking = bookingItem.booking;
    const serviceName = bookingServiceLabels[bookingItem.service] || bookingItem.service;
    const sessionSlots = normalizeBookingSlots(booking.sessionSlots || (booking.preferredDate && booking.preferredTime ? [{ date: booking.preferredDate, time: booking.preferredTime }] : []));
    const firstSlot = sessionSlots[0];
    const reservedSlots = [];
    try {
      for (const slot of sessionSlots) {
        await run('INSERT INTO booking_availability (slot_date, start_time, end_time, status) VALUES (?, ?, ADDTIME(?, "02:20:00"), ?)', [slot.date, slot.time, slot.time, 'booked']);
        reservedSlots.push(slot);
      }
      const bookingResult = await run('INSERT INTO bookings (name, email, phone, service, artist_count, song_count, booking_slots_json, preferred_date, preferred_time, details, payment_reference, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [booking.name, booking.email, booking.phone, serviceName, booking.artistCount, booking.songCount || null, JSON.stringify(sessionSlots), firstSlot?.date || null, firstSlot?.time || null, booking.details, order.reference, 'paid']);
      for (const slot of reservedSlots) await run('UPDATE booking_availability SET booking_id = ? WHERE slot_date = ? AND start_time = ?', [bookingResult.lastID, slot.date, slot.time]);
      const customer = await queryOne('SELECT id FROM users WHERE lower(email) = lower(?) AND role <> ?', [order.customer_email, 'admin']);
      if (customer) await createNotificationSafely(database, {
        userId: customer.id,
        type: 'booking_paid',
        title: 'Booking confirmed',
        message: `${serviceName} booking ${order.reference} is paid and awaiting studio confirmation.`
      });
    } catch (error) {
      await Promise.all(reservedSlots.map(slot => run('DELETE FROM booking_availability WHERE slot_date = ? AND start_time = ? AND booking_id IS NULL', [slot.date, slot.time])));
      if (error.code === 'ER_DUP_ENTRY') return response.status(409).json({ error: 'This booking could not be completed because one or more selected slots were reserved by another customer.' });
      throw error;
    }
    await markOrderPaid();
  } catch (error) {
    console.error('Payment verification failed:', error.code || error.message);
    response.status(502).json({ error: error.code ? databaseError('Payment verification failed.', error) : `Payment verification failed: ${error.message}` });
  }
});

module.exports = router;
