const express = require('express');
const database = require('../database');
const sessions = require('../session-store');
const { passwordMatches } = require('../services/security');
const { saveUpload } = require('../services/uploads');
const { databaseError } = require('../services/error-messages');
const validators = require('../services/input-validation');
const { rateLimit } = require('../services/rate-limit');
const { recordAuditSafely } = require('../services/audit');

const router = express.Router();
router.use(rateLimit({ windowMs: 60 * 1000, max: 60, message: 'Too many administrator requests. Try again shortly.' }));
const queryRows = (query, parameters = []) => new Promise((resolve, reject) => database.all(query, parameters, (error, rows) => error ? reject(error) : resolve(rows || [])));

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
  if (!['approved', 'rejected'].includes(status)) return response.status(400).json({ error: 'Choose approved or rejected.' });
  database.run('UPDATE customer_reviews SET status = ? WHERE id = ?', [status, Number(request.params.id)], function (error) {
    if (error) return response.status(500).json({ error: databaseError('Updating the review status failed.', error) });
    if (!this.changes) return response.status(404).json({ error: `No customer review was found with ID ${request.params.id}.` });
    response.json({ status });
  });
});

module.exports = router;
