const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const Module = require('node:module');
const { Pool } = require('pg');
const express = require('express');
const cors = require('cors');
const { applyMigrations } = require('../services/migrations');
const { runInTransaction } = require('../services/transaction');
const { configureRequestBodyParsing } = require('../middleware/request-body');
const { requestValidation, sendError } = require('../middleware/validate');
const { isAllowedOrigin } = require('../services/cors-origin');
const { DEFAULT_LICENSE_RIGHTS } = require('../services/license-rights');
const storage = require('../services/storage');
const { summarizeResult, toPostgresQuery, withReturningId } = require('../services/postgres');
const { encryptSecret, generateTotpSecret } = require('../services/admin-mfa');

const TEST_SCHEMA = 'slaughterhouse_route_test';
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const routeFiles = [
  'auth',
  'public',
  'admin',
  'requests',
  'bookings',
  'payments',
  'downloads',
  'certificates'
];

function assertSafeTestDatabase(connectionString) {
  const url = new URL(connectionString);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), 'TEST_DATABASE_URL must use a PostgreSQL protocol.');
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(url.hostname), 'Integration tests are restricted to a local PostgreSQL server.');
  assert.equal(decodeURIComponent(url.pathname.slice(1)), TEST_SCHEMA, `Integration tests may only clear the ${TEST_SCHEMA} schema.`);
  return url;
}

function createDatabaseAdapter(pool, promisePool) {
  return {
    run(query, parameters = [], callback) {
      if (typeof parameters === 'function') {
        callback = parameters;
        parameters = [];
      }
      const operation = promisePool.execute(query, parameters).then(([result]) => {
        const summary = { lastID: result.insertId, changes: result.affectedRows };
        callback?.call(summary, null, result);
        return summary;
      }, error => {
        if (callback) {
          callback(error);
          return { lastID: undefined, changes: 0 };
        }
        throw error;
      });
      return operation;
    },
    get(query, parameters = [], callback) {
      if (typeof parameters === 'function') {
        callback = parameters;
        parameters = [];
      }
      const operation = promisePool.execute(query, parameters).then(([rows]) => rows?.[0]);
      if (callback) operation.then(row => callback(null, row), callback);
      return operation;
    },
    all(query, parameters = [], callback) {
      if (typeof parameters === 'function') {
        callback = parameters;
        parameters = [];
      }
      const operation = promisePool.execute(query, parameters).then(([rows]) => rows);
      if (callback) operation.then(rows => callback(null, rows), callback);
      return operation;
    },
    async transaction(callback) {
      const connection = await pool.connect();
      try {
        return await runInTransaction(connection, callback);
      } finally {
        connection.release();
      }
    }
  };
}

async function clearTestTables(pool) {
  const { rows: tables } = await pool.query(
    'SELECT tablename FROM pg_tables WHERE schemaname = current_schema()'
  );
  const names = tables
    .map(row => row.tablename)
    .filter(name => !['schema_migrations', 'settings', 'license_rights', 'license_definition_status', 'stream_releases'].includes(name));
  if (!names.length) return;
  const tablesToClear = names.map(name => `"${String(name).replace(/"/g, '""')}"`).join(', ');
  await pool.query(`TRUNCATE TABLE ${tablesToClear} RESTART IDENTITY CASCADE`);
}

function createPromisePoolAdapter(pool) {
  return {
    async execute(query, parameters = []) {
      const result = await pool.query(toPostgresQuery(withReturningId(query)), parameters);
      if (/^\s*(SELECT|WITH)\b/i.test(query) || /\bRETURNING\b/i.test(query)) {
        return [result.rows, result.fields];
      }
      return [summarizeResult(result), result.fields];
    }
  };
}

test('PostgreSQL adapter exposes rows from INSERT RETURNING queries', async () => {
  const expected = { request_count: 1, retry_after_seconds: 0 };
  const adapter = createPromisePoolAdapter({
    async query() {
      return { rows: [expected], fields: [] };
    }
  });

  const [rows] = await adapter.execute(
    'INSERT INTO rate_limit_buckets (bucket_key) VALUES (?) RETURNING request_count, retry_after_seconds',
    ['a'.repeat(64)]
  );
  assert.deepEqual(rows, [expected]);
});

