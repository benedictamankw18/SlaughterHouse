const express = require('express');
const fs = require('node:fs');
const database = require('../database');
const config = require('../config');
const storage = require('../services/storage');
const { sendStoredFile } = require('../services/storage/response');
const sessions = require('../session-store');
const { requireCustomer } = sessions;
const { databaseError } = require('../services/error-messages');
const validators = require('../services/input-validation');
const { rateLimit } = require('../services/rate-limit');
const { notifyAdminsSafely } = require('../services/notifications');
const { DEFAULT_LICENSE_RIGHTS, loadLicenseDefinitions, loadLicenseRights } = require('../services/license-rights');
const { ensureCertificateForLicense, certificateToken } = require('../services/license-certificates');
const { checkReadiness } = require('../services/health');
const { getDownloadItems } = require('../services/downloads');

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

async function getActiveLicenseTypes() {
  const rows = await queryRows('SELECT license_type, is_active FROM license_definition_status');
  if (!rows.length) return Object.keys(DEFAULT_LICENSE_RIGHTS);
  return rows.filter(row => Boolean(Number(row.is_active))).map(row => String(row.license_type).toLowerCase());
}

function mapBeat(beat, defaults, activeLicenseTypes) {
  const prices = {
    basic: Number(beat.basic_price) > 0 ? Number(beat.basic_price) : defaults.basic,
    premium: Number(beat.premium_price) > 0 ? Number(beat.premium_price) : defaults.premium,
    unlimited: Number(beat.unlimited_price) > 0 ? Number(beat.unlimited_price) : defaults.unlimited,
    exclusive: Number(beat.exclusive_price) > 0 ? Number(beat.exclusive_price) : defaults.exclusive
  };
  return {
    ...beat,
    previewUrl: storage.publicUrl(beat.previewFile),
    previewDurationSeconds: beat.previewDurationSeconds === null ? null : Number(beat.previewDurationSeconds),
    prices: Object.fromEntries(activeLicenseTypes.filter(type => Object.hasOwn(prices, type)).map(type => [type, prices[type]]))
  };
}

router.get('/health', (request, response) => response.json({ status: 'ok' }));

router.get('/ready', async (request, response) => {
  const readiness = await checkReadiness(database, config, storage);
  response.status(readiness.ready ? 200 : 503).json({
    status: readiness.ready ? 'ready' : 'not_ready',
    checks: readiness.checks
  });
});

router.get('/license-definitions', sessions.allowVisitor, async (request, response) => {
  try {
    const definitions = await loadLicenseDefinitions(database);
    response.json({ definitions: definitions.filter(definition => definition.active) });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading license definitions failed.', error) });
  }
});

router.get('/beats', sessions.allowVisitor, async (request, response) => {
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
    const [rows, countRow, defaults, activeLicenseTypes] = await Promise.all([
      queryRows(`SELECT id, title, bpm, musical_key AS musicalKey, genre, mood, cover_art AS coverArt, preview_file AS previewFile, preview_duration_seconds AS previewDurationSeconds, basic_price, premium_price, unlimited_price, exclusive_price, created_at AS createdAt FROM beats ${where} ORDER BY ${sort} LIMIT ? OFFSET ?`, [...parameters, pageSize, (page - 1) * pageSize]),
      queryOne(`SELECT COUNT(*) AS count FROM beats ${where}`, parameters),
      getBeatDefaults(),
      getActiveLicenseTypes()
    ]);
    response.json({ beats: rows.map(beat => mapBeat(beat, defaults, activeLicenseTypes)), pagination: { page, pageSize, total: Number(countRow?.count || 0), pages: Math.max(1, Math.ceil(Number(countRow?.count || 0) / pageSize)) } });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading beats failed.', error) });
  }
});

