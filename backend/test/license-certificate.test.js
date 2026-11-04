const test = require('node:test');
const assert = require('node:assert/strict');
const { createLicenseCertificatePdf } = require('../services/license-certificate');

test('license certificate PDF includes the customer, beat, license, order, and purchase details', () => {
  const pdf = createLicenseCertificatePdf({
    licenseId: 2,
    customerName: 'Benedict Amankwa',
    customerEmail: 'benedict@example.com',
    beatTitle: 'Night Drive',
    licenseType: 'Premium',
    orderReference: 'ORDER-123',
    purchasedAt: '2026-11-04',
    rights: { formats: ['mp3'] }
  }).toString('ascii');

  for (const detail of [
    'Certificate ID: 2',
    'Customer: Benedict Amankwa',
    'Email: benedict@example.com',
    'Beat: Night Drive',
    'License: Premium',
    'Order: ORDER-123',
    'Purchased: 2026-11-04'
  ]) {
    assert.ok(pdf.includes(detail), `certificate should include "${detail}"`);
  }
  assert.doesNotMatch(pdf, /undefined/);
});
