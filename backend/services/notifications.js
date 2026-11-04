function createNotificationSafely(database, { userId, type, title, message, dedupeKey = null }) {
  if (!userId || !type || !title || !message) return Promise.resolve(false);
  return new Promise(resolve => {
    const query = dedupeKey
      ? `INSERT INTO notifications (user_id, type, title, message, dedupe_key)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE dedupe_key = VALUES(dedupe_key)`
      : `INSERT INTO notifications (user_id, type, title, message)
         SELECT ?, ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM notifications
           WHERE user_id = ? AND type = ? AND title = ? AND message = ?
         )`;
    const parameters = dedupeKey
      ? [userId, type, title, message, dedupeKey]
      : [userId, type, title, message, userId, type, title, message];
    database.run(
      query,
      parameters,
      error => {
        if (error) console.error('Notification creation failed:', error.code || error.message);
        resolve(!error);
      }
    );
  });
}

function notifyAdminsSafely(database, { type, title, message, dedupeKey }) {
  if (!type || !title || !message || !dedupeKey) return Promise.resolve(false);
  return new Promise(resolve => {
    database.run(
      `INSERT INTO notifications (user_id, type, title, message, dedupe_key)
       SELECT id, ?, ?, ?, CONCAT(?, ':', id)
       FROM users WHERE role IN ('admin', 'super_admin')
       ON DUPLICATE KEY UPDATE dedupe_key = VALUES(dedupe_key)`,
      [type, title, message, dedupeKey],
      error => {
        if (error) console.error('Administrator notification creation failed:', error.code || error.message);
        resolve(!error);
      }
    );
  });
}

module.exports = { createNotificationSafely, notifyAdminsSafely };
