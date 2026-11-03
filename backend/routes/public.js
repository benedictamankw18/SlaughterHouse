const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const database = require('../database');
const config = require('../config');
const { requireCustomer } = require('../session-store');
const { databaseError } = require('../services/error-messages');
const validators = require('../services/input-validation');

const router = express.Router();
const queryRows = (query, parameters = []) => new Promise((resolve, reject) => database.all(query, parameters, (error, rows) => error ? reject(error) : resolve(rows || [])));
const queryOne = (query, parameters = []) => new Promise((resolve, reject) => database.get(query, parameters, (error, row) => error ? reject(error) : resolve(row)));

async function getBeatDefaults() {
  const rows = await queryRows("SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('beat_default_basic_usd', 'beat_default_premium_usd', 'beat_default_unlimited_usd', 'beat_default_exclusive_usd')");
  return rows.reduce((defaults, row) => {
    const license = row.setting_key.replace('beat_default_', '').replace('_usd', '');
    defaults[license] = Number(row.setting_value);
    return defaults;
  }, {});
}

function mapBeat(beat, defaults) {
  return {
    ...beat,
    previewUrl: beat.previewFile ? new URL(`/api/uploads/${encodeURIComponent(beat.previewFile)}`, config.apiPublicUrl).toString() : null,
    previewDurationSeconds: beat.previewDurationSeconds === null ? null : Number(beat.previewDurationSeconds),
    prices: {
      basic: Number(beat.basic_price) > 0 ? Number(beat.basic_price) : defaults.basic,
      premium: Number(beat.premium_price) > 0 ? Number(beat.premium_price) : defaults.premium,
      unlimited: Number(beat.unlimited_price) > 0 ? Number(beat.unlimited_price) : defaults.unlimited,
      exclusive: Number(beat.exclusive_price) > 0 ? Number(beat.exclusive_price) : defaults.exclusive
    }
  };
}

router.get('/health', (request, response) => response.json({ status: 'ok' }));

router.get('/beats', async (request, response) => {
  const page = Math.max(1, Number.parseInt(request.query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(request.query.pageSize, 10) || 12));
  const search = String(request.query.search || '').trim();
  const genre = String(request.query.genre || '').trim();
  const mood = String(request.query.mood || '').trim();
  const musicalKey = String(request.query.key || '').trim();
  const minBpm = request.query.minBpm === undefined ? null : Number(request.query.minBpm);
  const maxBpm = request.query.maxBpm === undefined ? null : Number(request.query.maxBpm);
  if (minBpm !== null && (!Number.isInteger(minBpm) || minBpm < 1 || minBpm > 400)) return response.status(400).json({ error: 'Minimum BPM must be a whole number between 1 and 400.' });
  if (maxBpm !== null && (!Number.isInteger(maxBpm) || maxBpm < 1 || maxBpm > 400)) return response.status(400).json({ error: 'Maximum BPM must be a whole number between 1 and 400.' });
  if (minBpm !== null && maxBpm !== null && minBpm > maxBpm) return response.status(400).json({ error: 'Minimum BPM cannot be greater than maximum BPM.' });
  const sortMap = { newest: 'created_at DESC', oldest: 'created_at ASC', title: 'title ASC', bpm: 'bpm ASC' };
  const sort = sortMap[String(request.query.sort || 'newest')] || sortMap.newest;
  const conditions = ['catalog_status = ?'];
  const parameters = ['published'];
  if (search) { conditions.push('(title LIKE ? OR genre LIKE ? OR mood LIKE ? OR musical_key LIKE ?)'); parameters.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }
  if (genre) { conditions.push('LOWER(genre) = LOWER(?)'); parameters.push(genre); }
  if (mood) { conditions.push('LOWER(mood) = LOWER(?)'); parameters.push(mood); }
  if (musicalKey) { conditions.push('LOWER(musical_key) = LOWER(?)'); parameters.push(musicalKey); }
  if (minBpm !== null) { conditions.push('bpm >= ?'); parameters.push(minBpm); }
  if (maxBpm !== null) { conditions.push('bpm <= ?'); parameters.push(maxBpm); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const [rows, countRow, defaults] = await Promise.all([
      queryRows(`SELECT id, title, bpm, musical_key AS musicalKey, genre, mood, cover_art AS coverArt, preview_file AS previewFile, preview_duration_seconds AS previewDurationSeconds, basic_price, premium_price, unlimited_price, exclusive_price, created_at AS createdAt FROM beats ${where} ORDER BY ${sort} LIMIT ? OFFSET ?`, [...parameters, pageSize, (page - 1) * pageSize]),
      queryOne(`SELECT COUNT(*) AS count FROM beats ${where}`, parameters),
      getBeatDefaults()
    ]);
    response.json({ beats: rows.map(beat => mapBeat(beat, defaults)), pagination: { page, pageSize, total: Number(countRow?.count || 0), pages: Math.max(1, Math.ceil(Number(countRow?.count || 0) / pageSize)) } });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading beats failed.', error) });
  }
});

