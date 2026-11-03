const crypto = require('node:crypto');
const path = require('node:path');
const config = require('../config');
const { DEFAULT_LICENSE_RIGHTS, rightsFor, allowedFormats } = require('./license-rights');

// A partial refund deliberately keeps the customer's entitlements, so those
// orders must remain downloadable. Only a full refund (status "refunded")
// removes access.
const DOWNLOADABLE_ORDER_STATUSES = Object.freeze(['paid', 'partially_refunded']);

function isDownloadableOrderStatus(status) {
  return DOWNLOADABLE_ORDER_STATUSES.includes(String(status || '').toLowerCase());
}

function createDownloadToken(reference, productId, license, format, expiresAt = Date.now() + 15 * 60 * 1000) {
  if (!config.downloadSigningSecret) throw new Error('Download signing is not configured.');
  const payload = `${reference}:${productId}:${license}:${format}:${expiresAt}`;
  const signature = crypto.createHmac('sha256', config.downloadSigningSecret).update(payload).digest('hex');
  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}

function verifyDownloadToken(token, reference, productId, license, format) {
  if (!config.downloadSigningSecret || !token || !token.includes('.')) return false;
  const [encodedPayload, signature] = token.split('.');
  let payload;
  try { payload = Buffer.from(encodedPayload, 'base64url').toString('utf8'); } catch { return false; }
  const [tokenReference, tokenProductId, tokenLicense, tokenFormat, expiresAt] = payload.split(':');
  if (tokenReference !== reference || tokenProductId !== String(productId) || tokenLicense !== license || tokenFormat !== format || !Number.isInteger(Number(expiresAt)) || Number(expiresAt) < Date.now()) return false;
  const expected = crypto.createHmac('sha256', config.downloadSigningSecret).update(payload).digest('hex');
  const actualBuffer = Buffer.from(signature || '', 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function getDownloadItems(order, apiPublicUrl, licenseRights = null) {
  const rightsMap = licenseRights || DEFAULT_LICENSE_RIGHTS;
  return JSON.parse(order.items_json).filter(item => !item.type || item.type === 'beat').map(item => ({
    name: item.name,
    license: item.license,
    files: [...allowedFormats(rightsFor(rightsMap, item.license))].map(format => {
      const token = createDownloadToken(order.reference, item.productId, item.license, format);
      return { format: format.toUpperCase(), url: new URL(`/api/orders/${encodeURIComponent(order.reference)}/downloads/${item.productId}?license=${encodeURIComponent(item.license)}&format=${format}&token=${encodeURIComponent(token)}`, apiPublicUrl).toString() };
    })
  }));
}

module.exports = { DOWNLOADABLE_ORDER_STATUSES, isDownloadableOrderStatus, createDownloadToken, verifyDownloadToken, getDownloadItems };
