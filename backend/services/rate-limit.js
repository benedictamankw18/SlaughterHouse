const buckets = new Map();

function rateLimit({ windowMs, max, message }) {
  return (request, response, next) => {
    const key = `${request.ip}:${request.baseUrl}${request.path}`;
    const now = Date.now();
    const current = buckets.get(key);
    if (!current || now - current.startedAt >= windowMs) {
      buckets.set(key, { startedAt: now, count: 1 });
      response.setHeader('RateLimit-Limit', max);
      response.setHeader('RateLimit-Remaining', Math.max(0, max - 1));
      return next();
    }
    current.count += 1;
    response.setHeader('RateLimit-Limit', max);
    response.setHeader('RateLimit-Remaining', Math.max(0, max - current.count));
    if (current.count > max) {
      response.setHeader('Retry-After', Math.ceil((windowMs - (now - current.startedAt)) / 1000));
      return response.status(429).json({ error: message });
    }
    next();
  };
}

setInterval(() => {
  const expiry = Date.now() - 60 * 60 * 1000;
  for (const [key, bucket] of buckets) {
    if (bucket.startedAt < expiry) buckets.delete(key);
  }
}, 15 * 60 * 1000).unref();

module.exports = { rateLimit };
