require('dotenv').config();

const crypto = require('node:crypto');
const path = require('node:path');

const port = Number(process.env.PORT) || 3000;
const frontendOrigin = (process.env.FRONTEND_ORIGIN || 'http://localhost:5500').replace(/\/+$/, '');
const apiPublicUrl = (process.env.API_PUBLIC_URL || `http://localhost:${port}`).replace(/\/+$/, '');
const paymentCallbackUrl = new URL(process.env.PAYMENT_CALLBACK_URL || '/payment-success.html', frontendOrigin);
paymentCallbackUrl.searchParams.set('apiBaseUrl', apiPublicUrl);
const configuredPaystackKey = String(process.env.PAYSTACK_SECRET_KEY || '').trim();
const paystackSecretKey = configuredPaystackKey && configuredPaystackKey !== 'sk_test_your_paystack_secret_key'
  ? configuredPaystackKey
  : null;
const certificateSigningSecret = process.env.CERTIFICATE_SIGNING_SECRET
  || process.env.DOWNLOAD_SIGNING_SECRET
  || (process.env.NODE_ENV === 'production' ? null : crypto.randomBytes(32).toString('hex'));

if (!certificateSigningSecret) {
  throw new Error('Set CERTIFICATE_SIGNING_SECRET (or DOWNLOAD_SIGNING_SECRET) to a stable secret before starting in production.');
}

module.exports = {
  port,
  frontendOrigin,
  apiPublicUrl,
  paymentCallbackUrl,
  emailApiKey: process.env.EMAIL_API_KEY || null,
  emailFrom: process.env.EMAIL_FROM || null,
  uploadDirectory: path.join(__dirname, 'data', 'uploads'),
  certificateDirectory: path.join(__dirname, 'data', 'certificates'),
  certificateSigningSecret,
  paystackSecretKey,
  downloadSigningSecret: process.env.DOWNLOAD_SIGNING_SECRET || (
    process.env.NODE_ENV === 'production' ? null : crypto.randomBytes(32).toString('hex')
  ),
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
