const crypto = require('node:crypto');
const config = require('../config');
const { validateRightsDefinition } = require('./license-rights');

const TERMS_VERSION = 'UBB-MUSIC-LICENSE-2026-11-V1';

function databaseGet(db, query, parameters = []) {
  if (db.get.length >= 3) {
    return new Promise((resolve, reject) => db.get(query, parameters, (error, row) => error ? reject(error) : resolve(row)));
  }
  return db.get(query, parameters);
}

function databaseRun(db, query, parameters = []) {
  if (db.run.length >= 3) {
    return new Promise((resolve, reject) => db.run(query, parameters, function (error) {
      error ? reject(error) : resolve({ lastID: this.lastID, changes: this.changes });
    }));
  }
  return db.run(query, parameters);
}

function certificateToken(certificateId) {
  return crypto.createHmac('sha256', config.certificateSigningSecret)
    .update(`ultbigboy-certificate:${certificateId}`)
    .digest('hex');
}

function certificateTokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createCertificateId() {
  const year = new Date().getUTCFullYear();
  return `UBB-CERT-${year}-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
}

function parseLicenseTerms(value) {
  let rights;
  try { rights = typeof value === 'string' ? JSON.parse(value) : value; } catch { rights = null; }
  if (rights && typeof rights === 'object' && !Array.isArray(rights) && Object.hasOwn(rights, 'stems')) {
    const derivedStems = Array.isArray(rights.formats) && rights.formats.includes('stems');
    if (typeof rights.stems !== 'boolean' || rights.stems !== derivedStems) {
      throw new Error('The saved license terms are missing or invalid; a certificate cannot be issued.');
    }
    rights = { ...rights };
    delete rights.stems;
  }
  const result = validateRightsDefinition(rights);
  if (result.error) throw new Error('The saved license terms are missing or invalid; a certificate cannot be issued.');
  return result.value;
}

async function issueCertificateRecord(db, licenseId, { actorUserId = null, reissuedFromId = null } = {}) {
  const license = await databaseGet(db, `SELECT l.id AS license_id, l.user_id, l.beat_id, l.order_id,
      l.license_type, l.rights_json, l.purchased_at, l.revoked_at, o.status AS order_status
    FROM licenses l
    JOIN orders o ON o.id = l.order_id
    WHERE l.id = ? FOR UPDATE`, [licenseId]);
  if (!license || !['paid', 'partially_refunded'].includes(license.order_status) || license.revoked_at) {
    throw new Error('A certificate can only be issued for an active license from a paid order.');
  }
  const rights = parseLicenseTerms(license.rights_json);
  if (!reissuedFromId) {
    const existing = await databaseGet(db, `SELECT id, certificate_id, verification_token_hash, license_id, user_id,
        order_id, order_item_id, beat_id, license_type, license_terms_snapshot, terms_version, status,
        reissued_from_id, issued_at, revoked_at, revocation_reason, pdf_storage_path
      FROM license_certificates
      WHERE license_id = ?
      ORDER BY issued_at DESC, id DESC LIMIT 1 FOR UPDATE`, [license.license_id]);
    if (existing) return existing;
  }

  const orderItem = await databaseGet(db, `SELECT id FROM order_items
    WHERE order_id = ? AND product_type = 'beat' AND product_id = ? AND license_type = ?
    ORDER BY id LIMIT 1`, [license.order_id, license.beat_id, license.license_type]);
  const certificateId = createCertificateId();
  const token = certificateToken(certificateId);
  const inserted = await databaseRun(db, `INSERT INTO license_certificates
      (certificate_id, verification_token_hash, license_id, user_id, order_id, order_item_id, beat_id,
       license_type, license_terms_snapshot, terms_version, status, reissued_from_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'valid', ?)`,
  [certificateId, certificateTokenHash(token), license.license_id, license.user_id, license.order_id,
    orderItem?.id || null, license.beat_id, license.license_type, JSON.stringify(rights), TERMS_VERSION, reissuedFromId]);
  const recordId = inserted.lastID || inserted.result?.insertId;
  await databaseRun(db, `INSERT INTO license_certificate_history
      (certificate_id, action, actor_user_id, details_json)
    VALUES (?, ?, ?, ?)`,
  [recordId, reissuedFromId ? 'reissued' : 'issued', actorUserId, JSON.stringify({ termsVersion: TERMS_VERSION, previousCertificateId: reissuedFromId })]);
  return databaseGet(db, `SELECT id, certificate_id, verification_token_hash, license_id, user_id,
      order_id, order_item_id, beat_id, license_type, license_terms_snapshot, terms_version, status,
      reissued_from_id, issued_at, revoked_at, revocation_reason, pdf_storage_path
    FROM license_certificates WHERE id = ?`, [recordId]);
}

async function ensureCertificateForLicense(db, licenseId) {
  return db.transaction(tx => issueCertificateRecord(tx, licenseId));
}

function safeCustomerDisplayName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Verified licensee';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

function tokenMatchesHash(token, expectedHash) {
  if (!/^[a-f0-9]{64}$/i.test(String(token || '')) || !/^[a-f0-9]{64}$/i.test(String(expectedHash || ''))) return false;
  const providedHash = Buffer.from(certificateTokenHash(token), 'hex');
  const storedHash = Buffer.from(expectedHash, 'hex');
  return providedHash.length === storedHash.length && crypto.timingSafeEqual(providedHash, storedHash);
}

module.exports = {
  TERMS_VERSION,
  certificateToken,
  certificateTokenHash,
  issueCertificateRecord,
  ensureCertificateForLicense,
  parseLicenseTerms,
  safeCustomerDisplayName,
  tokenMatchesHash
};
