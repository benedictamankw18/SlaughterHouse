const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const logger = require('../services/logger');
const { clientArgs, getDatabaseConfig, getTableCounts, runClient } = require('./mysql-tools');

async function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest('hex');
}

async function backup() {
  const config = getDatabaseConfig();
  const connectionArgs = clientArgs(config);
  const outputDirectory = path.resolve(process.argv[2] || path.join(__dirname, '..', 'data', 'backups'));
  await fs.promises.mkdir(outputDirectory, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[-:]/g, '');
  const filePath = path.join(outputDirectory, `${config.database}-${timestamp}-${crypto.randomBytes(4).toString('hex')}.sql`);
  const manifestPath = `${filePath}.manifest.json`;
  const args = [
    '--single-transaction',
    '--quick',
    '--hex-blob',
    '--routines',
    '--events',
    '--triggers',
    ...connectionArgs
  ];

  try {
    await runClient('mysqldump', args, config, { outputPath: filePath });
    const tableCounts = await getTableCounts(config);
    const manifest = {
      createdAt: new Date().toISOString(),
      database: config.database,
      file: path.basename(filePath),
      bytes: (await fs.promises.stat(filePath)).size,
      sha256: await hashFile(filePath),
      tables: tableCounts
    };
    await fs.promises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    logger.info('database_backup_created', {
      database: config.database,
      file: filePath,
      tables: Object.keys(tableCounts).length,
      bytes: manifest.bytes
    });
  } catch (error) {
    await fs.promises.rm(filePath, { force: true });
    await fs.promises.rm(manifestPath, { force: true });
    logger.error('database_backup_failed', { database: config.database, code: error.code });
    throw error;
  }
}

backup().catch(error => {
  process.stderr.write(`Backup failed: ${error.message}\n`);
  process.exitCode = 1;
});
