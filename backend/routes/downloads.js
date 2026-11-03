const express = require('express');
const path = require('node:path');
const database = require('../database');
const config = require('../config');
const { verifyDownloadToken } = require('../services/downloads');
const { databaseError } = require('../services/error-messages');

const router = express.Router();

router.get('/orders/:reference/downloads/:productId', (request, response) => {
  const license = String(request.query.license || '').toLowerCase();
  const format = String(request.query.format || 'mp3').toLowerCase();
  if (!verifyDownloadToken(request.query.token, request.params.reference, request.params.productId, license, format)) return response.status(403).json({ error: 'This download link is invalid or expired.' });
  database.get('SELECT * FROM orders WHERE reference = ? AND status = ?', [request.params.reference, 'paid'], (orderError, order) => {
    if (orderError) return response.status(500).json({ error: databaseError('Looking up the paid order failed.', orderError) });
    if (!order) return response.status(404).json({ error: `No paid order was found for reference ${request.params.reference}.` });
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
      response.download(path.join(config.uploadDirectory, path.basename(requestedFile)), path.basename(requestedFile));
    });
  });
});

module.exports = router;
