const config = require('../config');

function securityHeaders(request, response, next) {
  response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  const isPublicUpload = ['GET', 'HEAD'].includes(request.method)
    && /^\/api\/uploads\/[^/]+$/.test(request.path);
  response.setHeader('Cross-Origin-Resource-Policy', isPublicUpload ? 'cross-origin' : 'same-site');
  response.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (config.isProduction) response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  const originalJson = response.json;
  response.json = function noStoreAuthenticatedJson(body) {
    if (request.sessionToken || /^\/api\/(?:auth\/login|admin\/login)$/.test(request.path)) {
      response.setHeader('Cache-Control', 'no-store');
    }
    return originalJson.call(this, body);
  };
  next();
}

module.exports = { securityHeaders };
