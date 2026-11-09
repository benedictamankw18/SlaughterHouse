const logger = require('./logger');
const { isEmailAddress, queueEmailSafely } = require('./email/outbox');

const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

function loadAdminRecipients(database) {
  return new Promise(resolve => {
    let completed = false;
    const finish = (error, rows) => {
      if (completed) return;
      completed = true;
      if (error) {
        logger.error('admin_email_recipients_load_failed', { code: error.code });
        resolve([]);
        return;
      }
      resolve(rows || []);
    };
    try {
      const pending = database.all(
        "SELECT id, email FROM users WHERE role IN ('admin', 'super_admin') ORDER BY id",
        [],
        (error, rows) => finish(error, rows)
      );
      if (pending && typeof pending.then === 'function') {
        pending.then(rows => finish(null, rows), error => finish(error));
      }
    } catch (error) {
      finish(error);
    }
  });
}

// Queues one administrator-alert email per administrator. Failures never throw
// so request and booking flows keep working when email delivery is degraded.
async function queueAdminAlertEmailsSafely(database, { title, message, reference = null, idempotencyPrefix, data = {} } = {}) {
  if (!title || !message || !idempotencyPrefix) return 0;
  try {
    const admins = await loadAdminRecipients(database);
    let queued = 0;
    for (const admin of admins) {
      if (!isEmailAddress(admin?.email)) continue;
      const idempotencyKey = `${idempotencyPrefix}:${admin.id}`.slice(0, MAX_IDEMPOTENCY_KEY_LENGTH);
      const ok = await queueEmailSafely(database, {
        to: admin.email,
        template: 'admin_alert',
        idempotencyKey,
        data: { title, message, reference, ...data }
      });
      if (ok) queued += 1;
    }
    return queued;
  } catch (error) {
    logger.error('admin_alert_email_queue_failed', { code: error?.code });
    return 0;
  }
}

module.exports = { queueAdminAlertEmailsSafely };
