require('dotenv').config();

const crypto = require('node:crypto');
const path = require('node:path');

const port = Number(process.env.PORT) || 3000;
const frontendOrigin = (process.env.FRONTEND_ORIGIN || 'http://localhost:5500').replace(/\/+$/, '');
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
const apiPublicUrl = (process.env.API_PUBLIC_URL || `http://localhost:${port}`).replace(/\/+$/, '');
const paymentCallbackUrl = new URL(process.env.PAYMENT_CALLBACK_URL || '/payment-success.html', frontendOrigin);
paymentCallbackUrl.searchParams.set('apiBaseUrl', apiPublicUrl);
const isProduction = process.env.NODE_ENV === 'production';
const configuredPaystackKey = String(process.env.PAYSTACK_SECRET_KEY || '').trim();
const paystackSecretKey = configuredPaystackKey && configuredPaystackKey !== 'sk_test_your_paystack_secret_key'
  ? configuredPaystackKey
  : null;
const configuredDownloadSecret = String(process.env.DOWNLOAD_SIGNING_SECRET || '').trim();
const configuredCertificateSecret = String(process.env.CERTIFICATE_SIGNING_SECRET || '').trim();
const databaseConfigured = Boolean(
  (process.env.MYSQL_URL && !process.env.MYSQL_URL.includes('user:password'))
  || (process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME)
);
const configuredTrustProxy = String(process.env.TRUST_PROXY || '').trim();
const trustProxy = configuredTrustProxy === 'true'
  ? true
  : configuredTrustProxy === 'false' || !configuredTrustProxy
    ? false
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
