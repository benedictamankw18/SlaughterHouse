const express = require('express');
const database = require('../database');
const sessions = require('../session-store');
const { passwordMatches } = require('../services/security');
const { saveUpload } = require('../services/uploads');
const { databaseError } = require('../services/error-messages');
const validators = require('../services/input-validation');
const { rateLimit } = require('../services/rate-limit');
const { recordAuditSafely } = require('../services/audit');
const { createNotificationSafely } = require('../services/notifications');
const { isAvailableBookingSlot } = require('../services/booking');

const router = express.Router();
router.use(rateLimit({ windowMs: 60 * 1000, max: 60, message: 'Too many administrator requests. Try again shortly.' }));
const queryRows = (query, parameters = []) => new Promise((resolve, reject) => database.all(query, parameters, (error, rows) => error ? reject(error) : resolve(rows || [])));
const csvCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;

router.get('/admin/data', sessions.requireAdmin, (request, response) => {
  Promise.all([
    queryRows('SELECT * FROM beats ORDER BY created_at DESC'),
    queryRows('SELECT * FROM merchandise ORDER BY created_at DESC'),
    queryRows('SELECT * FROM sales ORDER BY created_at DESC'),
    queryRows('SELECT * FROM customization_requests ORDER BY created_at DESC'),
    queryRows('SELECT * FROM bookings ORDER BY created_at DESC'),
    queryRows('SELECT * FROM orders ORDER BY created_at DESC'),
    queryRows('SELECT * FROM withdrawals ORDER BY created_at DESC'),
    queryRows('SELECT * FROM customer_reviews ORDER BY created_at DESC'),
    queryRows("SELECT id, name, artist_name, email FROM users WHERE role = 'artist' ORDER BY name")
  ]).then(([beats, merchandise, sales, requests, bookings, rawOrders, withdrawals, reviews, artists]) => {
    const orders = rawOrders.map(order => {
      let items = [];
      try { items = JSON.parse(order.items_json).map(item => ({ ...item, type: item.type || 'beat' })); } catch {}
      return { ...order, items };
    });
    const paidOrders = orders.filter(order => order.status === 'paid');
    const purchases = paidOrders.flatMap(order => order.items.filter(item => item.type === 'beat').map(item => ({
      order_reference: order.reference, customer_name: order.customer_name, customer_email: order.customer_email,
      beat_title: item.name, license: item.license, amount: item.priceUsd, purchased_at: order.created_at
    })));
    const merchandiseOrders = orders.flatMap(order => order.items.filter(item => item.type === 'merchandise').map(item => ({
      order_reference: order.reference, customer_name: order.customer_name, customer_email: order.customer_email,
      product_name: item.name, amount: item.priceGhs, status: order.status, created_at: order.created_at
    })));
    const artistsWithPurchases = artists.map(artist => ({
      ...artist,
      purchases: purchases.filter(purchase => purchase.customer_email.toLowerCase() === artist.email.toLowerCase())
    }));
    const monthlySales = paidOrders.reduce((months, order) => {
      const date = new Date(order.created_at);
      const month = Number.isNaN(date.getTime()) ? 'Unknown' : date.toISOString().slice(0, 7);
      months[month] = (months[month] || 0) + Number(order.amount || 0);
      return months;
    }, {});
    const analytics = {
      revenue: paidOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0),
      paidOrders: paidOrders.length,
      pendingOrders: orders.filter(order => order.status !== 'paid').length,
      beatLicenses: purchases.length,
      merchandiseOrders: merchandiseOrders.length,
      pendingReviews: reviews.filter(review => review.status === 'pending').length,
      withdrawals: withdrawals.reduce((sum, withdrawal) => sum + Number(withdrawal.amount || 0), 0),
      monthlySales: Object.entries(monthlySales).sort(([left], [right]) => left.localeCompare(right)).slice(-6).map(([month, amount]) => ({ month, amount }))
    };
    response.json({ beats, merchandise, sales, requests, bookings, orders, merchandiseOrders, reviews, artists: artistsWithPurchases, withdrawals, analytics });
  }).catch(error => response.status(500).json({ error: databaseError('Loading administrator data failed.', error) }));
});

