const config = require('../../config');
const { createLocalStorage } = require('./local');
const { createS3Storage } = require('./s3');

const storage = config.storageDriver === 's3'
  ? createS3Storage({
      bucket: config.s3.bucket,
      region: config.s3.region,
      endpoint: config.s3.endpoint,
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey,
      forcePathStyle: config.s3.forcePathStyle,
      publicMediaBaseUrl: config.s3.publicMediaBaseUrl,
      keyPrefix: config.s3.keyPrefix,
      apiPublicUrl: config.apiPublicUrl
    })
  : createLocalStorage({
      uploadDirectory: config.uploadDirectory,
      certificateDirectory: config.certificateDirectory,
      apiPublicUrl: config.apiPublicUrl
    });

module.exports = storage;
