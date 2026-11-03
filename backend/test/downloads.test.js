process.env.DOWNLOAD_SIGNING_SECRET = 'test-download-signing-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DOWNLOADABLE_ORDER_STATUSES, isDownloadableOrderStatus, createDownloadToken, verifyDownloadToken, getDownloadItems } = require('../services/downloads');

const reference = 'UBB-123-abc';
const productId = 42;

test('partial refunds keep downloads available while full refunds do not', () => {
  assert.deepEqual([...DOWNLOADABLE_ORDER_STATUSES], ['paid', 'partially_refunded']);
  assert.equal(isDownloadableOrderStatus('paid'), true);
  assert.equal(isDownloadableOrderStatus('PARTIALLY_REFUNDED'), true);
  assert.equal(isDownloadableOrderStatus('refunded'), false);
  assert.equal(isDownloadableOrderStatus('pending'), false);
  assert.equal(isDownloadableOrderStatus(undefined), false);
});

test('a freshly created download token verifies for its own parameters', () => {
  const token = createDownloadToken(reference, productId, 'premium', 'wav');
  assert.equal(verifyDownloadToken(token, reference, productId, 'premium', 'wav'), true);
});

test('a token cannot be reused for a different order, product, license, or format', () => {
  const token = createDownloadToken(reference, productId, 'premium', 'wav');
  assert.equal(verifyDownloadToken(token, 'UBB-other', productId, 'premium', 'wav'), false);
  assert.equal(verifyDownloadToken(token, reference, productId + 1, 'premium', 'wav'), false);
  assert.equal(verifyDownloadToken(token, reference, productId, 'basic', 'wav'), false);
  assert.equal(verifyDownloadToken(token, reference, productId, 'premium', 'mp3'), false);
});

test('expired and tampered tokens are rejected', () => {
  const expired = createDownloadToken(reference, productId, 'basic', 'mp3', Date.now() - 1000);
  assert.equal(verifyDownloadToken(expired, reference, productId, 'basic', 'mp3'), false);

  const token = createDownloadToken(reference, productId, 'basic', 'mp3');
  const [payload, signature] = token.split('.');
  const tamperedSignature = `${signature.slice(0, -1)}${signature.endsWith('0') ? '1' : '0'}`;
  assert.equal(verifyDownloadToken(`${payload}.${tamperedSignature}`, reference, productId, 'basic', 'mp3'), false);
  assert.equal(verifyDownloadToken('not-a-token', reference, productId, 'basic', 'mp3'), false);
});

test('getDownloadItems follows configured rights instead of hardcoded licence rules', () => {
  const order = {
    reference,
    items_json: JSON.stringify([
      { type: 'beat', productId, name: 'Beat A', license: 'basic' },
      { type: 'beat', productId: 43, name: 'Beat B', license: 'premium' }
    ])
  };
  const rights = {
    basic: { formats: ['mp3', 'wav', 'stems'], commercialUse: true, distribution: true },
    premium: { formats: ['mp3'], commercialUse: false, distribution: false }
  };
  const items = getDownloadItems(order, 'http://localhost:3000', rights);
  assert.deepEqual(items[0].files.map(file => file.format), ['MP3', 'WAV', 'STEMS']);
  assert.deepEqual(items[1].files.map(file => file.format), ['MP3']);
  assert.match(items[0].files[1].url, /format=wav/);
});

test('getDownloadItems only offers formats allowed by the purchased license', () => {
  const order = {
    reference,
    items_json: JSON.stringify([
      { type: 'beat', productId, name: 'Beat A', license: 'basic' },
      { type: 'beat', productId: 43, name: 'Beat B', license: 'premium' },
      { type: 'beat', productId: 44, name: 'Beat C', license: 'unlimited' },
      { type: 'booking', name: 'Mixtape' }
    ])
  };
  const items = getDownloadItems(order, 'http://localhost:3000');
  assert.equal(items.length, 3, 'booking items are not downloadable');

  const formats = items.map(item => item.files.map(file => file.format));
  assert.deepEqual(formats[0], ['MP3']);
  assert.deepEqual(formats[1], ['MP3', 'WAV']);
  assert.deepEqual(formats[2], ['MP3', 'WAV', 'STEMS']);

  for (const item of items) {
    for (const file of item.files) {
      assert.match(file.url, /^http:\/\/localhost:3000\/api\/orders\/UBB-123-abc\/downloads\/\d+\?/);
      assert.match(file.url, /token=/);
    }
  }
});
