require('dotenv').config();

const config = require('../config');
const { createS3Storage } = require('../services/storage/s3');
const { migrateLocalMedia } = require('../services/storage/migrate-local-media');
const logger = require('../services/logger');

async function main() {
  if (config.storageDriver !== 's3') {
    throw new Error('Set STORAGE_DRIVER=s3 and configure the destination bucket before migrating local media.');
  }

  const targetStorage = createS3Storage({
    bucket: config.s3.bucket,
    region: config.s3.region,
    endpoint: config.s3.endpoint,
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
    forcePathStyle: config.s3.forcePathStyle,
    publicMediaBaseUrl: config.s3.publicMediaBaseUrl,
    keyPrefix: config.s3.keyPrefix,
    apiPublicUrl: config.apiPublicUrl
  });
  const summary = await migrateLocalMedia({
    directories: {
      uploads: config.uploadDirectory,
      certificates: config.certificateDirectory
    },
    targetStorage
  });
  logger.info('local_media_migration_complete', summary);
}

main().catch(error => {
  logger.error('local_media_migration_failed', { code: error?.code, message: error?.message });
  process.exitCode = 1;
});
