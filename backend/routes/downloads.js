const express = require('express');
const path = require('node:path');
const database = require('../database');
const { sendStoredFile } = require('../services/storage/response');
const { requireCustomer } = require('../session-store');
const { verifyDownloadToken, isDownloadableOrderStatus } = require('../services/downloads');
const { databaseError } = require('../services/error-messages');
const { rateLimit } = require('../services/rate-limit');
const { rightsForPurchasedLicense, allowedFormats } = require('../services/license-rights');

const router = express.Router();
const queryOne = (query, parameters = []) => new Promise((resolve, reject) => database.get(query, parameters, (error, row) => error ? reject(error) : resolve(row)));
const run = (query, parameters = []) => new Promise((resolve, reject) => database.run(query, parameters, function (error) { error ? reject(error) : resolve(this); }));

router.get('/orders/:reference/downloads/:productId', rateLimit({ windowMs: 60 * 1000, max: 30, message: 'Too many download requests. Try again shortly.' }), requireCustomer, async (request, response) => {
  const license = String(request.query.license || '').toLowerCase();
  const format = String(request.query.format || 'mp3').toLowerCase();
  if (!verifyDownloadToken(request.query.token, request.params.reference, request.params.productId, license, format)) return response.status(403).json({ error: 'This download link is invalid or expired.' });
  try {
    const order = await queryOne('SELECT * FROM orders WHERE reference = ?', [request.params.reference]);
    if (!order) return response.status(404).json({ error: `No order was found for reference ${request.params.reference}.` });
    if (!isDownloadableOrderStatus(order.status)) return response.status(403).json({ error: 'Downloads are available only for fully paid orders.' });
    if (request.customer.id === undefined || request.customer.email.toLowerCase() !== String(order.customer_email).toLowerCase()) return response.status(403).json({ error: 'This download belongs to a different customer account.' });
    let items;
    try { items = JSON.parse(order.items_json); } catch { return response.status(500).json({ error: 'Order data is invalid.' }); }
    const item = items.find(candidate => String(candidate.productId) === String(request.params.productId) && (!candidate.type || candidate.type === 'beat'));
    if (!item || item.license !== license) return response.status(403).json({ error: 'Download is not available for this order.' });

    const licenseRow = await queryOne(
      'SELECT id, rights_json, revoked_at, (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) AS license_active FROM licenses WHERE order_id = ? AND beat_id = ? AND license_type = ? AND user_id = ?',
      [order.id, item.productId, license, request.customer.id]
    );
    if (!licenseRow) return response.status(403).json({ error: 'No active license was found for this purchase.' });
    if (licenseRow?.revoked_at) return response.status(403).json({ error: 'This license has been revoked, so the download is no longer available.' });
    if (!Number(licenseRow.license_active)) return response.status(403).json({ error: 'This license has expired. Purchase the license again to renew access.' });

    const rightsRow = await queryOne('SELECT rights_json FROM license_rights WHERE license_type = ?', [license]);
    const rights = rightsForPurchasedLicense(licenseRow?.rights_json, rightsRow?.rights_json, license);
    if (!allowedFormats(rights).has(format)) return response.status(403).json({ error: 'This format is not included in your license.' });

    const beat = await queryOne('SELECT mp3_file, wav_file, stems_file FROM beats WHERE id = ?', [item.productId]);
    if (!beat) return response.status(404).json({ error: `No downloadable files were found for beat ${request.params.productId}.` });
    const requestedFile = { mp3: beat.mp3_file, wav: beat.wav_file, stems: beat.stems_file }[format];
    if (!requestedFile) return response.status(403).json({ error: 'This file is not included in your license.' });

    await run(
      'INSERT INTO download_events (user_id, order_id, beat_id, license_type, format) VALUES (?, ?, ?, ?, ?)',
      [request.customer.id, order.id, item.productId, license, format]
    );
    await sendStoredFile(response, path.basename(requestedFile), {
      downloadName: path.basename(requestedFile),
      headers: { 'Cache-Control': 'private, no-store' },
      range: request.headers.range
    });
  } catch (error) {
    response.status(500).json({ error: databaseError('Processing the download failed.', error) });
  }
});

module.exports = router;
