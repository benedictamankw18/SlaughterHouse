const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadRateLimiter(database) {
  const modulePath = require.resolve('../services/rate-limit');
  const originalModule = require.cache[modulePath];
  const originals = new Map([
    [require.resolve('../database'), require.cache[require.resolve('../database')]],
    [require.resolve('../services/logger'), require.cache[require.resolve('../services/logger')]]
  ]);
  delete require.cache[modulePath];

  for (const [dependency, exports] of [
    ['../database', database],
    ['../services/logger', { error() {} }]
  ]) {
    const id = require.resolve(dependency);
    const mockModule = new Module(id);
    mockModule.filename = id;
    mockModule.loaded = true;
    mockModule.exports = exports;
    require.cache[id] = mockModule;
  }

  try {
    return {
      rateLimit: require('../services/rate-limit').rateLimit,
      restore() {
        delete require.cache[modulePath];
        if (originalModule) require.cache[modulePath] = originalModule;
        for (const [id, original] of originals) {
          if (original) require.cache[id] = original;
          else delete require.cache[id];
        }
      }
    };
  } catch (error) {
    for (const [id, original] of originals) {
      if (original) require.cache[id] = original;
      else delete require.cache[id];
    }
    throw error;
  }
}

function invoke(middleware) {
  return new Promise(resolve => {
    const headers = {};
    const response = {
      setHeader(name, value) { headers[name] = value; },
      status(statusCode) {
        this.statusCode = statusCode;
        return this;
      },
      json(body) {
        resolve({ status: this.statusCode || 200, body, headers });
      }
    };
    middleware(
      { ip: '192.0.2.4', baseUrl: '/api', path: '/auth/login' },
      response,
      () => resolve({ status: 200, headers })
    );
  });
}

test('rate limits are shared through database-backed counters', async () => {
  const buckets = new Map();
  const database = {
    get(query, parameters, callback) {
      const [key, , windowMs] = parameters;
      const now = Date.now();
      const bucket = buckets.get(key);
      if (!bucket || now - bucket.startedAt >= windowMs) {
        buckets.set(key, { startedAt: now, count: 1 });
      } else {
        bucket.count += 1;
      }
      const current = buckets.get(key);
      callback(null, {
        request_count: current.count,
        retry_after_seconds: Math.ceil((windowMs - (now - current.startedAt)) / 1000)
      });
    }
  };
  const loaded = loadRateLimiter(database);
  try {
    const firstInstance = loaded.rateLimit({ windowMs: 60_000, max: 1, message: 'Too many requests.' });
    const secondInstance = loaded.rateLimit({ windowMs: 60_000, max: 1, message: 'Too many requests.' });
    assert.equal((await invoke(firstInstance)).status, 200);
    const limited = await invoke(secondInstance);
    assert.equal(limited.status, 429);
    assert.equal(limited.body.error, 'Too many requests.');
    assert.ok(limited.headers['Retry-After'] > 0);
  } finally {
    loaded.restore();
  }
});

test('rate limiter fails closed if shared storage is unavailable', async () => {
  const loaded = loadRateLimiter({
    get(query, parameters, callback) {
      callback(Object.assign(new Error('database unavailable'), { code: 'ECONNREFUSED' }));
    }
  });
  try {
    const response = await invoke(loaded.rateLimit({ windowMs: 60_000, max: 5, message: 'Too many requests.' }));
    assert.equal(response.status, 503);
    assert.equal(response.body.error, 'Request protection is temporarily unavailable.');
  } finally {
    loaded.restore();
  }
});
