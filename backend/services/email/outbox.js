const crypto = require('node:crypto');
const { sendEmail } = require('./sender');
const { TEMPLATES, renderTemplate } = require('./templates');
const logger = require('../logger');

const MAX_ATTEMPTS = 8;
const MAX_BATCH_SIZE = 10;
const POLL_INTERVAL_MS = 5000;
const LEASE_MINUTES = 10;

function isEmailAddress(value) {
  return typeof value === 'string'
    && value.length <= 320
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function logOutboxError(message, error) {
  logger.error('email_outbox_error', { operation: message, code: error?.code });
}

async function queueEmail(database, { to, template, data = {}, idempotencyKey }) {
  if (!isEmailAddress(to)) throw new Error('A valid email recipient is required.');
  if (!TEMPLATES.includes(template)) throw new Error(`Unknown email template: ${template}`);
  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim() || idempotencyKey.length > 255) {
    throw new Error('A non-empty email idempotency key of at most 255 characters is required.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Email template data must be an object.');
  renderTemplate(template, data);
  const expirySeconds = template === 'email_verification'
    ? 24 * 60 * 60
    : template === 'password_reset' ? 60 * 60 : null;

  await database.run(
    `INSERT INTO email_outbox (idempotency_key, recipient, template, data_json, expires_at)
     VALUES (?, ?, ?, ?, CASE WHEN ? IS NULL THEN NULL ELSE CURRENT_TIMESTAMP + (? * INTERVAL '1 second') END)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [idempotencyKey, to.trim().toLowerCase(), template, JSON.stringify(data), expirySeconds, expirySeconds]
  );
}

async function queueEmailSafely(database, email) {
  try {
    await queueEmail(database, email);
    return true;
  } catch (error) {
    logOutboxError('Could not queue transactional email:', error);
    return false;
  }
}

async function claimNextEmail(database) {
  return database.transaction(async tx => {
    await tx.run(
      `UPDATE email_outbox
       SET status = 'failed', data_json = NULL, locked_at = NULL, last_error = 'Email action expired.'
       WHERE status IN ('pending', 'processing') AND expires_at <= CURRENT_TIMESTAMP`
    );
    const email = await tx.get(
      `SELECT id, idempotency_key, recipient, template, data_json, attempts
       FROM email_outbox
       WHERE ((status = 'pending' AND next_attempt_at <= CURRENT_TIMESTAMP)
          OR (status = 'processing' AND locked_at < CURRENT_TIMESTAMP - (? * INTERVAL '1 minute')))
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
       ORDER BY id
       LIMIT 1
       FOR UPDATE`,
      [LEASE_MINUTES]
    );
    if (!email) return null;

    await tx.run(
      `UPDATE email_outbox
       SET status = 'processing', attempts = attempts + 1, locked_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [email.id]
    );
    return { ...email, attempts: Number(email.attempts || 0) + 1 };
  });
}

function retryDelaySeconds(attempts) {
  return Math.min(60 * 60, 30 * (2 ** Math.max(0, attempts - 1)));
}

function safeFailureMessage(error) {
  const message = String(error?.message || 'Email delivery failed.');
  const status = message.match(/HTTP (\d{3})/);
  return status ? `Email provider returned HTTP ${status[1]}.` : 'Email provider request failed.';
}

async function deliverClaimedEmail(database, email, sender = sendEmail) {
  try {
    const data = typeof email.data_json === 'string' ? JSON.parse(email.data_json) : email.data_json;
    await sender({
      to: email.recipient,
      template: email.template,
      data,
      idempotencyKey: email.idempotency_key
    });
    await database.run(
      `UPDATE email_outbox
       SET status = 'sent', sent_at = CURRENT_TIMESTAMP, locked_at = NULL, last_error = NULL, data_json = NULL
       WHERE id = ? AND status = 'processing'`,
      [email.id]
    );
    return true;
  } catch (error) {
    const attempts = Number(email.attempts || 1);
    const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
    await database.run(
      `UPDATE email_outbox
      SET status = ?, locked_at = NULL, next_attempt_at = CURRENT_TIMESTAMP + (? * INTERVAL '1 second'), last_error = ?,
          data_json = CASE WHEN ? = 'failed' THEN NULL ELSE data_json END
       WHERE id = ? AND status = 'processing'`,
      [status, retryDelaySeconds(attempts), safeFailureMessage(error), status, email.id]
    );
    return false;
  }
}

async function processEmailOutbox(database, { send = sendEmail, batchSize = MAX_BATCH_SIZE } = {}) {
  const limit = Math.max(1, Math.min(MAX_BATCH_SIZE, Number(batchSize) || MAX_BATCH_SIZE));
  let processed = 0;
  for (let index = 0; index < limit; index += 1) {
    const email = await claimNextEmail(database);
    if (!email) break;
    await deliverClaimedEmail(database, email, send);
    processed += 1;
  }
  return processed;
}

function startEmailOutbox(database, { apiKey = process.env.EMAIL_API_KEY, from = process.env.EMAIL_FROM } = {}) {
  if (!apiKey || !from) {
    logger.warn('email_outbox_idle', { reason: 'EMAIL_API_KEY and EMAIL_FROM are not configured.' });
    return null;
  }

  let running = false;
  const poll = async () => {
    if (running) return;
    running = true;
    try {
      await processEmailOutbox(database, {
        send: message => sendEmail(message, { apiKey, from })
      });
    } catch (error) {
      logOutboxError('Transactional email outbox processing failed:', error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(poll, POLL_INTERVAL_MS);
  timer.unref();
  setImmediate(poll);
  return timer;
}

function createEmailIdempotencyKey(prefix, value) {
  const digest = crypto.createHash('sha256').update(String(value)).digest('hex');
  return `${prefix}:${digest}`;
}

module.exports = {
  MAX_ATTEMPTS,
  claimNextEmail,
  createEmailIdempotencyKey,
  deliverClaimedEmail,
  isEmailAddress,
  processEmailOutbox,
  queueEmail,
  queueEmailSafely,
  retryDelaySeconds,
  safeFailureMessage,
  startEmailOutbox
};
