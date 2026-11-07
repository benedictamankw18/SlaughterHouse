require('dotenv').config();

const config = require('../config');
const database = require('../database');
const { startEmailOutbox } = require('../services/email/outbox');
const logger = require('../services/logger');

async function main() {
  await database.ready();
  const timer = startEmailOutbox(database, {
    apiKey: config.emailApiKey,
    from: config.emailFrom,
    keepAlive: true
  });
  if (!timer) {
    await database.close();
    throw new Error('EMAIL_API_KEY and EMAIL_FROM are required to run the email worker.');
  }

  const shutdown = async signal => {
    clearInterval(timer);
    logger.info('email_worker_stopping', { signal });
    await database.close();
    process.exitCode = 0;
  };
  process.once('SIGINT', () => shutdown('SIGINT').catch(error => {
    logger.error('email_worker_shutdown_failed', { code: error?.code });
    process.exitCode = 1;
  }));
  process.once('SIGTERM', () => shutdown('SIGTERM').catch(error => {
    logger.error('email_worker_shutdown_failed', { code: error?.code });
    process.exitCode = 1;
  }));
  logger.info('email_worker_started');
}

main().catch(error => {
  logger.error('email_worker_start_failed', { code: error?.code });
  database.close().catch(closeError => logger.error('email_worker_database_shutdown_failed', { code: closeError?.code }));
  process.exitCode = 1;
});
