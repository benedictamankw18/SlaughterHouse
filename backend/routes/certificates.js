const express = require('express');
const path = require('node:path');
const database = require('../database');
const config = require('../config');
const storage = require('../services/storage');
const sessions = require('../session-store');
const { databaseError } = require('../services/error-messages');
const { recordAuditSafely } = require('../services/audit');
const { rateLimit } = require('../services/rate-limit');
const { LICENSE_TYPES } = require('../services/license-rights');
const QRCode = require('qrcode');
const {
  certificateToken,
  certificateTokenHash,
  ensureCertificateForLicense,
  issueCertificateRecord,
  parseLicenseTerms,
  safeCustomerDisplayName,
  tokenMatchesHash
} = require('../services/license-certificates');
const { createLicenseCertificatePdf } = require('../services/license-certificate');

const router = express.Router();
const { requireAdmin, requireCustomer } = sessions;
router.use(
  ['/certificates', '/customer/licenses', '/admin/certificates'],
  rateLimit({ windowMs: 60 * 1000, max: 60, message: 'Too many certificate requests. Try again shortly.' })
);

const queryRows = (query, parameters = []) => new Promise((resolve, reject) => database.all(query, parameters, (error, rows) => error ? reject(error) : resolve(rows || [])));
const queryOne = (query, parameters = []) => new Promise((resolve, reject) => database.get(query, parameters, (error, row) => error ? reject(error) : resolve(row)));
const runQuery = (query, parameters = []) => new Promise((resolve, reject) => database.run(query, parameters, function (error) {
  error ? reject(error) : resolve({ id: this.lastID, changes: this.changes });
}));

function verificationUrlFor(certificateId) {
  const url = new URL('verify-certificate.html', `${config.frontendOrigin}/`);
  url.searchParams.set('token', certificateToken(certificateId));
  return url.toString();
}

function mapCertificateRecord(row) {
  if (!row) return null;
  return {
    ...row,
    rights: parseLicenseTerms(row.license_terms_snapshot),
    verificationUrl: verificationUrlFor(row.certificate_id),
    termsUrl: new URL('license-terms.html', `${config.frontendOrigin}/`).toString()
  };
}

async function getCertificateByLicense(licenseId, userId) {
  return queryOne(`SELECT c.*, l.purchased_at, l.expires_at, (l.expires_at IS NULL OR l.expires_at > CURRENT_TIMESTAMP) AS license_active,
      l.revoked_at AS license_revoked_at, b.title AS beat_title,
      b.genre, b.bpm, b.musical_key, b.cover_art, u.name AS customer_name, u.email AS customer_email,
      o.reference AS order_reference, o.status AS order_status
    FROM license_certificates c
    JOIN licenses l ON l.id = c.license_id
    JOIN beats b ON b.id = c.beat_id
    JOIN users u ON u.id = c.user_id
    JOIN orders o ON o.id = c.order_id
    WHERE c.license_id = ? AND c.user_id = ?
    ORDER BY c.issued_at DESC, c.id DESC LIMIT 1`, [licenseId, userId]);
}

async function getCertificateByRecordId(certificateRecordId) {
  return queryOne(`SELECT c.*, l.purchased_at, l.expires_at, (l.expires_at IS NULL OR l.expires_at > CURRENT_TIMESTAMP) AS license_active,
      l.revoked_at AS license_revoked_at, b.title AS beat_title,
      b.genre, b.bpm, b.musical_key, b.cover_art, u.name AS customer_name, u.email AS customer_email,
      o.reference AS order_reference, o.status AS order_status, u.id AS customer_id
    FROM license_certificates c
    JOIN licenses l ON l.id = c.license_id
    JOIN beats b ON b.id = c.beat_id
    JOIN users u ON u.id = c.user_id
    JOIN orders o ON o.id = c.order_id
    WHERE c.id = ?`, [certificateRecordId]);
}