function testConfig() {
  return {
    port: 3000,
    isProduction: false,
    frontendOrigin: 'http://localhost:5500',
    frontendOrigins: ['http://localhost:5500'],
    trustProxy: false,
    apiPublicUrl: 'http://localhost:3000',
    paymentCallbackUrl: new URL('http://localhost:5500/payment-success.html'),
    databaseConfigured: true,
    emailApiKey: null,
    emailFrom: null,
    uploadDirectory: path.join(__dirname, '..', 'data', 'uploads'),
    certificateDirectory: path.join(__dirname, '..', 'data', 'certificates'),
    certificateSigningSecret: 'integration-certificate-secret-32-bytes',
    paystackSecretKey: 'integration-only-not-a-real-paystack-key',
    downloadSigningSecret: 'integration-download-secret-32-bytes',
    sessionDurationMs: 60 * 60 * 1000,
    adminMfaEncryptionKey: 'integration-admin-mfa-encryption-key-32-bytes',
    sessionCookieNames: { customer: 'customer_session', admin: 'admin_session' },
    secureCookies: false,
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
}

function loadRouteRouters(database) {
  const databaseId = require.resolve('../database');
  const configId = require.resolve('../config');
  const loggerId = require.resolve('../services/logger');
  const originals = new Map([
    [databaseId, require.cache[databaseId]],
    [configId, require.cache[configId]],
    [loggerId, require.cache[loggerId]]
  ]);
  const databaseModule = new Module(databaseId);
  databaseModule.filename = databaseId;
  databaseModule.loaded = true;
  databaseModule.exports = database;
  require.cache[databaseId] = databaseModule;

  const configModule = new Module(configId);
  configModule.filename = configId;
  configModule.loaded = true;
  configModule.exports = testConfig();
  require.cache[configId] = configModule;

  const loggerModule = new Module(loggerId);
  loggerModule.filename = loggerId;
  loggerModule.loaded = true;
  loggerModule.exports = { debug() {}, error() {}, info() {}, warn() {} };
  require.cache[loggerId] = loggerModule;

  const routeModules = routeFiles.map(name => {
    const id = require.resolve(`../routes/${name}`);
    originals.set(id, require.cache[id]);
    delete require.cache[id];
    return { id, router: require(id) };
  });

  return {
    routeModules,
    restore() {
      for (const { id } of routeModules) delete require.cache[id];
      for (const [id, original] of originals) {
        if (original) require.cache[id] = original;
        else delete require.cache[id];
      }
    }
  };
}

function routeCases(routeModules) {
  const cases = [];
  for (const { id, router } of routeModules) {
    for (const layer of router.stack) {
      if (!layer.route) continue;
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      const methods = Object.keys(layer.route.methods).filter(method => !['head', 'options'].includes(method));
      for (const routePath of paths) {
        assert.equal(typeof routePath, 'string', `Route paths must be strings in ${path.basename(id)}.`);
        for (const method of methods) cases.push({ file: path.basename(id), method, path: routePath });
      }
    }
  }
  assert.ok(cases.length > 0, 'At least one route must be registered for integration coverage.');
  return cases;
}

function requestPath(routePath, method) {
  if (method === 'get' && ['/admin/reports', '/admin/reports.csv'].includes(routePath)) {
    return `/api${routePath}?from=2026-01-01&to=2026-01-31`;
  }
  if (method === 'delete' && routePath === '/admin/stream-releases/:id') {
    return '/api/admin/stream-releases/2147483647';
  }
  const concretePath = routePath.replace(/:([A-Za-z0-9_]+)(?:\([^)]*\))?\??/g, (_, name) => {
    if (name === 'filename') return 'missing-integration-file.wav';
    if (name === 'reference') return 'UBB-INTEGRATION-NOT-FOUND';
    if (name === 'token') return 'invalid-integration-token';
    if (name === 'type') return 'basic';
    return '1';
  });
  return `/api${concretePath.startsWith('/') ? concretePath : `/${concretePath}`}`;
}

