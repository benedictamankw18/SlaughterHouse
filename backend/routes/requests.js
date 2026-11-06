const express = require('express');
const path = require('node:path');
const database = require('../database');
const config = require('../config');
const { getPricing } = require('../services/pricing');
const { saveUpload, deleteUploads } = require('../services/uploads');
const { databaseError } = require('../services/error-messages');
const validators = require('../services/input-validation');
const sessions = require('../session-store');

const router = express.Router();
const queryOne = (query, parameters = []) => new Promise((resolve, reject) => database.get(query, parameters, (error, row) => error ? reject(error) : resolve(row)));
const runQuery = (query, parameters = []) => new Promise((resolve, reject) => database.run(query, parameters, function (error) {
  error ? reject(error) : resolve({ lastID: this.lastID, changes: this.changes });
}));

router.get('/requests/beat-license-prices', (request, response) => {
  getPricing(database).then(({ beatRequestLicensePrices: prices }) => {
    if (Object.values(prices).some(price => !Number.isFinite(price) || price <= 0)) return response.status(503).json({ error: 'One or more custom beat license prices are missing or not greater than zero in the settings table.' });
    response.json({ prices });
  }).catch(error => response.status(500).json({ error: databaseError('Loading beat license prices failed.', error) }));
});

router.post('/requests', async (request, response) => {
  let pricing;
  try { pricing = await getPricing(database); } catch (error) { return response.status(500).json({ error: databaseError('Loading current pricing failed.', error) }); }
  const { requestType = 'merchandise', name, email, productName, details, sampleAudio, sampleUrl, license } = request.body;
  const requestError = validators.text(name, 'Name', { required: true, max: 255 })
    || validators.email(email)
    || validators.text(details, 'Request details', { required: true, max: 5000 });
  if (requestError) return response.status(400).json({ error: requestError });
  if (!['beat', 'merchandise'].includes(requestType)) return response.status(400).json({ error: 'Request type must be beat or merchandise.' });
  if (productName && validators.text(productName, 'Product name', { max: 255 })) return response.status(400).json({ error: validators.text(productName, 'Product name', { max: 255 }) });
  const normalizedRequestType = requestType === 'beat' ? 'beat' : 'merchandise';
  const requestedLicense = normalizedRequestType === 'beat' ? String(license || '').toLowerCase() : null;
  const licensePrice = requestedLicense ? pricing.beatRequestLicensePrices[requestedLicense] : null;
  if (normalizedRequestType === 'beat' && !config.beatRequestLicenseLabels[requestedLicense]) return response.status(400).json({ error: 'Choose a beat license.' });
  if (normalizedRequestType === 'beat' && (!Number.isFinite(licensePrice) || licensePrice <= 0)) return response.status(503).json({ error: 'The selected beat license price is not configured.' });
  let sampleAudioFile = null;
  let sampleLink = null;
  try {
    if (normalizedRequestType === 'beat' && String(sampleUrl || '').trim()) {
      if (String(sampleUrl).length > 2048) return response.status(400).json({ error: 'The sample link must be 2,048 characters or shorter.' });
      const parsedLink = new URL(String(sampleUrl).trim());
      if (!['http:', 'https:'].includes(parsedLink.protocol)) return response.status(400).json({ error: 'Enter a valid YouTube or song link.' });
      sampleLink = parsedLink.toString();
    }
    if (normalizedRequestType === 'beat' && sampleAudio) {
      const match = String(sampleAudio.data || '').match(/^data:([^;]+);base64,(.+)$/i);
      const extension = path.extname(String(sampleAudio.name || '')).toLowerCase();
      const allowedExtensions = new Set(['.mp3', '.m4a', '.mp4', '.wav', '.ogg']);
      const allowedAudioTypes = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'video/mp4', 'application/octet-stream']);
      if (!match || !allowedExtensions.has(extension) || !allowedAudioTypes.has(match[1].toLowerCase())) return response.status(400).json({ error: 'Upload an MP3, M4A, MP4, WAV, or OGG audio file.' });
      if (Buffer.from(match[2], 'base64').length > 15 * 1024 * 1024) return response.status(400).json({ error: 'Audio files must be 15 MB or smaller.' });
      sampleAudioFile = await saveUpload(sampleAudio, 'sample-audio', 'audio');
    }
  } catch (error) {
    return response.status(400).json({ error: error.message || 'The sample audio could not be saved. Check the file type and size, then try again.' });
  }
  let user;
  try {
    user = await queryOne("SELECT id FROM users WHERE lower(email) = lower(?) AND role NOT IN ('admin', 'super_admin')", [String(email).trim()]);
  } catch (error) {
    await deleteUploads([sampleAudioFile]);
    return response.status(500).json({ error: databaseError('Looking up the request customer failed.', error) });
  }
  try {
    const result = await runQuery(
      'INSERT INTO customization_requests (user_id, request_type, customer_name, customer_email, product_name, details, sample_audio_file, sample_link, requested_license, license_price_gsh) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [user?.id || null, normalizedRequestType, name.trim(), email.trim().toLowerCase(), productName || null, details.trim(), sampleAudioFile, sampleLink, requestedLicense, licensePrice]
    );
    response.status(201).json({ id: result.lastID });
  } catch (error) {
    await deleteUploads([sampleAudioFile]);
    response.status(500).json({ error: databaseError('Saving the customization request failed.', error) });
  }
});

router.get('/customer/requests', sessions.requireCustomer, (request, response) => {
  database.all(
    `SELECT id, request_type, product_name, details, requested_license, license_price_gsh,
            status, quote_gsh, admin_notes, created_at
     FROM customization_requests WHERE user_id = ? ORDER BY created_at DESC`,
    [request.customer.id],
    (error, requests) => {
      if (error) return response.status(500).json({ error: databaseError('Loading your requests failed.', error) });
      response.json({ requests: requests || [] });
    }
  );
});

module.exports = router;
