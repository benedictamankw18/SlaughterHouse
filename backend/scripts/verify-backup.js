const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const logger = require('../services/logger');
const fsPromises = fs.promises;
const {
  assertDatabaseEmpty,
  clientArgs,
  getDatabaseConfig,
  getTableCounts,
  runClient,
  validateDatabaseName
} = require('./mysql-tools');

async function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest('hex');
}

async function verify() {
  const backupPath = path.resolve(process.argv[2] || '');
  const databaseIndex = process.argv.indexOf('--database');
  const scratchDatabase = validateDatabaseName(databaseIndex >= 0 ? process.argv[databaseIndex + 1] : '');
  if (!process.argv[2] || !fs.existsSync(backupPath)) {
    throw new Error('Usage: node scripts/verify-backup.js <backup.sql> --database <empty-scratch-database>');
  }
  const manifestPath = `${backupPath}.manifest.json`;
  const manifest = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8'));
  const config = getDatabaseConfig();
  if (scratchDatabase === config.database) {
    throw new Error('The scratch database must differ from the configured source database.');
  }
  const checksum = await hashFile(backupPath);
  if (checksum !== manifest.sha256) throw new Error('Backup checksum does not match its manifest.');

  await assertDatabaseEmpty(config, scratchDatabase);
  await runClient('mysql', clientArgs(config, scratchDatabase), config, { inputPath: backupPath });
  const actualCounts = await getTableCounts(config, scratchDatabase);
  const expectedNames = Object.keys(manifest.tables).sort();
  const actualNames = Object.keys(actualCounts).sort();
  const mismatches = expectedNames.filter(name => actualCounts[name] !== manifest.tables[name]);
  if (JSON.stringify(expectedNames) !== JSON.stringify(actualNames) || mismatches.length) {
    throw new Error(`Restored table counts do not match the manifest${mismatches.length ? ` for: ${mismatches.join(', ')}` : ''}.`);
  }
  logger.info('database_backup_verified', {
    sourceDatabase: manifest.database,
    scratchDatabase,
    tables: expectedNames.length
  });
}

verify().catch(error => {
  process.stderr.write(`Backup verification failed: ${error.message}\n`);
  process.exitCode = 1;
});