router.get('/beats/:id', async (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Beat ID must be a positive whole number.' });
  try {
    const [beat, defaults] = await Promise.all([
      queryOne('SELECT id, title, bpm, musical_key AS musicalKey, genre, mood, cover_art AS coverArt, preview_file AS previewFile, preview_duration_seconds AS previewDurationSeconds, mp3_file AS mp3File, wav_file AS wavFile, stems_file AS stemsFile, basic_price, premium_price, unlimited_price, exclusive_price, created_at AS createdAt FROM beats WHERE id = ? AND catalog_status = ?', [Number(request.params.id), 'published']),
      getBeatDefaults()
    ]);
    if (!beat) return response.status(404).json({ error: `Beat ${request.params.id} was not found.` });
    response.json({ beat: mapBeat(beat, defaults) });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading the beat details failed.', error) });
  }
});

router.get('/wishlists', requireCustomer, (request, response) => {
  queryRows(
    `SELECT b.id, b.title, b.bpm, b.musical_key AS musicalKey, b.genre, b.mood,
            b.cover_art AS coverArt, b.preview_file AS previewFile, w.created_at AS addedAt
     FROM wishlists w
     JOIN beats b ON b.id = w.beat_id
     WHERE w.user_id = ?
     ORDER BY w.created_at DESC`,
    [request.customer.id]
  ).then(wishlists => response.json({ wishlists }))
    .catch(error => response.status(500).json({ error: databaseError('Loading your wishlist failed.', error) }));
});

router.post('/wishlists/:beatId', requireCustomer, (request, response) => {
  if (!/^\d+$/.test(request.params.beatId) || Number(request.params.beatId) < 1) return response.status(400).json({ error: 'Beat ID must be a positive whole number.' });
  const beatId = Number(request.params.beatId);
  database.run('INSERT INTO wishlists (user_id, beat_id) VALUES (?, ?)', [request.customer.id, beatId], function (error) {
    if (error?.code === 'ER_DUP_ENTRY') return response.status(409).json({ error: 'This beat is already in your wishlist.' });
    if (error?.code === 'ER_NO_REFERENCED_ROW_2') return response.status(404).json({ error: `Beat ${beatId} was not found.` });
    if (error) return response.status(500).json({ error: databaseError('Adding the beat to your wishlist failed.', error) });
    response.status(201).json({ message: 'Beat added to your wishlist.', beatId });
  });
});

router.delete('/wishlists/:beatId', requireCustomer, (request, response) => {
  if (!/^\d+$/.test(request.params.beatId) || Number(request.params.beatId) < 1) return response.status(400).json({ error: 'Beat ID must be a positive whole number.' });
  database.run('DELETE FROM wishlists WHERE user_id = ? AND beat_id = ?', [request.customer.id, Number(request.params.beatId)], function (error) {
    if (error) return response.status(500).json({ error: databaseError('Removing the beat from your wishlist failed.', error) });
    if (!this.changes) return response.status(404).json({ error: 'That beat was not in your wishlist.' });
    response.status(204).end();
  });
});

router.get('/reviews', (request, response) => {
  queryRows("SELECT id, customer_name, rating, review_text, created_at FROM customer_reviews WHERE status = 'approved' ORDER BY created_at DESC LIMIT 12")
    .then(reviews => response.json({ reviews }))
    .catch(error => response.status(500).json({ error: databaseError('Loading approved reviews failed.', error) }));
});

router.post('/reviews', requireCustomer, (request, response) => {
  const name = request.customer.name;
  const email = request.customer.email;
  const review = String(request.body.review || '').trim();
  const rating = Number(request.body.rating);
  const validationError = validators.text(name, 'Name', { required: true, max: 120 })
    || validators.email(email)
    || (review.length < 3 || review.length > 2000 ? 'Review must be between 3 and 2,000 characters.' : null)
    || validators.integer(rating, 'Rating', { min: 1, max: 5 });
  if (validationError) return response.status(400).json({ error: validationError });
  database.run('INSERT INTO customer_reviews (customer_name, customer_email, rating, review_text) VALUES (?, ?, ?, ?)', [name, email, rating, review], function (error) {
    if (error) return response.status(500).json({ error: databaseError('Submitting your review failed.', error) });
    response.status(201).json({ id: this.lastID, message: 'Thanks. Your review is waiting for approval.' });
  });
});

router.get('/users/count', (request, response) => {
  database.all("SELECT COUNT(*) AS count FROM users WHERE role <> 'admin'", [], (error, rows) => {
    if (error) return response.status(500).json({ error: databaseError('Reading the user count failed.', error) });
    response.json({ count: Number(rows?.[0]?.count || 0) });
  });
});

router.get('/merchandise', (request, response) => {
  database.all('SELECT id, title, description, price, photo FROM merchandise ORDER BY created_at DESC', (error, merchandise) => {
    if (error) return response.status(500).json({ error: databaseError('Loading merchandise failed.', error) });
    response.json({ merchandise });
  });
});

router.get('/uploads/:filename', (request, response) => {
  const filename = path.basename(request.params.filename);
  if (filename !== request.params.filename || /^(mp3|wav|stems)-/i.test(filename)) return response.sendStatus(404);
  response.sendFile(path.join(config.uploadDirectory, filename), error => {
    if (error && !response.headersSent) response.sendStatus(404);
  });
});

module.exports = router;