router.get('/admin/audit-logs', sessions.requireAdmin, (request, response) => {
  const action = String(request.query.action || '').trim();
  const limit = Math.min(100, Math.max(1, Number.parseInt(request.query.limit, 10) || 50));
  const parameters = [];
  const conditions = [];
  if (action) {
    if (!/^[a-z0-9_]{1,100}$/i.test(action)) return response.status(400).json({ error: 'Audit action filter is invalid.' });
    conditions.push('a.action = ?');
    parameters.push(action);
  }
  parameters.push(limit);
  queryRows(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details_json, a.ip_address,
            a.created_at, u.email AS actor_email
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY a.created_at DESC LIMIT ?`,
    parameters
  ).then(logs => response.json({ logs }))
    .catch(error => response.status(500).json({ error: databaseError('Loading audit logs failed.', error) }));
});

router.get('/admin/orders.csv', sessions.requireAdmin, (request, response) => {
  queryRows(
    `SELECT reference, customer_name, customer_email, status, amount, currency, created_at
     FROM orders ORDER BY created_at DESC LIMIT 5000`
  ).then(orders => {
    const rows = [
      ['Reference', 'Customer', 'Email', 'Status', 'Amount', 'Currency', 'Created at'],
      ...orders.map(order => [order.reference, order.customer_name, order.customer_email, order.status, order.amount, order.currency, order.created_at])
    ];
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="ultbigboy-orders.csv"');
    response.send(`\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`);
  }).catch(error => response.status(500).json({ error: databaseError('Exporting orders failed.', error) }));
});

router.post('/admin/beats', sessions.requireAdmin, (request, response) => {
  const { title, bpm, musicalKey, genre, mood, previewDurationSeconds, prices, files } = request.body;
  const titleError = validators.text(title, 'Beat title', { required: true, max: 255 });
  const bpmError = validators.integer(bpm, 'BPM', { min: 1, max: 400, required: false });
  const durationError = validators.integer(previewDurationSeconds, 'Preview duration', { min: 1, max: 3600, required: false });
  const priceError = Object.entries(prices || {}).map(([license, value]) => validators.money(value, `${license} price`, { required: false })).find(Boolean);
  if (titleError || bpmError || durationError || priceError) return response.status(400).json({ error: titleError || bpmError || durationError || priceError });
  if (!files?.preview || !files?.mp3 || !files?.wav || !files?.stems) return response.status(400).json({ error: 'Preview, MP3, WAV, and stems files are all required.' });
  try {
    const savedFiles = {
      cover_art: saveUpload(files.cover, 'cover', 'image'),
      preview_file: saveUpload(files.preview, 'preview', 'audio'),
      mp3_file: saveUpload(files.mp3, 'mp3', 'audio'),
      wav_file: saveUpload(files.wav, 'wav', 'audio'),
      stems_file: saveUpload(files.stems, 'stems', 'audio')
    };
    database.run('INSERT INTO beats (title, bpm, musical_key, genre, mood, cover_art, preview_file, preview_duration_seconds, mp3_file, wav_file, stems_file, basic_price, premium_price, unlimited_price, exclusive_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [title.trim(), bpm || null, musicalKey || null, genre || null, mood || null, savedFiles.cover_art, savedFiles.preview_file, previewDurationSeconds || null, savedFiles.mp3_file, savedFiles.wav_file, savedFiles.stems_file, prices?.basic || 0, prices?.premium || 0, prices?.unlimited || 0, prices?.exclusive || 0], function (error) {
      if (error) return response.status(500).json({ error: databaseError('Saving the beat failed.', error) });
      response.status(201).json({ id: this.lastID, title: title.trim() });
    });

  } catch (error) {
    response.status(400).json({ error: error.message });
  }
});

router.patch('/admin/beats/:id/status', sessions.requireAdmin, (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Beat ID must be a positive whole number.' });
  const status = String(request.body.status || '').toLowerCase();
  if (!['published', 'unpublished', 'archived'].includes(status)) return response.status(400).json({ error: 'Beat status must be published, unpublished, or archived.' });
  database.run('UPDATE beats SET catalog_status = ? WHERE id = ?', [status, Number(request.params.id)], function (error) {
    if (error) return response.status(500).json({ error: databaseError('Updating the beat catalog status failed.', error) });
    if (!this.changes) return response.status(404).json({ error: `No beat was found with ID ${request.params.id}.` });
    recordAuditSafely(database, { userId: request.admin.id, action: 'beat_status_changed', entityType: 'beat', entityId: Number(request.params.id), details: { status }, ipAddress: request.ip });
    response.json({ id: Number(request.params.id), status });
  });

});

router.patch('/admin/beats/:id', sessions.requireAdmin, (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Beat ID must be a positive whole number.' });
  const { title, bpm, musicalKey, genre, mood, previewDurationSeconds, prices } = request.body;
  const titleError = validators.text(title, 'Beat title', { required: true, max: 255 });
  const bpmError = validators.integer(bpm, 'BPM', { min: 1, max: 400, required: false });
  const durationError = validators.integer(previewDurationSeconds, 'Preview duration', { min: 1, max: 3600, required: false });
  const priceError = Object.entries(prices || {}).map(([license, value]) => validators.money(value, `${license} price`, { required: false })).find(Boolean);
  const textError = validators.text(musicalKey, 'Musical key', { max: 100 }) || validators.text(genre, 'Genre', { max: 100 }) || validators.text(mood, 'Mood', { max: 100 });
  if (titleError || bpmError || durationError || priceError || textError) return response.status(400).json({ error: titleError || bpmError || durationError || priceError || textError });
  database.run(
    `UPDATE beats SET title = ?, bpm = ?, musical_key = ?, genre = ?, mood = ?, preview_duration_seconds = ?, basic_price = ?, premium_price = ?, unlimited_price = ?, exclusive_price = ? WHERE id = ?`,
    [title.trim(), bpm || null, musicalKey?.trim() || null, genre?.trim() || null, mood?.trim() || null, previewDurationSeconds || null, prices?.basic || 0, prices?.premium || 0, prices?.unlimited || 0, prices?.exclusive || 0, Number(request.params.id)],
    function (error) {
      if (error) return response.status(500).json({ error: databaseError('Updating the beat failed.', error) });
      if (!this.changes) return response.status(404).json({ error: `No beat was found with ID ${request.params.id}.` });
      recordAuditSafely(database, { userId: request.admin.id, action: 'beat_updated', entityType: 'beat', entityId: Number(request.params.id), ipAddress: request.ip });
      response.json({ id: Number(request.params.id), title: title.trim() });
    }
  );
});

router.post('/admin/merchandise', sessions.requireAdmin, (request, response) => {
  const { title, description, price, photo } = request.body;
  const titleError = validators.text(title, 'Merchandise title', { required: true, max: 255 });
  const priceError = validators.money(price, 'Merchandise price');
  if (titleError || priceError) return response.status(400).json({ error: titleError || priceError });
  try {
    const photoFile = saveUpload(photo, 'merchandise', 'image');
    database.run('INSERT INTO merchandise (title, description, price, photo) VALUES (?, ?, ?, ?)', [title.trim(), description || '', Number(price), photoFile], function (error) {
      if (error) return response.status(500).json({ error: databaseError('Saving the merchandise failed.', error) });
      response.status(201).json({ id: this.lastID, title: title.trim() });
    });

  } catch (error) {
    response.status(400).json({ error: error.message });
  }
});

router.patch('/admin/merchandise/:id/inventory', sessions.requireAdmin, (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Merchandise ID must be a positive whole number.' });
  const stock = request.body.stockQuantity === null || request.body.stockQuantity === '' ? null : Number(request.body.stockQuantity);
  if (stock !== null && (!Number.isInteger(stock) || stock < 0)) return response.status(400).json({ error: 'Stock quantity must be a non-negative whole number or null for unlimited stock.' });
  database.run('UPDATE merchandise SET stock_quantity = ? WHERE id = ?', [stock, Number(request.params.id)], function (error) {
    if (error) return response.status(500).json({ error: databaseError('Updating merchandise inventory failed.', error) });
    if (!this.changes) return response.status(404).json({ error: `No merchandise was found with ID ${request.params.id}.` });
    recordAuditSafely(database, { userId: request.admin.id, action: 'merchandise_inventory_changed', entityType: 'merchandise', entityId: Number(request.params.id), details: { stockQuantity: stock }, ipAddress: request.ip });
    response.json({ id: Number(request.params.id), stockQuantity: stock });
  });
});

router.post('/admin/withdraw', sessions.requireAdmin, (request, response) => {
  database.get('SELECT password_hash FROM users WHERE lower(email) = lower(?) AND role = ?', [request.admin.email, 'admin'], (error, admin) => {
    if (error) return response.status(500).json({ error: databaseError('Verifying the administrator password failed.', error) });
    if (!admin ) return response.status(401).json({ error: 'Withdrawal password is incorrect.' });
    const amount = Number(request.body.amount);
      const amountError = validators.money(amount, 'Withdrawal amount');
      if (amountError) return response.status(400).json({ error: amountError });
    database.run('INSERT INTO withdrawals (amount) VALUES (?)', [amount], function (insertError) {
      if (insertError) return response.status(500).json({ error: databaseError('Recording the withdrawal failed.', insertError) });
      response.status(201).json({ id: this.lastID, amount });
    });
  });
});

router.patch('/admin/reviews/:id/status', sessions.requireAdmin, (request, response) => {
  const status = String(request.body.status || '');
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Review ID must be a positive whole number.' });
  if (!['approved', 'rejected', 'removed'].includes(status)) return response.status(400).json({ error: 'Choose approved, rejected, or removed.' });
  database.run('UPDATE customer_reviews SET status = ? WHERE id = ?', [status, Number(request.params.id)], function (error) {
    if (error) return response.status(500).json({ error: databaseError('Updating the review status failed.', error) });
    if (!this.changes) return response.status(404).json({ error: `No customer review was found with ID ${request.params.id}.` });
    recordAuditSafely(database, {
      userId: request.admin.id,
      action: 'review_status_changed',
      entityType: 'customer_review',
      entityId: Number(request.params.id),
      details: { status }
    });
    response.json({ status });
  });
});

router.patch('/admin/bookings/:id/status', sessions.requireAdmin, (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Booking ID must be a positive whole number.' });
  const status = String(request.body.status || '').toLowerCase();
  const notes = request.body.notes === undefined ? null : String(request.body.notes || '').trim();
  const allowedStatuses = ['paid', 'confirmed', 'completed', 'cancelled', 'rescheduled'];
  if (!allowedStatuses.includes(status)) return response.status(400).json({ error: `Booking status must be one of: ${allowedStatuses.join(', ')}.` });
  if (notes.length > 5000) return response.status(400).json({ error: 'Booking notes must be 5000 characters or fewer.' });
  database.get('SELECT status, admin_notes FROM bookings WHERE id = ?', [Number(request.params.id)], (lookupError, booking) => {
    if (lookupError) return response.status(500).json({ error: databaseError('Loading the booking failed.', lookupError) });
    if (!booking) return response.status(404).json({ error: `No booking was found with ID ${request.params.id}.` });
    database.run('UPDATE bookings SET status = ?, admin_notes = COALESCE(?, admin_notes) WHERE id = ?', [status, notes, Number(request.params.id)], function (error) {
      if (error) return response.status(500).json({ error: databaseError('Updating the booking status failed.', error) });
      recordAuditSafely(database, { userId: request.admin.id, action: 'booking_status_changed', entityType: 'booking', entityId: Number(request.params.id), details: { previousStatus: booking.status, status, notes: notes || booking.admin_notes || null }, ipAddress: request.ip });
      database.get('SELECT email, service FROM bookings WHERE id = ?', [Number(request.params.id)], async (emailError, updatedBooking) => {
        if (emailError) return response.status(500).json({ error: databaseError('Loading the booking customer failed.', emailError) });
        try {
          const customer = await new Promise((resolve, reject) => database.get('SELECT id FROM users WHERE lower(email) = lower(?) AND role <> ?', [updatedBooking.email, 'admin'], (lookupError, user) => lookupError ? reject(lookupError) : resolve(user)));
          if (customer) await createNotificationSafely(database, {
            userId: customer.id,
            type: 'booking_status_changed',
            title: 'Booking status updated',
            message: `Your ${updatedBooking.service || 'studio'} booking is now ${status}.`
          });

          response.json({ id: Number(request.params.id), status, notes: notes || booking.admin_notes || null });
        } catch (notificationError) {
          response.status(500).json({ error: databaseError('Updating booking notification failed.', notificationError) });
        }
      });
    });
  });
});

router.patch('/admin/requests/:id/status', sessions.requireAdmin, (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Request ID must be a positive whole number.' });
  const status = String(request.body.status || '').toLowerCase();
  const quote = request.body.quoteGhs === '' || request.body.quoteGhs === null || request.body.quoteGhs === undefined ? null : Number(request.body.quoteGhs);
  const notes = request.body.notes === undefined ? null : String(request.body.notes || '').trim();
  const statuses = ['new', 'reviewing', 'quoted', 'accepted', 'rejected', 'completed'];
  if (!statuses.includes(status)) return response.status(400).json({ error: `Request status must be one of: ${statuses.join(', ')}.` });
  if (quote !== null && (!Number.isFinite(quote) || quote < 0)) return response.status(400).json({ error: 'Quote must be a non-negative amount or blank.' });
  if (notes !== null && notes.length > 5000) return response.status(400).json({ error: 'Request notes must be 5000 characters or fewer.' });
  database.get('SELECT user_id, product_name, request_type, status AS previous_status FROM customization_requests WHERE id = ?', [Number(request.params.id)], (lookupError, requestRecord) => {
    if (lookupError) return response.status(500).json({ error: databaseError('Loading the request failed.', lookupError) });
    if (!requestRecord) return response.status(404).json({ error: 'Request was not found.' });
    database.run('UPDATE customization_requests SET status = ?, quote_gsh = ?, admin_notes = COALESCE(?, admin_notes) WHERE id = ?', [status, quote, notes, Number(request.params.id)], async function (error) {
    if (error) return response.status(500).json({ error: databaseError('Updating the request failed.', error) });
    if (requestRecord.user_id) await createNotificationSafely(database, {
      userId: requestRecord.user_id,
      type: 'request_status_changed',
      title: 'Request status updated',
      message: `${requestRecord.product_name || requestRecord.request_type + ' request'} is now ${status}${quote === null ? '' : ` with a quote of GHS ${quote.toFixed(2)}`}.`
    });
    recordAuditSafely(database, {
      userId: request.admin.id,
      action: 'request_status_changed',
      entityType: 'customization_request',
      entityId: Number(request.params.id),
      details: { previousStatus: requestRecord.previous_status, status, quoteGhs: quote }
    });
    response.json({ id: Number(request.params.id), status, quoteGhs: quote, notes });
    });
  });
});

router.post('/admin/bookings/availability', sessions.requireAdmin, (request, response) => {
  const date = String(request.body.date || '').trim();
  const time = String(request.body.time || '').trim();
  const status = String(request.body.status || 'blocked').toLowerCase();
  if (!isAvailableBookingSlot(date, time)) return response.status(400).json({ error: 'Choose a valid Tuesday, Wednesday, Thursday, or Sunday slot between 11:00 and 18:40.' });
  if (!['available', 'blocked'].includes(status)) return response.status(400).json({ error: 'Availability status must be available or blocked.' });
  database.run(
    `INSERT INTO booking_availability (slot_date, start_time, end_time, status)
     VALUES (?, ?, ADDTIME(?, '02:20:00'), ?)
     ON DUPLICATE KEY UPDATE status = IF(status = 'booked', status, VALUES(status))`,
    [date, time, time, status],
    function (error) {
      if (error) return response.status(500).json({ error: databaseError('Updating booking availability failed.', error) });
      database.get('SELECT status FROM booking_availability WHERE slot_date = ? AND start_time = ?', [date, time], (lookupError, slot) => {
        if (lookupError) return response.status(500).json({ error: databaseError('Reading booking availability failed.', lookupError) });
        if (!slot) return response.status(404).json({ error: 'The booking slot was not found.' });
        if (slot.status !== status && slot.status === 'booked') return response.status(409).json({ error: 'A paid booking already occupies this slot.' });
        recordAuditSafely(database, { userId: request.admin.id, action: 'booking_availability_changed', entityType: 'booking_slot', details: { date, time, status: slot.status }, ipAddress: request.ip });
        response.json({ date, time, status: slot.status });
      });
    }
  );
});

router.delete('/admin/bookings/availability', sessions.requireAdmin, (request, response) => {
  const date = String(request.query.date || '').trim();
  const time = String(request.query.time || '').trim();
  if (!isAvailableBookingSlot(date, time)) return response.status(400).json({ error: 'Provide a valid booking date and time.' });
  database.run('DELETE FROM booking_availability WHERE slot_date = ? AND start_time = ? AND status <> ?', [date, time, 'booked'], function (error) {
    if (error) return response.status(500).json({ error: databaseError('Removing booking availability failed.', error) });
    if (!this.changes) return response.status(404).json({ error: 'No unreserved booking slot was found.' });
    recordAuditSafely(database, { userId: request.admin.id, action: 'booking_availability_removed', entityType: 'booking_slot', details: { date, time }, ipAddress: request.ip });
    response.json({ date, time, removed: true });
  });
});

module.exports = router;
