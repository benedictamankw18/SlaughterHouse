const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CERTIFICATE_SIGNING_SECRET = 'test-certificate-signing-secret-that-is-stable';

const { DEFAULT_LICENSE_RIGHTS, validateRightsDefinition } = require('../services/license-rights');
const {
  certificateToken,
  certificateTokenHash,
  ensureCertificateForLicense,
  parseLicenseTerms,
  safeCustomerDisplayName,
  tokenMatchesHash
} = require('../services/license-certificates');
const { createLicenseCertificatePdf, getRightsRows } = require('../services/license-certificate');

test('purchase-time license rights are validated without consulting current definitions', () => {
  const savedRights = {
    formats: ['mp3', 'wav'],
    commercialUse: true,
    distribution: false,
    stems: false,
    usageLimits: { streams: 100000, copies: null },
    distributionRules: ['No paid advertising.']
  };
  assert.deepEqual(parseLicenseTerms(JSON.stringify(savedRights)), savedRights);
  assert.match(validateRightsDefinition(savedRights).error, /Unknown license-rights field: stems/);
  assert.throws(() => parseLicenseTerms('{"formats":[],"commercialUse":true}'), /saved license terms are missing or invalid/);
});

test('license certificate rights display includes usage limits and restrictions', () => {
  const rows = getRightsRows({
    ...DEFAULT_LICENSE_RIGHTS.exclusive,
    usageLimits: { streams: null },
    distributionRules: ['Credit the producer.']
  });
  assert.ok(rows.some(([label, value]) => label === 'RESALE' && /prohibited/.test(value)));
  assert.ok(rows.some(([label, value]) => label === 'STREAMS LIMIT' && /Unlimited/.test(value)));
  assert.ok(rows.some(([label, value]) => label === 'DISTRIBUTION CONDITION' && value === 'Credit the producer.'));
});

test('certificate verification tokens are stable and stored only as hashes', () => {
  const token = certificateToken('UBB-CERT-2026-0123456789ABCDEF');
  const storedHash = certificateTokenHash(token);
  assert.equal(certificateToken('UBB-CERT-2026-0123456789ABCDEF'), token);
  assert.notEqual(storedHash, token);
  assert.equal(tokenMatchesHash(token, storedHash), true);
  assert.equal(tokenMatchesHash('invalid', storedHash), false);
  assert.equal(safeCustomerDisplayName('Benedict Amankwa'), 'Benedict A.');
  assert.equal(safeCustomerDisplayName('Madonna'), 'Madonna');
  assert.equal(safeCustomerDisplayName(''), 'Verified licensee');
});

test('legacy certificate issuance returns the latest record regardless of status', async () => {
  const existing = { id: 8, certificate_id: 'UBB-CERT-2026-EXISTING', status: 'revoked' };
  const statements = [];
  const db = {
    get(query, parameters, callback) {
      statements.push(query);
      if (query.includes('FROM licenses l')) {
        return callback(null, {
          license_id: parameters[0],
          user_id: 3,
          beat_id: 6,
          order_id: 9,
          license_type: 'basic',
          rights_json: JSON.stringify(DEFAULT_LICENSE_RIGHTS.basic),
          purchased_at: '2026-11-04',
          order_status: 'paid'
        });
      }
      if (query.includes('FROM license_certificates')) return callback(null, existing);
      throw new Error(`Unexpected query: ${query}`);
    },
    run() {
      throw new Error('An existing certificate must not be reissued automatically.');
    },
    transaction(callback) {
      return callback(this);
    }
  };

  const result = await ensureCertificateForLicense(db, 4);
  assert.equal(result, existing);
  assert.match(statements[1], /WHERE license_id = \?/);
  assert.doesNotMatch(statements[1], /status = 'valid'/);
});

test('certificate PDF is a printable landscape PDF with a verification code', async () => {
  const pdf = await createLicenseCertificatePdf({
    license: {
      user_id: 3,
      customer_name: 'Benedict Amankwa',
      customer_email: 'benedict@example.com',
      beat_id: 6,
      beat_title: 'Night Drive',
      license_type: 'premium',
      order_reference: 'ORDER-123',
      purchased_at: '2026-11-04',
      rights: DEFAULT_LICENSE_RIGHTS.premium,
      terms_url: 'https://example.test/license-terms.html'
    },
    certificate: {
      certificate_id: 'UBB-CERT-2026-0123456789ABCDEF',
      terms_version: 'UBB-MUSIC-LICENSE-2026-11-V1',
      issued_at: '2026-11-04',
      status: 'valid'
    },
    verificationUrl: 'https://example.test/verify-certificate.html?token=0123456789abcdef'
  });

  const source = pdf.toString('latin1');
  assert.ok(source.startsWith('%PDF-'));
  assert.ok(source.endsWith('%%EOF\n'));
  assert.match(source, /\/MediaBox \[0 0 841\.89 595\.28\]/);
  assert.match(source, /\/Count 1/);
  assert.doesNotMatch(source, /undefined/);
});
