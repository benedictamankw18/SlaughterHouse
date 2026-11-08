const crypto = require('node:crypto');
const path = require('node:path');
const config = require('../config');
const { DEFAULT_LICENSE_RIGHTS, rightsFor, allowedFormats } = require('./license-rights');
const { parseOrderItems } = require('./order-items');

const DOWNLOADABLE_ORDER_STATUSES = Object.freeze(['paid']);

function isDownloadableOrderStatus(status) {
  return DOWNLOADABLE_ORDER_STATUSES.includes(String(status ?? '').trim().toLowerCase());
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
  if (!order || typeof order !== 'object' || order.items_json == null) return [];

  const items = parseOrderItems(order.items_json);
  if (!items) return [];

  const baseUrl = apiPublicUrl ? String(apiPublicUrl).replace(/\/+$/, '') : '';
  return items
    .filter(item => item && (!item.type || item.type === 'beat'))
    .filter(item => item.productId != null && item.license)
    .map(item => ({
      productId: item.productId,
      name: item.name,
      license: item.license,
      files: [...allowedFormats(rightsFor(rightsMap, item.license))].map(format => {
        const token = createDownloadToken(order.reference, item.productId, item.license, format);
        const path = `/api/orders/${encodeURIComponent(order.reference)}/downloads/${item.productId}?license=${encodeURIComponent(item.license)}&format=${format}&token=${encodeURIComponent(token)}`;
        const url = baseUrl ? new URL(path, baseUrl).toString() : path;
        return { format: format.toUpperCase(), url };
      })
    }));
}

module.exports = { DOWNLOADABLE_ORDER_STATUSES, isDownloadableOrderStatus, createDownloadToken, verifyDownloadToken, getDownloadItems };