function certificateCurrentStatus(certificate) {
  if (certificate.status !== 'valid') return certificate.status;
  if (certificate.order_status === 'refunded') return 'refunded';
  if (certificate.license_revoked_at) return 'revoked';
  if (certificate.order_status !== 'paid') return 'suspended';
  if (certificate.license_active !== undefined && !Number(certificate.license_active)) return 'expired';
  return 'valid';
}

async function renderCertificatePdf(certificate) {
  const mapped = mapCertificateRecord(certificate);
  const status = certificateCurrentStatus(certificate);
  const fileName = `${certificate.certificate_id}-${status}.pdf`;
  let pdf;
  try {
    await storage.stat(fileName, { area: 'certificates' });
    pdf = await readStoredFile(fileName, 'certificates');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    let coverImage = null;
    if (certificate.cover_art) {
      try {
        coverImage = await readStoredFile(path.basename(certificate.cover_art), 'uploads');
      } catch (coverError) {
        if (coverError.code !== 'ENOENT') throw coverError;
      }
    }
    pdf = await createLicenseCertificatePdf({
      license: {
        ...certificate,
        rights: mapped.rights,
        terms_url: mapped.termsUrl,
        producer_name: 'UltBigBoy Music Production',
        cover_image: coverImage
      },
      certificate: { ...certificate, status },
      verificationUrl: mapped.verificationUrl
    });
    try {
      await storage.save(pdf, { area: 'certificates', key: fileName });
    } catch (writeError) {
      if (writeError.code !== 'EEXIST') throw writeError;
      pdf = await readStoredFile(fileName, 'certificates');
    }
  }
  if (certificate.pdf_storage_path !== fileName) {
    await runQuery('UPDATE license_certificates SET pdf_storage_path = ? WHERE id = ?', [fileName, certificate.id]);
  }
  return { pdf, fileName };
}

async function readStoredFile(key, area) {
  const chunks = [];
  const stream = await storage.readStream(key, { area });
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function sendCertificatePdf(response, rendered) {
  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader('Content-Disposition', `attachment; filename="${rendered.fileName}"`);
  response.setHeader('Cache-Control', 'private, no-store');
  response.send(rendered.pdf);
}

router.get('/certificates/qr/:token', async (request, response) => {
  const token = String(request.params.token || '');
  if (!/^[a-f0-9]{64}$/i.test(token)) return response.sendStatus(404);
  try {
    const storedHash = certificateTokenHash(token);
    const certificate = await queryOne('SELECT verification_token_hash FROM license_certificates WHERE verification_token_hash = ? LIMIT 1', [storedHash]);
    if (!certificate || !tokenMatchesHash(token, certificate.verification_token_hash)) return response.sendStatus(404);
    const verificationUrl = new URL('verify-certificate.html', `${config.frontendOrigin}/`);
    verificationUrl.searchParams.set('token', token);
    const image = await QRCode.toBuffer(verificationUrl.toString(), { type: 'png', width: 320, margin: 1, errorCorrectionLevel: 'M' });
    response.setHeader('Content-Type', 'image/png');
    response.setHeader('Cache-Control', 'public, max-age=300');
    response.send(image);
  } catch (error) {
    response.status(500).json({ error: databaseError('Generating the certificate verification code failed.', error) });
  }
});

router.get('/certificates/verify/:token', async (request, response) => {
  const token = String(request.params.token || '');
  if (!/^[a-f0-9]{64}$/i.test(token)) return response.status(404).json({ error: 'Certificate was not found.' });
  try {
    const storedHash = certificateTokenHash(token);
    const certificate = await queryOne(`SELECT c.certificate_id, c.verification_token_hash, c.license_type,
        c.license_terms_snapshot, c.terms_version, c.status, c.issued_at, c.revoked_at,
        l.revoked_at AS license_revoked_at, l.purchased_at, l.expires_at,
        (l.expires_at IS NULL OR l.expires_at > CURRENT_TIMESTAMP) AS license_active, b.title AS beat_title,
        u.name AS customer_name, o.reference AS order_reference, o.status AS order_status
      FROM license_certificates c
      JOIN licenses l ON l.id = c.license_id
      JOIN beats b ON b.id = c.beat_id
      JOIN users u ON u.id = c.user_id
      JOIN orders o ON o.id = c.order_id
      WHERE c.verification_token_hash = ? LIMIT 1`, [storedHash]);
    if (!certificate || !tokenMatchesHash(token, certificate.verification_token_hash)) {
      return response.status(404).json({ error: 'Certificate was not found.' });
    }
    const status = certificateCurrentStatus(certificate);
    response.setHeader('Cache-Control', 'no-store');
    response.json({
      certificate: {
        certificateId: certificate.certificate_id,
        status,
        customer: safeCustomerDisplayName(certificate.customer_name),
        beatTitle: certificate.beat_title,
        licenseType: certificate.license_type,
        orderReference: certificate.order_reference,
        purchasedAt: certificate.purchased_at,
        expiresAt: certificate.expires_at,
        issuedAt: certificate.issued_at,
        termsVersion: certificate.terms_version,
        rights: parseLicenseTerms(certificate.license_terms_snapshot)
      }
    });
  } catch (error) {
    response.status(500).json({ error: databaseError('Verifying the certificate failed.', error) });
  }
});

router.get('/customer/licenses/:id/certificate/details', requireCustomer, async (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'License ID must be a positive whole number.' });
  try {
    const ownedLicense = await queryOne(`SELECT l.id, l.revoked_at, o.status AS order_status
      FROM licenses l JOIN orders o ON o.id = l.order_id
      WHERE l.id = ? AND l.user_id = ?`, [Number(request.params.id), request.customer.id]);
    if (!ownedLicense || ownedLicense.revoked_at || ownedLicense.order_status !== 'paid') return response.status(404).json({ error: 'Paid license was not found.' });
    await ensureCertificateForLicense(database, Number(request.params.id));
    const certificate = await getCertificateByLicense(Number(request.params.id), request.customer.id);
    if (!certificate || certificate.order_status !== 'paid') return response.status(404).json({ error: 'Paid license was not found.' });
    response.setHeader('Cache-Control', 'private, no-store');
    response.json({ certificate: mapCertificateRecord({ ...certificate, status: certificateCurrentStatus(certificate) }) });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading the license certificate failed.', error) });
  }
});