function mountIntegrationApp(routeModules, database, config) {
  const app = express();
  const { requestContext } = require('../middleware/request-context');
  const { securityHeaders } = require('../middleware/security-headers');
  const { createCsrfProtection } = require('../middleware/csrf');

  app.use(requestContext);
  app.use(securityHeaders);
  app.use(cors({
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
    maxAge: 600,
    origin(origin, callback) {
      if (isAllowedOrigin(origin, config.frontendOrigins, true)) return callback(null, true);
      return callback(new Error('Origin is not allowed.'));
    }
  }));
  configureRequestBodyParsing(app);
  app.use(requestValidation);
  app.use(createCsrfProtection({ database, config }));
  app.disable('x-powered-by');
  for (const { router } of routeModules) app.use('/api', router);
  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    if (error?.type === 'entity.parse.failed') {
      return sendError(response, 400, 'The JSON request body could not be parsed.', { code: 'INVALID_JSON' });
    }
    if (error?.type === 'entity.too.large') {
      return sendError(response, 413, 'Request payload is too large.', { code: 'PAYLOAD_TOO_LARGE' });
    }
    response.status(500).json({ error: 'Unexpected integration-test error.' });
  });
  return app;
}

async function postSignedWebhook(baseUrl, event, secret) {
  const rawBody = JSON.stringify(event);
  const signature = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  const response = await fetch(`${baseUrl}/api/payments/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-paystack-signature': signature,
      Connection: 'close'
    },
    body: rawBody
  });
  return { status: response.status, body: await response.json() };
}

async function insertPaidOrderCandidate(pool, { reference, amount, item }) {
  await pool.execute(
    'INSERT INTO orders (reference, customer_name, customer_email, amount, currency, items_json) VALUES (?, ?, ?, ?, ?, ?)',
    [reference, 'Integration Customer', 'integration-customer@example.test', amount, 'GHS', JSON.stringify([item])]
  );
}

async function seedSessions(pool) {
  const users = [
    { name: 'Integration Customer', email: 'integration-customer@example.test', role: 'customer' },
    { name: 'Integration Admin', email: 'integration-admin@example.test', role: 'super_admin' }
  ];
  const sessions = {};
  for (const user of users) {
    const [result] = await pool.execute(
      `INSERT INTO users (
        name, email, first_name, last_name, phone, role, password_hash,
        email_verified_at, admin_mfa_secret, admin_mfa_enabled_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`,
      [
        user.name,
        user.email,
        user.name.split(' ')[1],
        user.role,
        user.role === 'customer' ? '+233240000001' : '+233240000002',
        user.role,
        'integration-test-hash',
        user.role === 'super_admin' ? encryptSecret(generateTotpSecret(), 'integration-admin-mfa-encryption-key-32-bytes') : null,
        user.role === 'super_admin' ? new Date() : null
      ]
    );
    const token = crypto.randomBytes(32).toString('hex');
    await pool.execute(
      'INSERT INTO user_sessions (user_id, token_hash, csrf_token_hash, role, expires_at) VALUES (?, ?, ?, ?, ?)',
      [result.insertId, crypto.createHash('sha256').update(token).digest('hex'), crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex'), user.role, new Date(Date.now() + 60 * 60 * 1000)]
    );
    sessions[user.role] = token;
  }
  return sessions;
}

async function seedSettings(pool) {
  const settings = [
    ['booking_fee_mixtape_ghs', '700'],
    ['booking_fee_full_production_ghs', '1000'],
    ['booking_fee_beat_production_ghs', '500'],
    ['booking_fee_adverts_promos_ghs', '1000'],
    ['beat_request_license_basic_ghs', '500'],
    ['beat_request_license_premium_ghs', '1000'],
    ['beat_request_license_unlimited_ghs', '2000'],
    ['beat_request_license_exclusive_ghs', '4700'],
    ['beat_default_basic_usd', '25'],
    ['beat_default_premium_usd', '45'],
    ['beat_default_unlimited_usd', '150'],
    ['beat_default_exclusive_usd', '420'],
    ['usd_to_ghs_rate', '10']
  ];
  for (const [key, value] of settings) {
    await pool.execute(
      'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP',
      [key, value]
    );
  }
}

async function invokeRoute(baseUrl, route, sessions) {
  const methodsWithBody = new Set(['post', 'put', 'patch']);
  const requestBody = methodsWithBody.has(route.method) ? '{}' : undefined;
  const url = `${baseUrl}${requestPath(route.path, route.method)}`;
  const candidates = route.path.endsWith('/logout')
    ? [null, route.path.startsWith('/admin/') ? sessions.super_admin : sessions.customer]
    : [null, sessions.customer, sessions.super_admin];
  let response;
  let responseText;

  for (const token of candidates) {
    response = await fetch(url, {
      method: route.method.toUpperCase(),
      headers: {
        ...(requestBody === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Connection: 'close'
      },
      body: requestBody
    });
    responseText = await response.text();
    if (![401, 403].includes(response.status)) break;
  }
  return { response, responseText, url };
}

test('all registered API route methods execute against an isolated PostgreSQL test database', {
  skip: !testDatabaseUrl && 'Set TEST_DATABASE_URL to the dedicated local slaughterhouse_route_test database.'
}, async t => {
  assertSafeTestDatabase(testDatabaseUrl);
  const pool = new Pool({ connectionString: testDatabaseUrl });
  const promisePool = createPromisePoolAdapter(pool);
  let loaded;
  let server;
  try {
    await applyMigrations(pool);
    await clearTestTables(pool);
    await seedSettings(promisePool);
    const database = createDatabaseAdapter(pool, promisePool);
    const config = testConfig();
    loaded = loadRouteRouters(database);
    const routes = routeCases(loaded.routeModules).sort((left, right) =>
      Number(left.path.endsWith('/logout')) - Number(right.path.endsWith('/logout')));
    t.diagnostic(`Exercising ${routes.length} registered API route methods against PostgreSQL.`);
    const sessions = await seedSessions(promisePool);
    const app = mountIntegrationApp(loaded.routeModules, database, config);
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const failures = [];

    for (const route of routes) {
      const { response, responseText, url } = await invokeRoute(baseUrl, route, sessions);
      const contentType = response.headers.get('content-type') || '';
      if (response.status >= 500) {
        failures.push(`${route.method.toUpperCase()} ${url}: ${response.status} ${responseText.slice(0, 250)}`);
      } else if (response.status === 404 && contentType.includes('text/html')) {
        failures.push(`${route.method.toUpperCase()} ${url}: route was not reached`);
      }
    }

    assert.deepEqual(failures, [], `${routes.length} route methods were exercised; failures:\n${failures.join('\n')}`);

    const coverFile = `cover-integration-${crypto.randomBytes(6).toString('hex')}.webp`;
    const previewFile = `preview-integration-${crypto.randomBytes(6).toString('hex')}.mp3`;
    const [beatInsert] = await promisePool.execute(
      `INSERT INTO beats (title, cover_art, preview_file, preview_duration_seconds, catalog_status)
       VALUES (?, ?, ?, ?, 'published')`,
      [`Integration cover ${crypto.randomUUID()}`, coverFile, previewFile, 30]
    );
    const beatsResponse = await fetch(`${baseUrl}/api/beats`);
    assert.equal(beatsResponse.status, 200);
    const { beats } = await beatsResponse.json();
    const publicBeat = beats.find(beat => beat.id === beatInsert.insertId);
    assert.ok(publicBeat, 'The newly published beat appears in the customer catalog.');
    assert.equal(publicBeat.coverArt, coverFile, 'Beat cover art uses the frontend camelCase field.');
    assert.equal(publicBeat.previewFile, previewFile, 'Beat preview file uses the frontend camelCase field.');
    assert.equal(publicBeat.previewDurationSeconds, 30, 'Beat preview duration uses the frontend camelCase field.');
    assert.equal(publicBeat.previewUrl, `http://localhost:3000/api/uploads/${previewFile}`);

    const beatDetailsResponse = await fetch(`${baseUrl}/api/beats/${beatInsert.insertId}`);
    assert.equal(beatDetailsResponse.status, 200);
    const { beat: publicBeatDetails } = await beatDetailsResponse.json();
    assert.equal(publicBeatDetails.coverArt, coverFile);
    assert.equal(publicBeatDetails.previewFile, previewFile);

    const staffResponse = await fetch(`${baseUrl}/api/admin/staff`, {
      headers: { Authorization: `Bearer ${sessions.super_admin}`, Connection: 'close' }
    });
    assert.equal(staffResponse.status, 200, 'Staff accounts can be listed by a super-admin.');
    const { staff } = await staffResponse.json();
    assert.equal(staff[0]?.role, 'super_admin', 'Super-admin accounts appear first in the staff list.');

    const profileResponse = await fetch(`${baseUrl}/api/auth/profile`, {
      headers: { Authorization: 'Bearer ' + sessions.customer, Connection: 'close' }
    });
    assert.equal(profileResponse.status, 200, 'Verified customers retain access to their profile.');

    const [{ id: customerId }] = await promisePool.execute(
      'SELECT id FROM users WHERE email = ?',
      ['integration-customer@example.test']
    ).then(([rows]) => rows);
    const downloadCustomerToken = crypto.randomBytes(32).toString('hex');
    const downloadCustomerTokenHash = crypto.createHash('sha256').update(downloadCustomerToken).digest('hex');
    await promisePool.execute(
      'INSERT INTO user_sessions (user_id, token_hash, csrf_token_hash, role, expires_at) VALUES (?, ?, ?, ?, ?)',
      [customerId, downloadCustomerTokenHash, crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex'), 'customer', new Date(Date.now() + 60 * 60 * 1000)]
    );
    const downloadFile = `integration-download-${crypto.randomBytes(6).toString('hex')}.mp3`;
    const downloadReferences = {
      paid: `UBB-INTEGRATION-DOWNLOAD-PAID-${crypto.randomBytes(4).toString('hex')}`,
      legacy: `UBB-INTEGRATION-DOWNLOAD-LEGACY-${crypto.randomBytes(4).toString('hex')}`,
      pending: `UBB-INTEGRATION-DOWNLOAD-PENDING-${crypto.randomBytes(4).toString('hex')}`,
      partial: `UBB-INTEGRATION-DOWNLOAD-PARTIAL-${crypto.randomBytes(4).toString('hex')}`,
      expired: `UBB-INTEGRATION-DOWNLOAD-EXPIRED-${crypto.randomBytes(4).toString('hex')}`
    };
    let downloadBeatId;
    let otherCustomerId;
    let storedDownload;
    const downloadOrderIds = [];
    try {
      const [beatResult] = await promisePool.execute(
        `INSERT INTO beats (title, mp3_file, basic_price, catalog_status)
         VALUES (?, ?, ?, 'published')`,
        [`Integration download beat ${crypto.randomUUID()}`, downloadFile, 1]
      );
      downloadBeatId = beatResult.insertId;
      storedDownload = await storage.save(Buffer.from('integration audio bytes'), { area: 'uploads', key: downloadFile });
      const downloadItem = { type: 'beat', productId: downloadBeatId, name: 'Integration download beat', license: 'basic' };
      for (const [key, reference] of Object.entries(downloadReferences)) {
        const status = key === 'pending' ? 'pending' : key === 'partial' ? 'partially_refunded' : 'paid';
        const [orderResult] = await promisePool.execute(
          'INSERT INTO orders (reference, customer_name, customer_email, amount, currency, items_json, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [reference, 'Integration Customer', 'integration-customer@example.test', 1, 'GHS', JSON.stringify([downloadItem]), status]
        );
        downloadOrderIds.push(orderResult.insertId);
        const expirySql = key === 'legacy' ? 'NULL' : key === 'expired' ? "CURRENT_TIMESTAMP - INTERVAL '1 second'" : "CURRENT_TIMESTAMP + INTERVAL '1 day'";
        await promisePool.execute(
          `INSERT INTO licenses (user_id, beat_id, order_id, license_type, rights_json, expires_at)
           VALUES (?, ?, ?, 'basic', ?, ${expirySql})`,
          [customerId, downloadBeatId, orderResult.insertId, JSON.stringify(DEFAULT_LICENSE_RIGHTS.basic)]
        );
      }

      const [otherCustomerResult] = await promisePool.execute(
        `INSERT INTO users (name, email, role, password_hash)
         VALUES (?, ?, 'customer', ?)`,
        ['Other Integration Customer', `other-${crypto.randomUUID()}@example.test`, 'integration-test-hash']
      );
      otherCustomerId = otherCustomerResult.insertId;
      const otherCustomerToken = crypto.randomBytes(32).toString('hex');
      await promisePool.execute(
        'INSERT INTO user_sessions (user_id, token_hash, csrf_token_hash, role, expires_at) VALUES (?, ?, ?, ?, ?)',
        [otherCustomerId, crypto.createHash('sha256').update(otherCustomerToken).digest('hex'), crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex'), 'customer', new Date(Date.now() + 60 * 60 * 1000)]
      );

      const customerLicensesResponse = await fetch(`${baseUrl}/api/customer/licenses`, {
        headers: { Authorization: `Bearer ${downloadCustomerToken}`, Connection: 'close' }
      });
      const customerLicensesBody = await customerLicensesResponse.json();
      assert.equal(customerLicensesResponse.status, 200, `A customer can view active and expired paid licenses: ${customerLicensesBody.error || ''}`);
      const { licenses: customerLicenses } = customerLicensesBody;
      const activeLicense = customerLicenses.find(license => license.order_reference === downloadReferences.paid);
      const legacyLicense = customerLicenses.find(license => license.order_reference === downloadReferences.legacy);
      const expiredLicense = customerLicenses.find(license => license.order_reference === downloadReferences.expired);
      assert.ok(activeLicense?.expires_at, 'License records include their expiry date.');
      assert.ok(activeLicense.downloads.some(file => file.format === 'MP3'), 'Customers can obtain fresh download links throughout the license term.');
      assert.equal(legacyLicense.expires_at, null, 'Existing licenses without an expiry keep their original duration.');
      assert.equal(legacyLicense.certificate_status, 'valid', 'Existing licenses without an expiry remain valid.');
      assert.ok(legacyLicense.downloads.some(file => file.format === 'MP3'), 'Existing licenses without an expiry retain download access.');
      assert.equal(expiredLicense.certificate_status, 'expired', 'Expired licenses are identified in the account.');
      assert.deepEqual(expiredLicense.downloads, [], 'Expired licenses do not receive download links.');

      const { createDownloadToken } = require('../services/downloads');
      const requestDownload = (reference, token, bearer = downloadCustomerToken) => fetch(
        `${baseUrl}/api/orders/${reference}/downloads/${downloadBeatId}?license=basic&format=mp3&token=${encodeURIComponent(token)}`,
        { headers: { Authorization: `Bearer ${bearer}`, Connection: 'close' } }
      );
      for (const key of ['pending', 'partial', 'expired']) {
        const token = createDownloadToken(downloadReferences[key], downloadBeatId, 'basic', 'mp3');
        const response = await requestDownload(downloadReferences[key], token);
        assert.equal(response.status, 403, `${key} orders and expired licenses cannot download files.`);
      }

      const paidToken = createDownloadToken(downloadReferences.paid, downloadBeatId, 'basic', 'mp3');
      const otherAccountResponse = await requestDownload(downloadReferences.paid, paidToken, otherCustomerToken);
      assert.equal(otherAccountResponse.status, 403, 'A different customer account cannot use a paid order download.');
      const paidDownload = await requestDownload(downloadReferences.paid, paidToken);
      assert.equal(paidDownload.status, 200, 'A fully paid, unexpired license can download its included file.');
      assert.equal(await paidDownload.text(), 'integration audio bytes');
      const legacyToken = createDownloadToken(downloadReferences.legacy, downloadBeatId, 'basic', 'mp3');
      const legacyDownload = await requestDownload(downloadReferences.legacy, legacyToken);
      assert.equal(legacyDownload.status, 200, 'A fully paid legacy license without an expiry retains download access.');
    } finally {
      await promisePool.execute('DELETE FROM user_sessions WHERE token_hash = ?', [downloadCustomerTokenHash]);
      if (downloadBeatId) {
        const orderPlaceholders = downloadOrderIds.map(() => '?').join(', ');
        if (downloadOrderIds.length) {
          await promisePool.execute(
            `DELETE FROM license_certificate_history WHERE certificate_id IN
             (SELECT id FROM license_certificates WHERE order_id IN (${orderPlaceholders}))`,
            downloadOrderIds
          );
          await promisePool.execute(`DELETE FROM license_certificates WHERE order_id IN (${orderPlaceholders})`, downloadOrderIds);
        }
        await promisePool.execute('DELETE FROM licenses WHERE beat_id = ?', [downloadBeatId]);
        await promisePool.execute('DELETE FROM orders WHERE reference = ANY(?)', [Object.values(downloadReferences)]);
        await promisePool.execute('DELETE FROM beats WHERE id = ?', [downloadBeatId]);
      }
      if (otherCustomerId) await promisePool.execute('DELETE FROM users WHERE id = ?', [otherCustomerId]);
      if (storedDownload) await storage.delete(downloadFile, { area: 'uploads' });
    }

    const [adminUsers] = await promisePool.execute(
      'SELECT id FROM users WHERE email = ? AND role = ?',
      ['integration-admin@example.test', 'super_admin']
    );
    const streamReleaseAdminToken = crypto.randomBytes(32).toString('hex');
    await promisePool.execute(
      'INSERT INTO user_sessions (user_id, token_hash, csrf_token_hash, role, expires_at) VALUES (?, ?, ?, ?, ?)',
      [adminUsers[0].id, crypto.createHash('sha256').update(streamReleaseAdminToken).digest('hex'), crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex'), 'super_admin', new Date(Date.now() + 60 * 60 * 1000)]
    );
    const streamReleaseTitle = `Integration stream release ${crypto.randomUUID()}`;
    let streamReleaseId;
    const adminRequest = (route, method, body) => fetch(`${baseUrl}${route}`, {
      method,
      headers: {
        Authorization: 'Bearer ' + streamReleaseAdminToken,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        Connection: 'close'
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const streamReleasePayload = {
      title: streamReleaseTitle,
      artist: 'Integration Artist',
      credits: ['Producer: Integration'],
      coverUrl: 'Images/integration-cover.jpg',
      links: [{ platform: 'Spotify', url: 'https://open.spotify.com/track/integration', label: 'Listen on Spotify' }]
    };
    try {
      let response = await adminRequest('/api/admin/stream-releases', 'POST', streamReleasePayload);
      assert.equal(response.status, 201, 'A stream release can be created.');
      streamReleaseId = (await response.json()).id;

      response = await adminRequest(`/api/admin/stream-releases/${streamReleaseId}`, 'PATCH', {
        ...streamReleasePayload,
        title: `${streamReleaseTitle} updated`,
        artist: 'Updated Integration Artist'
      });
      assert.equal(response.status, 200, 'A stream release can be updated.');

      response = await adminRequest(`/api/admin/stream-releases/${streamReleaseId}/status`, 'PATCH', { status: 'published' });
      assert.equal(response.status, 200, 'A stream release can be activated.');
      response = await fetch(`${baseUrl}/api/stream-releases`);
      let publicReleases = await response.json();
      const publicRelease = publicReleases.releases.find(release => release.id === streamReleaseId);
      assert.ok(publicRelease, 'An activated release appears publicly.');
      assert.equal(publicRelease.coverUrl, streamReleasePayload.coverUrl);
      assert.deepEqual(publicRelease.credits, streamReleasePayload.credits);
      assert.deepEqual(publicRelease.links, streamReleasePayload.links);

      response = await adminRequest(`/api/admin/stream-releases/${streamReleaseId}/status`, 'PATCH', { status: 'unpublished' });
      assert.equal(response.status, 200, 'A stream release can be deactivated.');
      response = await fetch(`${baseUrl}/api/stream-releases`);
      publicReleases = await response.json();
      assert.ok(!publicReleases.releases.some(release => release.id === streamReleaseId), 'A deactivated release is hidden publicly.');

      response = await adminRequest(`/api/admin/stream-releases/${streamReleaseId}`, 'DELETE');
      assert.equal(response.status, 200, 'A stream release can be deleted.');
      streamReleaseId = null;
    } finally {
      if (streamReleaseId) await adminRequest(`/api/admin/stream-releases/${streamReleaseId}`, 'DELETE');
    }

    const bookingReferences = ['UBB-CONCURRENT-BOOKING-A', 'UBB-CONCURRENT-BOOKING-B'];
    await promisePool.execute(
      `INSERT INTO booking_availability (slot_date, start_time, end_time, status)
       VALUES (?, ?, ?::time + INTERVAL '2 hours 20 minutes', 'available')
       ON CONFLICT (slot_date, start_time) DO UPDATE SET status = 'available', booking_id = NULL`,
      ['2030-01-08', '11:00', '11:00']
    );
    await promisePool.execute(
      `INSERT INTO booking_availability (slot_date, start_time, end_time, status)
       VALUES (?, ?, ?::time + INTERVAL '2 hours 20 minutes', 'available')
       ON CONFLICT (slot_date, start_time) DO UPDATE SET status = 'available', booking_id = NULL`,
      ['2030-01-09', '11:00', '11:00']
    );
    const bookingItem = {
      type: 'booking',
      name: 'Mixtape',
      service: 'mixtape',
      feeGhs: 700,
      booking: {
        name: 'Integration Customer',
        email: 'integration-customer@example.test',
        phone: '+233240000001',
        artistCount: 1,
        timezone: 'Africa/Accra',
        durationMinutes: 140,
        sessionSlots: [{ date: '2030-01-08', time: '11:00' }],
        details: 'Concurrent booking integration test'
      }
    };
    for (const reference of bookingReferences) {
      await insertPaidOrderCandidate(promisePool, { reference, amount: 700, item: bookingItem });
    }
    await promisePool.execute(
      `UPDATE booking_availability
       SET status = 'reserved', booking_order_reference = ?, hold_expires_at = CURRENT_TIMESTAMP + INTERVAL '30 minutes'
       WHERE slot_date = ? AND start_time = ?`,
      [bookingReferences[0], '2030-01-08', '11:00']
    );
    const bookingResults = await Promise.all(bookingReferences.map(reference => postSignedWebhook(baseUrl, {
      event: 'charge.success',
      data: { reference, status: 'success', amount: 70000, currency: 'GHS' }
    }, config.paystackSecretKey)));
    assert.ok(bookingResults.every(result => result.status === 200), 'Both booking webhook deliveries are acknowledged.');
    assert.equal(bookingResults.filter(result => result.body.conflict === 'booking_slot_unavailable').length, 1);
    assert.equal(bookingResults.filter(result => result.body.received === true && !result.body.conflict).length, 1);
    const [bookingCounts] = await promisePool.execute(
      `SELECT
        (SELECT COUNT(*) FROM booking_availability WHERE slot_date = '2030-01-08' AND start_time = '11:00') AS slots,
        (SELECT COUNT(*) FROM bookings WHERE payment_reference IN (?, ?)) AS bookings`,
      bookingReferences
    );
    assert.equal(Number(bookingCounts[0].slots), 1);
    assert.equal(Number(bookingCounts[0].bookings), 1);
    const reconciliationReference = bookingReferences[bookingResults.findIndex(result => result.body.conflict === 'booking_slot_unavailable')];
    const resolutionResponse = await fetch(`${baseUrl}/api/admin/orders/${reconciliationReference}/booking-resolution`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessions.super_admin}`,
        'Content-Type': 'application/json',
        Connection: 'close'
      },
      body: JSON.stringify({ action: 'assign_slot', slots: [{ date: '2030-01-09', time: '11:00' }] })
    });
    assert.equal(resolutionResponse.status, 200, 'An administrator can assign an available alternative slot.');
    const resolution = await resolutionResponse.json();
    assert.equal(resolution.resolution, 'assigned');
    const [reviewOrder] = await promisePool.execute(
      'SELECT fulfillment_review_required FROM orders WHERE reference = ?',
      [reconciliationReference]
    ).then(([rows]) => rows);
    assert.equal(reviewOrder.fulfillment_review_required, false, 'Successful reassignment clears the fulfillment review.');

    const [inventoryResult] = await promisePool.execute(
      `INSERT INTO merchandise (title, description, price, stock_quantity, catalog_status)
       VALUES (?, ?, ?, ?, 'published')`,
      ['Concurrent inventory item', 'Integration-only inventory', 25, 1]
    );
    const merchandiseItem = {
      type: 'merchandise',
      productId: inventoryResult.insertId,
      name: 'Concurrent inventory item',
      priceGhs: 25
    };
    const inventoryReferences = ['UBB-CONCURRENT-INVENTORY-A', 'UBB-CONCURRENT-INVENTORY-B'];
    for (const reference of inventoryReferences) {
      await insertPaidOrderCandidate(promisePool, { reference, amount: 25, item: merchandiseItem });
    }
    const inventoryResults = await Promise.all(inventoryReferences.map(reference => postSignedWebhook(baseUrl, {
      event: 'charge.success',
      data: { reference, status: 'success', amount: 2500, currency: 'GHS' }
    }, config.paystackSecretKey)));
    assert.ok(inventoryResults.every(result => result.status === 200), 'Both inventory webhook deliveries are acknowledged.');
    assert.equal(inventoryResults.filter(result => result.body.conflict === 'merchandise_out_of_stock').length, 1);
    assert.equal(inventoryResults.filter(result => result.body.received === true && !result.body.conflict).length, 1);
    const [inventoryRows] = await promisePool.execute(
      `SELECT m.stock_quantity,
        (SELECT COUNT(*) FROM orders WHERE reference IN (?, ?) AND status = 'paid') AS paid_orders
       FROM merchandise m WHERE m.id = ?`,
      [...inventoryReferences, inventoryResult.insertId]
    );
    assert.equal(Number(inventoryRows[0].stock_quantity), 0, 'Concurrent purchases must not oversell inventory.');
    assert.equal(Number(inventoryRows[0].paid_orders), 1, 'Only the purchase that reserved stock may be marked paid.');
  } finally {
    if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    loaded?.restore();
    await pool.end();
  }
});
