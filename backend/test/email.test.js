const test = require('node:test');
const assert = require('node:assert/strict');
const { sendEmail, RESEND_URL } = require('../services/email/sender');
const {
  createEmailIdempotencyKey,
  deliverClaimedEmail,
  queueEmail,
  retryDelaySeconds,
  safeFailureMessage
} = require('../services/email/outbox');
const { renderTemplate } = require('../services/email/templates');

test('email templates escape content and reject non-HTTP action links', () => {
  const email = renderTemplate('email_verification', {
    name: '<img src=x>',
    verifyUrl: 'https://store.example/verify?token=abc'
  });
  assert.match(email.html, /&lt;img src=x&gt;/);
  assert.match(email.html, /href="https:\/\/store\.example\/verify\?token=abc"/);
  assert.throws(
    () => renderTemplate('password_reset', { resetUrl: 'javascript:alert(1)' }),
    /must use HTTP or HTTPS/
  );
  assert.equal(renderTemplate('order_receipt', { reference: 'order\r\nInjected: true' }).subject.includes('\r'), false);
});

test('welcome and license-issued templates render useful account messages safely', () => {
  const welcome = renderTemplate('welcome', {
    name: '<Artist>',
    accountUrl: 'https://store.example/account'
  });
  assert.match(welcome.subject, /Welcome to UltBigBoy/);
  assert.match(welcome.html, /&lt;Artist&gt;/);
  assert.match(welcome.html, /href="https:\/\/store\.example\/account"/);

  const license = renderTemplate('license_issued', {
    name: 'Artist',
    licenses: [
      { name: '<Beat One>', license: 'premium' },
      { name: 'Beat Two', license: 'basic' }
    ],
    accountUrl: 'https://store.example/account'
  });
  assert.match(license.subject, /licenses are ready/);
  assert.match(license.html, /&lt;Beat One&gt;/);
  assert.match(license.html, /Beat Two.*basic license/);
  assert.match(license.text, /<Beat One> - premium license/);
});

test('booking confirmation template includes the paid booking and selected sessions', () => {
  const confirmation = renderTemplate('booking_confirmation', {
    name: '<Customer>',
    reference: 'UBB-BOOKING-1',
    service: 'Studio session',
    feeGhs: 700,
    currency: 'GHS',
    slots: [{ date: '2026-11-18', time: '14:00' }],
    bookingUrl: 'https://store.example/account'
  });
  assert.match(confirmation.subject, /booking confirmed/i);
  assert.match(confirmation.html, /&lt;Customer&gt;/);
  assert.match(confirmation.html, /UBB-BOOKING-1/);
  assert.match(confirmation.html, /2026-11-18 at 14:00/);
  assert.match(confirmation.text, /GHS 700\.00/);
});

test('Resend sender posts rendered content and does not expose credentials in provider errors', async () => {
  let request;
  await sendEmail({
    to: 'customer@example.com',
    template: 'password_reset',
    data: { resetUrl: 'https://store.example/reset' },
    idempotencyKey: 'order-receipt:123'
  }, {
    apiKey: 'secret-api-key',
    from: 'UltBigBoy <mail@example.com>',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200 };
    }
  });
  assert.equal(request.url, RESEND_URL);
  assert.equal(request.options.headers.Authorization, 'Bearer secret-api-key');
  assert.equal(request.options.headers['Idempotency-Key'], 'order-receipt:123');
  assert.deepEqual(JSON.parse(request.options.body).to, ['customer@example.com']);

  await assert.rejects(
    sendEmail({
      to: 'customer@example.com',
      template: 'password_reset',
      data: { resetUrl: 'https://store.example/reset' }
    }, {
      apiKey: 'secret-api-key',
      from: 'UltBigBoy <mail@example.com>',
      fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'secret-api-key' })
    }),
    error => error.message === 'Email provider returned HTTP 401.' && !error.message.includes('secret-api-key')
  );
  await assert.rejects(
    sendEmail({ to: 'customer@example.com', template: 'admin_alert' }, {
      apiKey: 'secret-api-key',
      from: 'UltBigBoy <mail@example.com>',
      fetchImpl: async () => { throw new Error('request included secret-api-key'); }
    }),
    error => error.message === 'Email provider request failed.' && !error.message.includes('secret-api-key')
  );
});

test('outbox inserts use unique idempotency keys and validate rendered templates', async () => {
  const calls = [];
  const database = {
    async run(query, parameters) {
      calls.push({ query, parameters });
    }
  };
  await queueEmail(database, {
    to: 'Customer@Example.com',
    template: 'email_verification',
    idempotencyKey: createEmailIdempotencyKey('verify', 'raw-token'),
    data: { verifyUrl: 'https://store.example/verify' }
  });
  assert.match(calls[0].query, /ON DUPLICATE KEY UPDATE idempotency_key/);
  assert.equal(calls[0].parameters[1], 'customer@example.com');
  assert.match(calls[0].parameters[0], /^verify:[a-f0-9]{64}$/);
  assert.doesNotMatch(calls[0].parameters[0], /raw-token/);
  assert.equal(calls[0].parameters[4], 24 * 60 * 60, 'verification links expire from the outbox');
  assert.equal(calls[0].parameters[5], 24 * 60 * 60);
  await assert.rejects(
    queueEmail(database, {
      to: 'customer@example.com',
      template: 'password_reset',
      idempotencyKey: 'unsafe-link',
      data: { resetUrl: 'javascript:alert(1)' }
    }),
    /must use HTTP or HTTPS/
  );
  assert.equal(calls.length, 1, 'invalid messages must not enter the outbox');
});

test('successful deliveries clear sensitive payloads and failures remain retryable', async () => {
  const calls = [];
  const database = {
    async run(query, parameters) {
      calls.push({ query, parameters });
    }
  };
  const email = { id: 3, idempotency_key: 'admin-alert:3', recipient: 'customer@example.com', template: 'admin_alert', data_json: '{"message":"Hello"}', attempts: 1 };
  let sendPayload;
  const delivered = await deliverClaimedEmail(database, email, async payload => {
    sendPayload = payload;
    return true;
  });
  assert.equal(delivered, true);
  assert.equal(sendPayload.idempotencyKey, email.idempotency_key);
  assert.match(calls[0].query, /status = 'sent'.*data_json = NULL/s);

  calls.length = 0;
  const failed = await deliverClaimedEmail(database, email, async () => { throw new Error('HTTP 503 secret-api-key'); });
  assert.equal(failed, false);
  assert.match(calls[0].query, /status = \?/);
  assert.equal(calls[0].parameters[0], 'pending');
  assert.equal(calls[0].parameters[2], 'Email provider returned HTTP 503.');
  assert.doesNotMatch(calls[0].parameters[2], /secret-api-key/);
  assert.equal(retryDelaySeconds(1), 30);
  assert.equal(retryDelaySeconds(8), 3600);
  assert.equal(safeFailureMessage(new Error('secret-api-key')), 'Email provider request failed.');
});