router.get('/customer/licenses/:id/certificate', requireCustomer, async (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'License ID must be a positive whole number.' });
  try {
    const ownedLicense = await queryOne(`SELECT l.id, l.revoked_at, o.status AS order_status
      FROM licenses l JOIN orders o ON o.id = l.order_id
      WHERE l.id = ? AND l.user_id = ?`, [Number(request.params.id), request.customer.id]);
    if (!ownedLicense || ownedLicense.revoked_at || ownedLicense.order_status !== 'paid') return response.status(404).json({ error: 'Paid license was not found.' });
    await ensureCertificateForLicense(database, Number(request.params.id));
    const certificate = await getCertificateByLicense(Number(request.params.id), request.customer.id);
    if (!certificate || certificate.order_status !== 'paid') return response.status(404).json({ error: 'Paid license was not found.' });
    sendCertificatePdf(response, await renderCertificatePdf(certificate));
  } catch (error) {
    response.status(500).json({ error: databaseError('Generating the license certificate failed.', error) });
  }
});

router.get('/admin/certificates', requireAdmin, async (request, response) => {
  const search = String(request.query.q || '').trim().slice(0, 100);
  const licenseType = String(request.query.licenseType || '').toLowerCase();
  const status = String(request.query.status || '').toLowerCase();
  const from = String(request.query.from || '');
  const to = String(request.query.to || '');
  if (licenseType && !LICENSE_TYPES.has(licenseType)) return response.status(400).json({ error: 'Unknown license type.' });
  if (status && !['valid', 'expired', 'revoked', 'reissued', 'suspended', 'refunded'].includes(status)) return response.status(400).json({ error: 'Unknown certificate status.' });
  if ([from, to].some(value => value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) || (from && to && from > to)) return response.status(400).json({ error: 'Choose a valid, non-reversed issue date range.' });
  const conditions = [];
  const parameters = [];
  if (search) {
    conditions.push('(c.certificate_id LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR b.title LIKE ?)');
    parameters.push(...Array(4).fill(`%${search}%`));
  }
  if (licenseType) { conditions.push('c.license_type = ?'); parameters.push(licenseType); }
  if (from) { conditions.push('DATE(c.issued_at) >= ?'); parameters.push(from); }
  if (to) { conditions.push('DATE(c.issued_at) <= ?'); parameters.push(to); }
  if (status === 'valid') conditions.push("c.status = 'valid' AND l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at > CURRENT_TIMESTAMP) AND o.status = 'paid'");
  else if (status === 'expired') conditions.push("c.status = 'valid' AND l.revoked_at IS NULL AND l.expires_at IS NOT NULL AND l.expires_at <= CURRENT_TIMESTAMP AND o.status = 'paid'");
  else if (status === 'revoked') conditions.push("(c.status = 'revoked' OR (c.status = 'valid' AND l.revoked_at IS NOT NULL AND o.status <> 'refunded'))");
  else if (status === 'refunded') conditions.push("(c.status = 'refunded' OR (c.status = 'valid' AND o.status = 'refunded'))");
  else if (status === 'suspended') conditions.push("(c.status = 'suspended' OR (c.status = 'valid' AND l.revoked_at IS NULL AND o.status NOT IN ('paid', 'refunded')))");
  else if (status) { conditions.push('c.status = ?'); parameters.push(status); }
  try {
    const certificates = await queryRows(`SELECT c.id, c.certificate_id, c.license_id, c.order_id, c.beat_id,
        c.license_type, c.license_terms_snapshot, c.terms_version, c.status, c.reissued_from_id,
        c.issued_at, c.revoked_at, c.revocation_reason, l.purchased_at, l.expires_at,
        (l.expires_at IS NULL OR l.expires_at > CURRENT_TIMESTAMP) AS license_active, l.revoked_at AS license_revoked_at,
        b.title AS beat_title, u.name AS customer_name, u.email AS customer_email,
        o.reference AS order_reference, o.status AS order_status
      FROM license_certificates c
      JOIN licenses l ON l.id = c.license_id
      JOIN beats b ON b.id = c.beat_id
      JOIN users u ON u.id = c.user_id
      JOIN orders o ON o.id = c.order_id
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY c.issued_at DESC LIMIT 200`, parameters);
    response.json({ certificates: certificates.map(item => ({
      ...item,
      status: certificateCurrentStatus(item),
      rights: parseLicenseTerms(item.license_terms_snapshot),
      verificationUrl: verificationUrlFor(item.certificate_id)
    })) });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading certificate records failed.', error) });
  }
});