router.get('/beats/:id', sessions.allowVisitor, async (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Beat ID must be a positive whole number.' });
  try {
    const [beat, defaults, activeLicenseTypes] = await Promise.all([
      queryOne('SELECT id, title, bpm, musical_key AS musicalKey, genre, mood, cover_art AS coverArt, preview_file AS previewFile, preview_duration_seconds AS previewDurationSeconds, mp3_file AS mp3File, wav_file AS wavFile, stems_file AS stemsFile, basic_price, premium_price, unlimited_price, exclusive_price, created_at AS createdAt FROM beats WHERE id = ? AND catalog_status = ?', [Number(request.params.id), 'published']),
      getBeatDefaults(),
      getActiveLicenseTypes()
    ]);
    if (!beat) return response.status(404).json({ error: `Beat ${request.params.id} was not found.` });
    response.json({ beat: mapBeat(beat, defaults, activeLicenseTypes) });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading the beat details failed.', error) });
  }
});

router.get('/stream-releases', sessions.allowVisitor, async (request, response) => {
  try {
    const rows = await queryRows(
      `SELECT id, title, artist, credits_json AS "creditsJson", cover_url AS "coverUrl",
              links_json AS "linksJson"
       FROM stream_releases
       WHERE status = 'published'
       ORDER BY sort_order ASC, id ASC`
    );
    const parseJson = value => typeof value === 'string' ? JSON.parse(value) : value;
    response.json({
      releases: rows.map(release => ({
        ...release,
        credits: parseJson(release.creditsJson),
        links: parseJson(release.linksJson)
      }))
    });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading stream releases failed.', error) });
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

router.get('/customer/purchases', requireCustomer, async (request, response) => {
  try {
    const orders = await queryRows(
      `SELECT o.reference, o.status, o.amount, o.currency, o.created_at, oi.product_type, oi.product_id,
              oi.product_name, oi.license_type, oi.unit_amount, oi.quantity
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE lower(o.customer_email) = lower(?) AND o.status = 'paid'
       ORDER BY o.created_at DESC, oi.id ASC`,
      [request.customer.email]
    );
    response.json({ purchases: orders });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading your purchases failed.', error) });
  }
});

router.get('/customer/orders', requireCustomer, async (request, response) => {
  try {
    const orders = await queryRows(
      `SELECT id, reference, status, fulfillment_status, amount, currency, created_at
       FROM orders
       WHERE lower(customer_email) = lower(?)
       ORDER BY created_at DESC`,
      [request.customer.email]
    );
    const ordersWithItems = await Promise.all(orders.map(async order => {
      const [items, fulfillmentHistory] = await Promise.all([
        queryRows(
          `SELECT product_type, product_name, license_type, unit_amount, quantity
           FROM order_items WHERE order_id = ? ORDER BY id`,
          [order.id]
        ),
        queryRows(
          `SELECT status, created_at
           FROM order_fulfillment_history WHERE order_id = ? ORDER BY created_at, id`,
          [order.id]
        )
      ]);
      return { ...order, items, fulfillmentHistory };
    }));
    response.json({ orders: ordersWithItems });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading your orders failed.', error) });
  }
});

router.get('/customer/licenses', requireCustomer, async (request, response) => {
  try {
    let licenses = await queryRows(
      `SELECT l.id, l.beat_id, b.title AS beat_title, b.genre, b.bpm, b.musical_key, b.cover_art,
              l.order_id, o.reference AS order_reference, l.license_type, l.rights_json,
              l.purchased_at, l.expires_at, (l.expires_at IS NULL OR l.expires_at > CURRENT_TIMESTAMP) AS license_active,
              o.items_json, c.id AS certificate_record_id, c.certificate_id,
              c.terms_version, c.status AS certificate_status, c.issued_at
       FROM licenses l
       JOIN beats b ON b.id = l.beat_id
       JOIN orders o ON o.id = l.order_id
       LEFT JOIN license_certificates c ON c.id = (
         SELECT latest.id FROM license_certificates latest
         WHERE latest.license_id = l.id ORDER BY latest.issued_at DESC, latest.id DESC LIMIT 1
       )
       WHERE l.user_id = ? AND l.revoked_at IS NULL AND o.status = 'paid'
       ORDER BY l.purchased_at DESC`,
      [request.customer.id]
    );
    for (const license of licenses.filter(item => !item.certificate_record_id)) {
      await ensureCertificateForLicense(database, license.id);
    }
    if (licenses.some(license => !license.certificate_record_id)) {
      licenses = await queryRows(
        `SELECT l.id, l.beat_id, b.title AS beat_title, b.genre, b.bpm, b.musical_key, b.cover_art,
                l.order_id, o.reference AS order_reference, l.license_type, l.rights_json,
                l.purchased_at, l.expires_at, (l.expires_at IS NULL OR l.expires_at > CURRENT_TIMESTAMP) AS license_active,
                o.items_json, c.id AS certificate_record_id, c.certificate_id,
                c.terms_version, c.status AS certificate_status, c.issued_at
         FROM licenses l
         JOIN beats b ON b.id = l.beat_id
         JOIN orders o ON o.id = l.order_id
         LEFT JOIN license_certificates c ON c.id = (
           SELECT latest.id FROM license_certificates latest
           WHERE latest.license_id = l.id ORDER BY latest.issued_at DESC, latest.id DESC LIMIT 1
         )
         WHERE l.user_id = ? AND l.revoked_at IS NULL AND o.status = 'paid'
         ORDER BY l.purchased_at DESC`,
        [request.customer.id]
      );
    }
    const licenseRights = await loadLicenseRights(database);
    const downloadsByOrder = new Map();
    licenses = licenses.map(license => {
      let verificationUrl = null;
      if (license.certificate_id) {
        const url = new URL('verify-certificate.html', `${config.frontendOrigin}/`);
        url.searchParams.set('token', certificateToken(license.certificate_id));
        verificationUrl = url.toString();
      }
      let downloads = [];
      if (Number(license.license_active)) {
        if (!downloadsByOrder.has(license.order_id)) {
          downloadsByOrder.set(license.order_id, getDownloadItems({
            reference: license.order_reference,
            items_json: license.items_json
          }, config.apiPublicUrl, licenseRights));
        }
        downloads = downloadsByOrder.get(license.order_id)
          .find(item => Number(item.productId) === Number(license.beat_id) && item.license === license.license_type)?.files || [];
      }
      return {
        ...license,
        certificate_status: !Number(license.license_active) ? 'expired' : license.certificate_status || 'missing',
        verification_url: verificationUrl,
        downloads
      };
    });
    response.json({ licenses });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading your licenses failed.', error) });
  }
});

router.get('/customer/downloads', requireCustomer, async (request, response) => {
  try {
    const downloads = await queryRows(
      `SELECT d.beat_id, b.title AS beat_title, d.license_type, d.format, d.created_at,
              d.order_id, o.reference AS order_reference
       FROM download_events d
       JOIN orders o ON o.id = d.order_id
       JOIN beats b ON b.id = d.beat_id
       WHERE d.user_id = ?
       ORDER BY d.created_at DESC`,
      [request.customer.id]
    );
    response.json({ downloads });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading your download history failed.', error) });
  }
});

router.get('/customer/bookings', requireCustomer, async (request, response) => {
  try {
    const bookings = await queryRows(
      `SELECT id, service, artist_count, song_count, booking_slots_json, preferred_date,
              preferred_time, details, status, admin_notes, payment_reference, created_at
       FROM bookings
       WHERE lower(email) = lower(?)
       ORDER BY created_at DESC`,
      [request.customer.email]
    );
    response.json({ bookings });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading your bookings failed.', error) });
  }
});

router.get('/customer/notifications', requireCustomer, async (request, response) => {
  try {
    const notifications = await queryRows(
      `SELECT id, type, title, message, read_at, read_at IS NOT NULL AS is_read, created_at
       FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
      [request.customer.id]
    );
    response.json({ notifications });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading your notifications failed.', error) });
  }
});

router.patch('/customer/notifications/:id/read', requireCustomer, async (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Notification ID must be a positive whole number.' });
  try {
    const result = await new Promise((resolve, reject) => database.run(
      'UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id = ? AND user_id = ?',
      [Number(request.params.id), request.customer.id],
      function (error) { if (error) reject(error); else resolve(this); }
    ));
    if (!result.changes) {
      const notification = await queryOne('SELECT id FROM notifications WHERE id = ? AND user_id = ?', [Number(request.params.id), request.customer.id]);
      if (!notification) return response.status(404).json({ error: 'Notification was not found.' });
    }
    response.json({ id: Number(request.params.id), read: true });
  } catch (error) {
    response.status(500).json({ error: databaseError('Updating the notification failed.', error) });
  }
});

router.patch('/customer/notifications/:id/unread', requireCustomer, async (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Notification ID must be a positive whole number.' });
  try {
    const result = await new Promise((resolve, reject) => database.run(
      'UPDATE notifications SET read_at = NULL WHERE id = ? AND user_id = ?',
      [Number(request.params.id), request.customer.id],
      function (error) { if (error) reject(error); else resolve(this); }
    ));
    if (!result.changes) {
      const notification = await queryOne('SELECT id FROM notifications WHERE id = ? AND user_id = ?', [Number(request.params.id), request.customer.id]);
      if (!notification) return response.status(404).json({ error: 'Notification was not found.' });
    }
    response.json({ id: Number(request.params.id), read: false });
  } catch (error) {
    response.status(500).json({ error: databaseError('Updating the notification failed.', error) });
  }
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

router.post('/reviews', requireCustomer, rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: 'Too many review submissions. Try again later.' }), (request, response) => {
  const name = request.customer.name;
  const email = request.customer.email;
  const review = String(request.body.review || '').trim();
  const rating = Number(request.body.rating);
  const validationError = validators.text(name, 'Name', { required: true, max: 120 })
    || validators.email(email)
    || (review.length < 3 || review.length > 2000 ? 'Review must be between 3 and 2,000 characters.' : null)
    || validators.integer(rating, 'Rating', { min: 1, max: 5 });
  if (validationError) return response.status(400).json({ error: validationError });
  database.run('INSERT INTO customer_reviews (user_id, customer_name, customer_email, rating, review_text) VALUES (?, ?, ?, ?, ?)', [request.customer.id, name, email, rating, review], function (error) {
    if (error) return response.status(500).json({ error: databaseError('Submitting your review failed.', error) });
    notifyAdminsSafely(database, {
      type: 'review_submitted',
      title: 'Review awaiting moderation',
      message: `${name} submitted a ${rating}-star review awaiting approval.`,
      dedupeKey: `review-submitted:${this.lastID}`
    });
    response.status(201).json({ id: this.lastID, message: 'Thanks. Your review is waiting for approval.' });
  });
});

router.get('/users/count', (request, response) => {
  database.all("SELECT COUNT(*) AS count FROM users WHERE role NOT IN ('admin', 'super_admin')", [], (error, rows) => {
    if (error) return response.status(500).json({ error: databaseError('Reading the user count failed.', error) });
    response.json({ count: Number(rows?.[0]?.count || 0) });
  });
});

router.get('/merchandise', (request, response) => {
  database.all("SELECT id, title, description, price, photo, stock_quantity AS stockQuantity FROM merchandise WHERE catalog_status = 'published' ORDER BY created_at DESC", (error, merchandise) => {
    if (error) return response.status(500).json({ error: databaseError('Loading merchandise failed.', error) });
    response.json({ merchandise });
  });
});

router.get('/uploads/:filename', async (request, response) => {
  const filename = request.params.filename;
  // Only catalogue artwork and public previews are served without authentication.
  // Master, stems, sample-audio, and certificate assets are never exposed here.
  if (!storage.publicUrl(filename)) return response.sendStatus(404);
  // Upload filenames are unique per write, so public images and previews can be cached permanently.
  try {
    await sendStoredFile(response, filename, {
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }
    });
  } catch {
    if (!response.headersSent) response.sendStatus(500);
  }
});

module.exports = router;
