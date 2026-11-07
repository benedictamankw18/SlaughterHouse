const path = require('node:path');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand
} = require('@aws-sdk/client-s3');
const { isPublicUploadKey, apiPublicUploadUrl, joinUrl } = require('./public-url');

const STORAGE_AREAS = Object.freeze(['uploads', 'certificates']);
const PUBLIC_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const PRIVATE_CACHE_CONTROL = 'private, no-store';
const CONTENT_TYPES = Object.freeze({
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf'
});

function assertSimpleKey(key) {
  if (typeof key !== 'string' || !key || key === '.' || key === '..' || /[\\/]/.test(key)) {
    throw new Error('Storage keys must be simple file names.');
  }
}

function isNotFoundError(error) {
  const status = error?.$metadata?.httpStatusCode;
  return status === 404
    || error?.name === 'NotFound'
    || error?.name === 'NoSuchKey'
    || error?.Code === 'NoSuchKey';
}

function isPreconditionError(error) {
  const status = error?.$metadata?.httpStatusCode;
  return status === 412 || error?.name === 'PreconditionFailed' || error?.Code === 'PreconditionFailed';
}

function isUnsupportedConditionalError(error) {
  const status = error?.$metadata?.httpStatusCode;
  return status === 501 || (status === 400 && /if-?none-?match|conditional/i.test(String(error?.message || '')));
}

function missingObjectError(cause) {
  return Object.assign(new Error('Stored object was not found.'), { code: 'ENOENT', cause });
}

function contentTypeFor(key) {
  return CONTENT_TYPES[path.extname(key).toLowerCase()] || 'application/octet-stream';
}

/**
 * S3-compatible storage provider. Works with AWS S3, Cloudflare R2, Supabase
 * Storage, Backblaze B2, and MinIO. Uploads live under `<prefix>uploads/` and
 * generated certificates under `<prefix>certificates/` inside one bucket.
 */
function createS3Storage({
  bucket,
  region = 'auto',
  endpoint = '',
  accessKeyId = '',
  secretAccessKey = '',
  forcePathStyle = false,
  publicMediaBaseUrl = '',
  keyPrefix = '',
  apiPublicUrl,
  client = null
} = {}) {
  if (!bucket) throw new Error('An S3 bucket name is required.');
  const prefix = keyPrefix ? `${String(keyPrefix).replace(/^\/+|\/+$/g, '')}/` : '';
  const s3 = client || new S3Client({
    region,
    endpoint: endpoint || undefined,
    forcePathStyle: Boolean(forcePathStyle),
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {})
  });
  let bucketProbe = null;

  function objectKey(key, area) {
    if (!STORAGE_AREAS.includes(area)) throw new Error(`Unknown storage area: ${area}`);
    assertSimpleKey(key);
    return `${prefix}${area}/${key}`;
  }

  async function save(data, { area = 'uploads', key } = {}) {
    const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const publicObject = area === 'uploads' && isPublicUploadKey(key);
    const parameters = {
      Bucket: bucket,
      Key: objectKey(key, area),
      Body: body,
      ContentType: contentTypeFor(key),
      CacheControl: publicObject ? PUBLIC_CACHE_CONTROL : PRIVATE_CACHE_CONTROL
    };
    try {
      // Match the local provider, which writes with the exclusive "wx" flag.
      await s3.send(new PutObjectCommand({ ...parameters, IfNoneMatch: '*' }));
    } catch (error) {
      if (isPreconditionError(error)) throw Object.assign(new Error('Stored object already exists.'), { code: 'EEXIST', cause: error });
      // Some S3-compatible providers reject conditional writes outright.
      if (!isUnsupportedConditionalError(error)) throw error;
      await s3.send(new PutObjectCommand(parameters));
    }
    return key;
  }

  async function readStream(key, { area = 'uploads', start, end } = {}) {
    const parameters = { Bucket: bucket, Key: objectKey(key, area) };
    if (Number.isInteger(start)) {
      parameters.Range = `bytes=${start}-${Number.isInteger(end) ? end : ''}`;
    }
    try {
      const result = await s3.send(new GetObjectCommand(parameters));
      if (!result.Body) throw missingObjectError();
      return result.Body;
    } catch (error) {
      if (isNotFoundError(error)) throw missingObjectError(error);
      throw error;
    }
  }

  async function deleteFile(key, { area = 'uploads' } = {}) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey(key, area) }));
    } catch (error) {
      if (isNotFoundError(error)) return;
      throw error;
    }
  }

  async function stat(key, { area = 'uploads' } = {}) {
    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey(key, area) }));
      return { size: Number(head.ContentLength || 0) };
    } catch (error) {
      if (isNotFoundError(error)) throw missingObjectError(error);
      throw error;
    }
  }

  function publicUrl(key) {
    if (!publicMediaBaseUrl) return apiPublicUploadUrl(apiPublicUrl, key);
    if (!isPublicUploadKey(key)) return null;
    return `${joinUrl(publicMediaBaseUrl, prefix, 'uploads')}/${encodeURIComponent(key)}`;
  }

  async function checkWritable(area) {
    if (!STORAGE_AREAS.includes(area)) throw new Error(`Unknown storage area: ${area}`);
    if (!bucketProbe) {
      const probeKey = `${prefix}health/probe`;
      bucketProbe = (async () => {
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: probeKey, Body: Buffer.from('ok'), ContentType: 'text/plain', CacheControl: 'no-store' }));
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: probeKey }));
      })().catch(error => {
        bucketProbe = null;
        throw error;
      });
    }
    await bucketProbe;
  }

  return Object.freeze({ save, readStream, delete: deleteFile, stat, publicUrl, checkWritable });
}

module.exports = { createS3Storage, STORAGE_AREAS, PUBLIC_CACHE_CONTROL };
