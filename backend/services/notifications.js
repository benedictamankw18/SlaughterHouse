function createNotificationSafely(database, { userId, type, title, message }) {
  if (!userId || !type || !title || !message) return Promise.resolve(false);
  return new Promise(resolve => {
    database.run(
      `INSERT INTO notifications (user_id, type, title, message)
       SELECT ?, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM notifications
         WHERE user_id = ? AND type = ? AND title = ? AND message = ?
       )`,
      [userId, type, title, message, userId, type, title, message],
      error => {
        if (error) console.error('Notification creation failed:', error.code || error.message);
        resolve(!error);
      }
    );
  });
}

module.exports = { createNotificationSafely };