router.get('/admin/certificates/:id/pdf', requireAdmin, async (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Certificate ID must be a positive whole number.' });
  try {
    const certificate = await getCertificateByRecordId(Number(request.params.id));
    if (!certificate) return response.status(404).json({ error: 'Certificate was not found.' });
    sendCertificatePdf(response, await renderCertificatePdf(certificate));
  } catch (error) {
    response.status(500).json({ error: databaseError('Generating the certificate PDF failed.', error) });
  }
});

router.get('/admin/certificates/:id', requireAdmin, async (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Certificate ID must be a positive whole number.' });
  try {
    const certificate = await getCertificateByRecordId(Number(request.params.id));
    if (!certificate) return response.status(404).json({ error: 'Certificate was not found.' });
    const history = await queryRows(`SELECT h.action, h.reason, h.details_json, h.created_at,
        u.name AS actor_name, u.email AS actor_email
      FROM license_certificate_history h
      LEFT JOIN users u ON u.id = h.actor_user_id
      WHERE h.certificate_id = ?
      ORDER BY h.created_at DESC, h.id DESC`, [certificate.id]);
    response.setHeader('Cache-Control', 'private, no-store');
    response.json({
      certificate: { ...mapCertificateRecord(certificate), status: certificateCurrentStatus(certificate) },
      history
    });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading certificate details failed.', error) });
  }
});

