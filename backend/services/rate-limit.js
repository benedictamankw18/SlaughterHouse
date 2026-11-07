const crypto = require('node:crypto');
const database = require('../database');
const logger = require('./logger');

let requestsSinceCleanup = 0;

function rateLimit({ windowMs, max, message }) {
  return (request, response, next) => {
    const routePath = request.route?.path || request.path || '';
    const identity = `${request.ip || 'unknown'}:${request.baseUrl || ''}${routePath}`;
    const bucketKey = crypto.createHash('sha256').update(identity).digest('hex');
    database.get(
      `INSERT INTO rate_limit_buckets (bucket_key, window_started_at, request_count, expires_at)
       VALUES (?, CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP + (? * INTERVAL '1 millisecond'))
       ON CONFLICT (bucket_key) DO UPDATE SET
         request_count = CASE
           WHEN rate_limit_buckets.window_started_at <= CURRENT_TIMESTAMP - (? * INTERVAL '1 millisecond') THEN 1
           ELSE rate_limit_buckets.request_count + 1
         END,
         window_started_at = CASE
           WHEN rate_limit_buckets.window_started_at <= CURRENT_TIMESTAMP - (? * INTERVAL '1 millisecond') THEN CURRENT_TIMESTAMP
           ELSE rate_limit_buckets.window_started_at
         END,
         expires_at = CURRENT_TIMESTAMP + (? * INTERVAL '2 milliseconds')
       RETURNING request_count,
         GREATEST(0, CEIL(EXTRACT(EPOCH FROM (
           window_started_at + (? * INTERVAL '1 millisecond') - CURRENT_TIMESTAMP
         ))))::INTEGER AS retry_after_seconds`,
      [bucketKey, windowMs * 2, windowMs, windowMs, windowMs, windowMs],
      (error, bucket) => {
        if (error || !bucket) {
          logger.error('rate_limit_storage_failed', { code: error?.code });
          return response.status(503).json({ error: 'Request protection is temporarily unavailable.' });
        }

        const remaining = Math.max(0, max - Number(bucket.request_count));
        response.setHeader('RateLimit-Limit', max);
        response.setHeader('RateLimit-Remaining', remaining);
        if (Number(bucket.request_count) > max) {
          response.setHeader('Retry-After', Math.max(1, Number(bucket.retry_after_seconds) || 1));
          return response.status(429).json({ error: message });
        }

        requestsSinceCleanup += 1;
        if (requestsSinceCleanup >= 100) {
          requestsSinceCleanup = 0;
          database.run(
            `WITH expired AS (
               SELECT bucket_key FROM rate_limit_buckets
               WHERE expires_at < CURRENT_TIMESTAMP
               LIMIT 1000
             )
             DELETE FROM rate_limit_buckets
             WHERE bucket_key IN (SELECT bucket_key FROM expired)`,
            cleanupError => {
              if (cleanupError) logger.error('rate_limit_cleanup_failed', { code: cleanupError.code });
            }
          );
        }
        next();
      }
    );
  };
}

module.exports = { rateLimit };
