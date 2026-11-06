const logger = require('./logger');

function recordAudit(database, { userId = null, action, entityType = null, entityId = null, details = null, ipAddress = null }) {
  return new Promise((resolve, reject) => {
    database.run(
      'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details_json, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, action, entityType, entityId, details ? JSON.stringify(details) : null, ipAddress],
      error => error ? reject(error) : resolve()
    );
  });
}

function recordAuditSafely(database, entry) {
  return recordAudit(database, entry).catch(error => {
    logger.error('audit_log_write_failed', { code: error.code });
  });
}

module.exports = { recordAuditSafely };
