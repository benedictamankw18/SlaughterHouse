const fs = require('node:fs/promises');
const path = require('node:path');
const logger = require('../services/logger');
const {
  assertDatabaseEmpty,
  clientArgs,
  getDatabaseConfig,
  runClient,
  validateDatabaseName
} = require('./postgres-tools');

async function restore() {
  const backupPath = path.resolve(process.argv[2] || '');
  const databaseIndex = process.argv.indexOf('--database');
  const confirmIndex = process.argv.indexOf('--confirm-database');
  const config = getDatabaseConfig();
  const targetDatabase = validateDatabaseName(databaseIndex >= 0 ? process.argv[databaseIndex + 1] : config.database);
  const confirmedDatabase = process.argv[confirmIndex + 1];

  if (!process.argv[2] || !await fs.stat(backupPath).then(stat => stat.isFile()).catch(() => false)) {
    throw new Error('Usage: node scripts/restore.js <backup.dump> --confirm-database <target-database> [--database <target-database>]');
  }
  if (confirmedDatabase !== targetDatabase) {
    throw new Error('Restore requires --confirm-database to exactly match the target database name.');
  }
  await assertDatabaseEmpty(config, targetDatabase);
  await runClient('pg_restore', [
    '--exit-on-error',
    '--no-owner',
    '--no-acl',
    ...clientArgs(config, targetDatabase),
    '-'
  ], config, { inputPath: backupPath });
  logger.info('database_backup_restored', { database: targetDatabase, file: backupPath });
}

restore().catch(error => {
  process.stderr.write(`Restore failed: ${error.message}\n`);
  process.exitCode = 1;
});
