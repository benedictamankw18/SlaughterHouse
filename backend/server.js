const express = require('express');
const cors = require('cors');
const config = require('./config');
const database = require('./database');
const { isAllowedOrigin } = require('./services/cors-origin');
const logger = require('./services/logger');
const { requestContext } = require('./middleware/request-context');
const { securityHeaders } = require('./middleware/security-headers');
const { createCsrfProtection } = require('./middleware/csrf');
const { requestValidation, sendError } = require('./middleware/validate');
const { configureRequestBodyParsing } = require('./middleware/request-body');

const app = express();

app.set('trust proxy', config.trustProxy);
app.use(requestContext);
app.use(securityHeaders);
app.use(cors({
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID', 'Retry-After'],
  maxAge: 600,
  origin(origin, callback) {
    if (origin === 'null' && config.isProduction) return callback(new Error('Origin is not allowed.'));
    if (isAllowedOrigin(origin, config.frontendOrigins, !config.isProduction)) return callback(null, true);
    return callback(new Error('Origin is not allowed.'));
  }
}));
configureRequestBodyParsing(app);
app.use(requestValidation);
app.use(createCsrfProtection({ database, config }));
app.disable('x-powered-by');

app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/public'));
app.use('/api', require('./routes/admin'));
app.use('/api', require('./routes/requests'));
app.use('/api', require('./routes/bookings'));
app.use('/api', require('./routes/payments'));
app.use('/api', require('./routes/downloads'));
app.use('/api', require('./routes/certificates'));

app.use((error, request, response, next) => {
  if (response.headersSent) return next(error);
  if (error?.message === 'Origin is not allowed.') return sendError(response, 403, 'Origin is not allowed.', { code: 'ORIGIN_NOT_ALLOWED', requestId: request.requestId });
  if (error?.type === 'entity.parse.failed') {
    logger.warn('invalid_json_request', { requestId: request.requestId, method: request.method, path: request.path });
    return sendError(response, 400, 'The JSON request body could not be parsed.', { code: 'INVALID_JSON', requestId: request.requestId });
  }
  if (error?.type === 'entity.too.large') return sendError(response, 413, 'Request payload is too large.', { code: 'PAYLOAD_TOO_LARGE', requestId: request.requestId });
  logger.error('unhandled_api_error', { requestId: request.requestId, code: error?.code, type: error?.type });
  sendError(response, 500, 'An unexpected server error occurred.', { code: 'INTERNAL_ERROR' });
});

async function startServer() {
  await database.ready();
  const server = app.listen(config.port, () => {
    logger.info('api_started', { port: config.port });
  });
  server.requestTimeout = 120000;
  server.headersTimeout = 15000;
  return server;
}

if (require.main === module) {
  startServer().catch(error => {
    logger.error('api_startup_failed', { code: error?.code });
    database.close().catch(closeError => {
      logger.error('database_shutdown_failed', { code: closeError?.code });
    });
    process.exitCode = 1;
  });
}

module.exports = { app, startServer };
