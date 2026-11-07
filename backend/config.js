require('dotenv').config();

const crypto = require('node:crypto');
const path = require('node:path');

const port = Number(process.env.PORT) || 3000;
const vercelUrl = String(process.env.VERCEL_URL || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
const deploymentOrigin = process.env.VERCEL === '1' && vercelUrl ? `https://${vercelUrl}` : null;
const frontendOrigin = (process.env.FRONTEND_ORIGIN || deploymentOrigin || 'http://localhost:5500').replace(/\/+$/, '');
const frontendOrigins = [...new Set([frontendOrigin, ...(process.env.FRONTEND_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean)])];
for (const origin of frontendOrigins) {
  try {
    if (new URL(origin).origin !== origin) throw new Error();
  } catch {
    throw new Error(`Invalid frontend origin configured: ${origin}`);
  }
}
const apiPublicUrl = (process.env.API_PUBLIC_URL || deploymentOrigin || `http://localhost:${port}`).replace(/\/+$/, '');
const paymentCallbackUrl = new URL(process.env.PAYMENT_CALLBACK_URL || '/payment-success.html', frontendOrigin);
const isProduction = process.env.NODE_ENV === 'production';
const configuredPaystackKey = String(process.env.PAYSTACK_SECRET_KEY || '').trim();
const paystackSecretKey = configuredPaystackKey && configuredPaystackKey !== 'sk_test_your_paystack_secret_key'
  ? configuredPaystackKey
  : null;
const configuredDownloadSecret = String(process.env.DOWNLOAD_SIGNING_SECRET || '').trim();
const configuredCertificateSecret = String(process.env.CERTIFICATE_SIGNING_SECRET || '').trim();
const databaseConfigured = Boolean(process.env.DATABASE_URL);
const configuredTrustProxy = String(process.env.TRUST_PROXY || '').trim();
const trustProxy = configuredTrustProxy === 'true'
  ? true
  : configuredTrustProxy === 'false'
    ? false
    : !configuredTrustProxy
      ? process.env.VERCEL === '1'
    : /^\d+$/.test(configuredTrustProxy)
      ? Number(configuredTrustProxy)
      : configuredTrustProxy.split(',').map(value => value.trim()).filter(Boolean);
const downloadSigningSecret = configuredDownloadSecret || (isProduction ? null : crypto.randomBytes(32).toString('hex'));
// In development the certificate secret intentionally falls back to the download secret so
// verification stays stable across restarts. Production requires both to be set and distinct.
const certificateSigningSecret = configuredCertificateSecret || configuredDownloadSecret || (isProduction ? null : crypto.randomBytes(32).toString('hex'));

if (isProduction) {
  const missingSecrets = [];
  if (!downloadSigningSecret) missingSecrets.push('DOWNLOAD_SIGNING_SECRET');
  if (!configuredCertificateSecret) missingSecrets.push('CERTIFICATE_SIGNING_SECRET');
  if (missingSecrets.length) {
    throw new Error(`Set ${missingSecrets.join(', ')} before starting in production.`);
  }
  if (Buffer.byteLength(downloadSigningSecret, 'utf8') < 32) {
    throw new Error('DOWNLOAD_SIGNING_SECRET must be at least 32 bytes in production.');
  }
  if (Buffer.byteLength(certificateSigningSecret, 'utf8') < 32) {
    throw new Error('CERTIFICATE_SIGNING_SECRET must be at least 32 bytes in production.');
  }
  if (downloadSigningSecret === certificateSigningSecret) {
    throw new Error('CERTIFICATE_SIGNING_SECRET must be different from DOWNLOAD_SIGNING_SECRET in production.');
  }
}

const storageDriver = String(process.env.STORAGE_DRIVER || 'local').trim().toLowerCase();
if (!['local', 's3'].includes(storageDriver)) {
  throw new Error('STORAGE_DRIVER must be either "local" or "s3".');
}
const s3Endpoint = String(process.env.S3_ENDPOINT || '').trim().replace(/\/+$/, '');
const s3Region = String(process.env.S3_REGION || '').trim() || (s3Endpoint ? 'auto' : '');
const s3 = Object.freeze({
  endpoint: s3Endpoint,
  region: s3Region,
  bucket: String(process.env.S3_BUCKET || '').trim(),
  accessKeyId: String(process.env.S3_ACCESS_KEY_ID || '').trim(),
  secretAccessKey: String(process.env.S3_SECRET_ACCESS_KEY || '').trim(),
  forcePathStyle: /^(true|1)$/i.test(String(process.env.S3_FORCE_PATH_STYLE || '').trim()),
  publicMediaBaseUrl: String(process.env.PUBLIC_MEDIA_BASE_URL || '').trim().replace(/\/+$/, ''),
  keyPrefix: String(process.env.MEDIA_KEY_PREFIX || '').trim().replace(/^\/+|\/+$/g, '')
});
const allowEphemeralStorage = /^(true|1)$/i.test(String(process.env.ALLOW_EPHEMERAL_STORAGE || '').trim());

if (storageDriver === 's3') {
  const missingStorage = [];
  if (!s3.bucket) missingStorage.push('S3_BUCKET');
  if (!s3.region) missingStorage.push('S3_REGION');
  if (!s3.accessKeyId) missingStorage.push('S3_ACCESS_KEY_ID');
  if (!s3.secretAccessKey) missingStorage.push('S3_SECRET_ACCESS_KEY');
  if (missingStorage.length) {
    throw new Error(`Set ${missingStorage.join(', ')} when STORAGE_DRIVER=s3.`);
  }
  if (isProduction && s3.publicMediaBaseUrl && !s3.publicMediaBaseUrl.startsWith('https://')) {
    throw new Error('PUBLIC_MEDIA_BASE_URL must use https in production.');
  }
}
if (isProduction && storageDriver !== 's3' && !allowEphemeralStorage) {
  throw new Error('Production requires STORAGE_DRIVER=s3 for durable media storage. Set ALLOW_EPHEMERAL_STORAGE=true only for an explicitly disposable deployment.');
}

module.exports = {
  port,
  isProduction,
  frontendOrigin,
  frontendOrigins,
  trustProxy,
  apiPublicUrl,
  paymentCallbackUrl,
  databaseConfigured,
  emailApiKey: process.env.EMAIL_API_KEY || null,
  emailFrom: process.env.EMAIL_FROM || null,
  uploadDirectory: path.join(__dirname, 'data', 'uploads'),
  certificateDirectory: path.join(__dirname, 'data', 'certificates'),
  certificateSigningSecret,
  paystackSecretKey,
  downloadSigningSecret,
  storageDriver,
  s3,
  allowEphemeralStorage,
  sessionDurationMs: 8 * 60 * 60 * 1000,
  sessionCookieNames: {
    customer: 'ultbigboy_customer_session',
    admin: 'ultbigboy_admin_session'
  },
  secureCookies: process.env.NODE_ENV === 'production',
  usdToGhsRate: 10,
  bookingServiceLabels: {
    mixtape: 'Mixtape',
    'full-production': 'Full production',
    'beat-production': 'Beat production',
    'adverts-promos': 'Adverts and promos',
    'ep-album': 'EP / Album'
  },
  beatRequestLicenseLabels: {
    basic: 'Basic',
    premium: 'Premium',
    unlimited: 'Unlimited',
    exclusive: 'Exclusive'
  }
};
