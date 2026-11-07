const database = require('./database');
const { app } = require('./server');
const logger = require('./services/logger');

module.exports = async function serverlessHandler(request, response) {
  try {
    await database.ready();
    return app(request, response);
  } catch (error) {
    logger.error('serverless_api_initialization_failed', { code: error?.code });
    response.statusCode = 503;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ error: 'The API is temporarily unavailable.' }));
  }
};
