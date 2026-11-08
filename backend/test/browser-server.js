const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const frontendRoot = path.resolve(__dirname, '../../frontend');
// Mirror the production redirects and rewrites used after the admin/user split.
const redirects = {
  '/admin.html': '/admin/admin.html',
  '/alerts.html': '/user/alerts.html',
  '/bookings.html': '/user/bookings.html',
  '/downloads.html': '/user/downloads.html',
  '/licenses.html': '/user/licenses.html',
  '/orders.html': '/user/orders.html',
  '/profile.html': '/user/profile.html',
  '/purchases.html': '/user/purchases.html',
  '/requests.html': '/user/requests.html',
  '/wishlist.html': '/user/wishlist.html'
};
const rewrites = {
  '/beats.html': 'user/beats.html',
  '/booking.html': 'user/booking.html',
  '/merchandise.html': 'user/merchandise.html',
  '/produced.html': 'user/produced.html',
  '/payment-success.html': 'user/payment-success.html',
  '/certificate.html': 'user/certificate.html',
  '/verify-certificate.html': 'user/verify-certificate.html',
  '/cookies.html': 'user/cookies.html',
  '/license-terms.html': 'user/license-terms.html',
  '/privacy.html': 'user/privacy.html',
  '/refunds.html': 'user/refunds.html',
  '/terms.html': 'user/terms.html'
};
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

const server = http.createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  let pathname;
  let search;
  try {
    const parsedUrl = new URL(request.url, 'http://localhost');
    pathname = decodeURIComponent(parsedUrl.pathname);
    search = parsedUrl.search;
  } catch {
    response.writeHead(400).end('Invalid URL');
    return;
  }

  if (redirects[pathname]) {
    response.writeHead(301, { Location: `${redirects[pathname]}${search}` }).end();
    return;
  }

  const relativePath = pathname === '/'
    ? 'index.html'
    : rewrites[pathname] || pathname.replace(/^[/\\]+/, '');
  const filePath = path.resolve(frontendRoot, relativePath);
  if (filePath !== frontendRoot && !filePath.startsWith(`${frontendRoot}${path.sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }

    response.writeHead(200, {
      'Content-Length': stats.size,
      'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff'
    });
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(filePath).pipe(response);
  });
});

server.listen(4173, '127.0.0.1');
