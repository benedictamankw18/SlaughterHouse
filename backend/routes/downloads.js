const express = require('express');
const path = require('node:path');
const database = require('../database');
const config = require('../config');
const { requireCustomer } = require('../session-store');
const { verifyDownloadToken } = require('../services/downloads');
const { databaseError } = require('../services/error-messages');
const { rateLimit } = require('../services/rate-limit');

const router = express.Router();

router.get('/orders/:reference/downloads/:productId', rateLimit({ windowMs: 60 * 1000, max: 30, message: 'Too many download requests. Try again shortly.' }), requireCustomer, (request, response) => {
  const license = String(request.query.license || '').toLowerCase();
  const format = String(request.query.format || 'mp3').toLowerCase();
  if (!verifyDownloadToken(request.query.token, request.params.reference, request.params.productId, license, format)) return response.status(403).json({ error: 'This download link is invalid or expired.' });
  database.get('SELECT * FROM orders WHERE reference = ? AND status = ?', [request.params.reference, 'paid'], (orderError, order) => {
    if (orderError) return response.status(500).json({ error: databaseError('Looking up the paid order failed.', orderError) });
    if (!order) return response.status(404).json({ error: `No paid order was found for reference ${request.params.reference}.` });
    if (request.customer.id === undefined || request.customer.email.toLowerCase() !== String(order.customer_email).toLowerCase()) return response.status(403).json({ error: 'This download belongs to a different customer account.' });
    let items;
    try { items = JSON.parse(order.items_json); } catch { return response.status(500).json({ error: 'Order data is invalid.' }); }
    const item = items.find(candidate => String(candidate.productId) === String(request.params.productId));
    if (!item || item.license !== license || !['basic', 'premium', 'unlimited', 'exclusive'].includes(license)) return response.status(403).json({ error: 'Download is not available for this order.' });
    database.get('SELECT mp3_file, wav_file, stems_file FROM beats WHERE id = ?', [item.productId], (beatError, beat) => {
      if (beatError) return response.status(500).json({ error: databaseError('Looking up the beat files failed.', beatError) });
      if (!beat) return response.status(404).json({ error: `No downloadable files were found for beat ${request.params.productId}.` });
      const requestedFile = { mp3: beat.mp3_file, wav: beat.wav_file, stems: beat.stems_file }[format];
      if (format === 'wav' && item.license === 'basic') return response.status(403).json({ error: 'WAV is not included in this license.' });
      if (format === 'stems' && !['unlimited', 'exclusive'].includes(item.license)) return response.status(403).json({ error: 'Stems are not included in this license.' });
      if (!requestedFile) return response.status(403).json({ error: 'This file is not included in your license.' });
      database.get('SELECT id FROM users WHERE lower(email) = lower(?) AND role <> ?', [order.customer_email, 'admin'], (userError, user) => {
        if (userError) return response.status(500).json({ error: databaseError('Recording the download failed.', userError) });
        database.run(
          'INSERT INTO download_events (user_id, order_id, beat_id, license_type, format) VALUES (?, ?, ?, ?, ?)',
          [user?.id || null, order.id, item.productId, license, format],
          eventError => {
            if (eventError) return response.status(500).json({ error: databaseError('Recording the download failed.', eventError) });
            response.download(path.join(config.uploadDirectory, path.basename(requestedFile)), path.basename(requestedFile));
          }
        );
      });
    });
  });
});

module.exports = router;