router.post('/admin/certificates/:id/revoke', requireAdmin, async (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Certificate ID must be a positive whole number.' });
  const reason = String(request.body?.reason || '').trim();
  if (!reason || reason.length > 500) return response.status(400).json({ error: 'Enter a revocation reason of up to 500 characters.' });
  try {
    const certificate = await database.transaction(async tx => {
      const current = await tx.get(`SELECT c.*, l.expires_at,
          (l.expires_at IS NULL OR l.expires_at > CURRENT_TIMESTAMP) AS license_active, l.revoked_at AS license_revoked_at, o.status AS order_status
        FROM license_certificates c
        JOIN licenses l ON l.id = c.license_id
        JOIN orders o ON o.id = c.order_id
        WHERE c.id = ? FOR UPDATE`, [Number(request.params.id)]);
      if (!current) return null;
      if (certificateCurrentStatus(current) !== 'valid') throw new Error('Only a currently valid certificate can be revoked.');
      await tx.run("UPDATE license_certificates SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, revocation_reason = ? WHERE id = ?", [reason, current.id]);
      await tx.run(`INSERT INTO license_certificate_history (certificate_id, action, actor_user_id, reason)
        VALUES (?, 'revoked', ?, ?)`, [current.id, request.admin.id, reason]);
      return current;
    });
    if (!certificate) return response.status(404).json({ error: 'Certificate was not found.' });
    recordAuditSafely(database, { userId: request.admin.id, action: 'license_certificate_revoked', entityType: 'license_certificate', entityId: Number(request.params.id), details: { certificateId: certificate.certificate_id, reason }, ipAddress: request.ip });
    response.json({ certificateId: certificate.certificate_id, status: 'revoked' });
  } catch (error) {
    response.status(error.message.startsWith('Only a currently valid') ? 409 : 500).json({ error: error.message.startsWith('Only a currently valid') ? error.message : databaseError('Revoking the certificate failed.', error) });
  }
});

router.post('/admin/certificates/:id/reissue', requireAdmin, async (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Certificate ID must be a positive whole number.' });
  const reason = String(request.body?.reason || '').trim();
  if (!reason || reason.length > 500) return response.status(400).json({ error: 'Enter a reissue reason of up to 500 characters.' });
  try {
    const replacement = await database.transaction(async tx => {
      const old = await tx.get('SELECT * FROM license_certificates WHERE id = ? FOR UPDATE', [Number(request.params.id)]);
      if (!old) return null;
      if (!['valid', 'revoked'].includes(old.status)) throw new Error('Only a valid or revoked certificate can be reissued.');
      if (old.status === 'valid') await tx.run("UPDATE license_certificates SET status = 'reissued' WHERE id = ?", [old.id]);
      await tx.run(`INSERT INTO license_certificate_history (certificate_id, action, actor_user_id, reason)
        VALUES (?, 'reissued', ?, ?)`, [old.id, request.admin.id, reason]);
      const next = await issueCertificateRecord(tx, old.license_id, { actorUserId: request.admin.id, reissuedFromId: old.id });
      await tx.run('UPDATE license_certificates SET pdf_storage_path = NULL WHERE id = ?', [next.id]);
      return next;
    });
    if (!replacement) return response.status(404).json({ error: 'Certificate was not found.' });
    recordAuditSafely(database, { userId: request.admin.id, action: 'license_certificate_reissued', entityType: 'license_certificate', entityId: replacement.id, details: { certificateId: replacement.certificate_id, previousCertificateRecordId: Number(request.params.id), reason }, ipAddress: request.ip });
    response.json({ id: replacement.id, certificateId: replacement.certificate_id, status: replacement.status });
  } catch (error) {
    response.status(error.message.startsWith('Only a currently valid') ? 409 : 500).json({ error: error.message.startsWith('Only a currently valid') ? error.message : databaseError('Reissuing the certificate failed.', error) });
  }
});

module.exports = router;
