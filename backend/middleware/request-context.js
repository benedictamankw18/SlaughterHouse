const crypto = require('node:crypto');
const logger = require('../services/logger');
const monitoring = require('../services/monitoring');

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

function requestContext(request, response, next) {
  const suppliedId = request.get('X-Request-ID');
  request.requestId = suppliedId && SAFE_REQUEST_ID.test(suppliedId)
    ? suppliedId
    : crypto.randomUUID();
  response.setHeader('X-Request-ID', request.requestId);
  const startedAt = process.hrtime.bigint();
  monitoring.increment('requests');
  response.once('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const status = response.statusCode;
    const pathname = request.path;

    if (status === 401) monitoring.increment('unauthorizedResponses');
    if (status === 403) monitoring.increment('forbiddenResponses');
    if (status >= 500) monitoring.increment('serverErrors');
    if (status >= 400 && (/\/payments(?:\/|$)/.test(pathname) || /\/bookings\/initialize-payment$/.test(pathname))) {
      monitoring.increment('paymentFailures');
    }
    const log = status >= 500 ? logger.error : status >= 400 ? logger.warn : logger.info;
    log('http_request', {
      requestId: request.requestId,
      method: request.method,
      path: pathname,
      status,
      durationMs: Math.round(durationMs * 100) / 100
    });
  });
  next();
}

module.exports = { requestContext, SAFE_REQUEST_ID };
