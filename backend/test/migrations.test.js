const test = require('node:test');
const assert = require('node:assert/strict');
const { migrations, applyMigrations, preparePostgresStatement } = require('../services/migrations');

function fakePool(appliedVersions = new Set(), existingColumns = new Set()) {
  const statements = [];
  return {
    statements,
    async query(query, parameters = []) {
      if (/^CREATE OR REPLACE FUNCTION|^CREATE TABLE IF NOT EXISTS schema_migrations|^SELECT pg_advisory_(?:lock|unlock)/.test(query)) return { rows: [], rowCount: 0 };
      if (/^SELECT version FROM schema_migrations/.test(query)) {
        return { rows: appliedVersions.has(parameters[0]) ? [{ version: parameters[0] }] : [], rowCount: 1 };
      }
      if (/^INSERT INTO schema_migrations/.test(query)) {
        appliedVersions.add(parameters[0]);
        return { rows: [], rowCount: 1 };
      }
      if (/FROM information_schema\.columns/.test(query)) {
        return { rows: [{ count: existingColumns.has(`${parameters[0]}.${parameters[1]}`) ? 1 : 0 }], rowCount: 1 };
      }
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(query)) return { rows: [], rowCount: 0 };
      statements.push(query);
      const addedColumn = query.match(/^ALTER TABLE ([a-z0-9_]+) ADD COLUMN (?:IF NOT EXISTS )?([a-z0-9_]+)/i);
      if (addedColumn) existingColumns.add(`${addedColumn[1]}.${addedColumn[2]}`);
      return { rows: [], rowCount: 1 };
    }
  };
}

test('migration versions are unique and strictly increasing', () => {
  const versions = migrations.map(migration => migration.version);
  assert.deepEqual(versions, [...new Set(versions)], 'versions must be unique');
  assert.deepEqual(versions, [...versions].sort((left, right) => left - right), 'versions must be ordered');
  for (const migration of migrations) {
    assert.ok(Array.isArray(migration.statements) && migration.statements.length, `migration ${migration.version} has statements`);
  }
});

test('migration 0 explicitly creates users, roles, beats, and per-license prices', () => {
  const migration = migrations.find(candidate => candidate.version === 0);
  assert.ok(migration, 'migration 0 must exist');
  const sql = migration.statements.join('\n');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS users/);
  assert.match(sql, /email VARCHAR\(255\) NOT NULL UNIQUE/);
  assert.match(sql, /role VARCHAR\(50\) NOT NULL DEFAULT 'non_artist'/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS beats/);
  for (const column of ['basic_price', 'premium_price', 'unlimited_price', 'exclusive_price']) {
    assert.match(sql, new RegExp(`${column} DECIMAL\\(12,2\\)`));
  }
});

test('migration 19 replaces legacy startup column alterations with ordered guards', () => {
  const migration = migrations.find(candidate => candidate.version === 19);
  assert.ok(migration, 'migration 19 must exist');
  const ensuredColumns = migration.statements.map(statement => statement.ensureColumn);
  assert.ok(ensuredColumns.every(Boolean), 'legacy schema changes must use guarded migration steps');
  assert.ok(ensuredColumns.some(column => column.table === 'users' && column.column === 'email_verified_at'));
  assert.ok(ensuredColumns.some(column => column.table === 'bookings' && column.column === 'payment_reference'));
  assert.ok(ensuredColumns.some(column => column.table === 'customization_requests' && column.column === 'sample_audio_file'));
});

test('migration 20 moves the curated stream catalog into the database', () => {
  const migration = migrations.find(candidate => candidate.version === 20);
  assert.ok(migration, 'migration 20 must exist');
  const sql = migration.statements.join('\n');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS stream_releases/);
  assert.match(sql, /credits_json JSON NOT NULL/);
  assert.match(sql, /links_json JSON NOT NULL/);
  assert.match(sql, /status VARCHAR\(20\) NOT NULL DEFAULT 'published'/);
  assert.equal(migration.statements.filter(statement => statement.startsWith('INSERT IGNORE INTO stream_releases')).length, 15);
});

test('migration 21 adds a published catalog status to merchandise', () => {
  const migration = migrations.find(candidate => candidate.version === 21);
  assert.ok(migration, 'migration 21 must exist');
  assert.match(migration.statements[0], /ALTER TABLE merchandise ADD COLUMN catalog_status VARCHAR\(20\) NOT NULL DEFAULT 'published'/);
  assert.match(migration.statements[1], /ALTER TABLE merchandise ADD INDEX idx_merchandise_catalog_status/);
});

test('migration 22 tracks availability for the built-in license definitions', () => {
  const migration = migrations.find(candidate => candidate.version === 22);
  assert.ok(migration, 'migration 22 must exist');
  assert.match(migration.statements[0], /CREATE TABLE IF NOT EXISTS license_definition_status/);
  assert.match(migration.statements[0], /is_active BOOLEAN NOT NULL DEFAULT TRUE/);
  for (const licenseType of ['basic', 'premium', 'unlimited', 'exclusive']) {
    assert.ok(migration.statements.some(statement => statement.includes(`('${licenseType}')`)));
  }
});

test('migration 28 converts existing license availability values to PostgreSQL booleans', () => {
  const migration = migrations.find(candidate => candidate.version === 28);
  assert.ok(migration, 'migration 28 must exist');
  assert.deepEqual(migration.statements, [
    'ALTER TABLE license_definition_status ALTER COLUMN is_active DROP DEFAULT',
    "ALTER TABLE license_definition_status ALTER COLUMN is_active TYPE BOOLEAN USING (is_active::text IN ('1', 't', 'true'))",
    'ALTER TABLE license_definition_status ALTER COLUMN is_active SET DEFAULT TRUE'
  ]);
});

test('migration 29 creates shared rate-limit storage', () => {
  const migration = migrations.find(candidate => candidate.version === 29);
  assert.ok(migration, 'migration 29 must exist');
  assert.match(migration.statements[0], /CREATE TABLE IF NOT EXISTS rate_limit_buckets/);
  assert.match(migration.statements[0], /bucket_key CHAR\(64\) PRIMARY KEY/);
  assert.match(migration.statements[1], /idx_rate_limit_buckets_expiry/);
});

test('migration 30 adds expiring booking holds and lookup indexes', () => {
  const migration = migrations.find(candidate => candidate.version === 30);
  assert.ok(migration, 'migration 30 must exist');
  assert.deepEqual(migration.statements.slice(0, 2).map(statement => statement.ensureColumn), [
    { table: 'booking_availability', column: 'booking_order_reference', definition: 'VARCHAR(255) NULL' },
    { table: 'booking_availability', column: 'hold_expires_at', definition: 'TIMESTAMP NULL' }
  ]);
  assert.match(migration.statements[2], /idx_booking_availability_hold_expiry/);
  assert.match(migration.statements[3], /idx_booking_availability_order_reference/);
});

test('migration 31 adds durable paid-order fulfillment review fields', () => {
  const migration = migrations.find(candidate => candidate.version === 31);
  assert.ok(migration, 'migration 31 must exist');
  assert.deepEqual(migration.statements.slice(0, 3).map(statement => statement.ensureColumn), [
    { table: 'orders', column: 'fulfillment_review_required', definition: 'BOOLEAN NOT NULL DEFAULT FALSE' },
    { table: 'orders', column: 'fulfillment_review_reason', definition: 'TEXT NULL' },
    { table: 'orders', column: 'fulfillment_reviewed_at', definition: 'TIMESTAMP NULL' }
  ]);
  assert.match(migration.statements[3], /idx_orders_fulfillment_review/);
});

test('migration 32 timestamps pricing updates and snapshots order exchange rates', () => {
  const migration = migrations.find(candidate => candidate.version === 32);
  assert.ok(migration, 'migration 32 must exist');
  assert.deepEqual(migration.statements.map(statement => statement.ensureColumn), [
    { table: 'settings', column: 'updated_at', definition: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { table: 'order_items', column: 'exchange_rate', definition: 'DECIMAL(12,6) NULL' }
  ]);
});

test('migration 33 adds encrypted administrator MFA state and one-time challenges', () => {
  const migration = migrations.find(candidate => candidate.version === 33);
  assert.ok(migration, 'migration 33 must exist');
  assert.deepEqual(migration.statements.slice(0, 3).map(statement => statement.ensureColumn), [
    { table: 'users', column: 'admin_mfa_secret', definition: 'TEXT NULL' },
    { table: 'users', column: 'admin_mfa_enabled_at', definition: 'TIMESTAMP NULL' },
    { table: 'users', column: 'admin_mfa_last_counter', definition: 'BIGINT NULL' }
  ]);
  const sql = migration.statements.join('\n');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS admin_mfa_challenges/);
  assert.match(sql, /token_hash CHAR\(64\) NOT NULL UNIQUE/);
  assert.match(sql, /pending_secret TEXT NULL/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS admin_mfa_recovery_codes/);
  assert.match(sql, /used_at TIMESTAMP NULL/);
});

test('migration 23 stores certificates and immutable administrative history', () => {
  const migration = migrations.find(candidate => candidate.version === 23);
  assert.ok(migration, 'migration 23 must exist');
  const sql = migration.statements.join('\n');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS license_certificates/);
  assert.match(sql, /verification_token_hash CHAR\(64\) NOT NULL UNIQUE/);
  assert.match(sql, /license_terms_snapshot JSON NOT NULL/);
  assert.match(sql, /reissued_from_id BIGINT NULL/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS license_certificate_history/);
  assert.match(sql, /reason VARCHAR\(500\) NULL/);
  assert.match(sql, /ON DELETE RESTRICT/);
});

test('migration 24 adds a nullable CSRF token hash to existing sessions', () => {
  const migration = migrations.find(candidate => candidate.version === 24);
  assert.ok(migration, 'migration 24 must exist');
  assert.deepEqual(migration.statements[0].ensureColumn, {
    table: 'user_sessions',
    column: 'csrf_token_hash',
    definition: 'CHAR(64) NULL'
  });
});

test('migration 25 adds an optional expiry without changing existing licenses', () => {
  const migration = migrations.find(candidate => candidate.version === 25);
  assert.ok(migration, 'migration 25 must exist');
  assert.equal(migration.statements.length, 1);
  assert.deepEqual(migration.statements[0].ensureColumn, {
    table: 'licenses',
    column: 'expires_at',
    definition: 'DATETIME NULL'
  });
});

test('migration 26 keeps the license expiry optional on upgraded databases', () => {
  const migration = migrations.find(candidate => candidate.version === 26);
  assert.equal(preparePostgresStatement(migration.statements[0]).query,
    'ALTER TABLE licenses ALTER COLUMN expires_at DROP NOT NULL');
});

test('migration 11 adds an idempotent per-order-line key to sales', () => {
  const migration = migrations.find(candidate => candidate.version === 11);
  assert.ok(migration, 'migration 11 must exist');
  const sql = migration.statements.join('\n');
  assert.match(sql, /ALTER TABLE sales ADD COLUMN order_reference/);
  assert.match(sql, /ALTER TABLE sales ADD COLUMN line_index/);
  assert.match(sql, /ALTER TABLE sales ADD UNIQUE KEY uq_sales_order_line \(order_reference, line_index\)/);
});

test('migration 12 adds configurable license rights and license revocation', () => {
  const migration = migrations.find(candidate => candidate.version === 12);
  assert.ok(migration, 'migration 12 must exist');
  const sql = migration.statements.join('\n');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS license_rights/);
  for (const licenseType of ['basic', 'premium', 'unlimited', 'exclusive']) {
    assert.match(sql, new RegExp(`INSERT IGNORE INTO license_rights .*'${licenseType}'`));
  }
  assert.match(sql, /ALTER TABLE licenses ADD COLUMN revoked_at TIMESTAMP NULL/);
  assert.match(sql, /ALTER TABLE licenses ADD COLUMN revoked_reason VARCHAR\(255\) NULL/);
});

test('migration 13 adds fulfillment tracking and refund accounting to orders', () => {
  const migration = migrations.find(candidate => candidate.version === 13);
  assert.ok(migration, 'migration 13 must exist');
  const sql = migration.statements.join('\n');
  assert.match(sql, /ALTER TABLE orders ADD COLUMN fulfillment_status VARCHAR\(50\) NOT NULL DEFAULT 'unfulfilled'/);
  assert.match(sql, /ALTER TABLE orders ADD COLUMN refunded_amount DECIMAL\(12,2\) NOT NULL DEFAULT 0/);
  assert.match(sql, /ALTER TABLE orders ADD COLUMN refunded_at TIMESTAMP NULL/);
});

test('migration 14 removes implicit auto-update from token expiry columns', () => {
  const migration = migrations.find(candidate => candidate.version === 14);
  assert.ok(migration, 'migration 14 must exist');
  const sql = migration.statements.join('\n');
  assert.match(sql, /ALTER TABLE user_sessions MODIFY COLUMN expires_at DATETIME NOT NULL/);
  assert.match(sql, /ALTER TABLE account_tokens MODIFY COLUMN expires_at DATETIME NOT NULL/);
  assert.doesNotMatch(sql, /ON UPDATE CURRENT_TIMESTAMP/);
});

test('migration 15 creates a retryable, idempotent email outbox', () => {
  const migration = migrations.find(candidate => candidate.version === 15);
  assert.ok(migration, 'migration 15 must exist');
  const sql = migration.statements.join('\n');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS email_outbox/);
  assert.match(sql, /idempotency_key VARCHAR\(255\) NOT NULL UNIQUE/);
  assert.match(sql, /recipient VARCHAR\(320\) NOT NULL/);
  assert.match(sql, /status VARCHAR\(20\) NOT NULL DEFAULT 'pending'/);
  assert.match(sql, /attempts INT NOT NULL DEFAULT 0/);
  assert.match(sql, /next_attempt_at DATETIME NOT NULL/);
  assert.match(sql, /expires_at DATETIME NULL/);
  assert.match(sql, /locked_at DATETIME NULL/);
  assert.match(sql, /last_error VARCHAR\(255\) NULL/);
});

test('migration 16 adds an optional unique notification idempotency key', () => {
  const migration = migrations.find(candidate => candidate.version === 16);
  assert.ok(migration, 'migration 16 must exist');
  const sql = migration.statements.join('\n');
  assert.match(sql, /ALTER TABLE notifications ADD COLUMN dedupe_key VARCHAR\(255\) NULL/);
  assert.match(sql, /ALTER TABLE notifications ADD UNIQUE KEY uq_notifications_dedupe_key \(dedupe_key\)/);
});

test('migration 17 explicitly creates and indexes customer reviews', () => {
  const migration = migrations.find(candidate => candidate.version === 17);
  assert.ok(migration, 'migration 17 must exist');
  const sql = migration.statements.join('\n');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS customer_reviews/);
  assert.match(sql, /user_id INT NULL/);
  assert.match(sql, /rating TINYINT NOT NULL/);
  assert.match(sql, /status VARCHAR\(50\) NOT NULL DEFAULT 'pending'/);
  assert.match(sql, /created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP/);
  assert.match(sql, /ALTER TABLE customer_reviews ADD INDEX idx_customer_reviews_status_created \(status, created_at\)/);
});

test('migration 18 adds customer-readable order fulfillment history', () => {
  const migration = migrations.find(candidate => candidate.version === 18);
  assert.ok(migration, 'migration 18 must exist');
  const sql = migration.statements.join('\n');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS order_fulfillment_history/);
  assert.match(sql, /order_id INT NOT NULL/);
  assert.match(sql, /status VARCHAR\(50\) NOT NULL/);
  assert.match(sql, /changed_by INT NULL/);
  assert.match(sql, /FOREIGN KEY \(order_id\) REFERENCES orders\(id\) ON DELETE CASCADE/);
  assert.match(sql, /idx_order_fulfillment_history_order_created \(order_id, created_at\)/);
});

test('migration 35 adds idempotent request and review submission keys', () => {
  const migration = migrations.find(candidate => candidate.version === 35);
  assert.ok(migration, 'migration 35 must exist');
  assert.deepEqual(migration.statements.slice(0, 2).map(statement => statement.ensureColumn), [
    { table: 'customization_requests', column: 'submission_id', definition: 'VARCHAR(64) NULL' },
    { table: 'customer_reviews', column: 'submission_id', definition: 'VARCHAR(64) NULL' }
  ]);
  assert.match(migration.statements[2], /uq_customization_requests_submission/);
  assert.match(migration.statements[3], /uq_customer_reviews_submission/);
});

test('migration 36 seeds configurable booking availability defaults', () => {
  const migration = migrations.find(candidate => candidate.version === 36);
  assert.ok(migration, 'migration 36 must exist');
  const sql = migration.statements.join('\n');
  assert.match(sql, /INSERT IGNORE INTO settings/);
  for (const [key, value] of [
    ['booking_available_weekdays', '0,2,3,4'],
    ['booking_open_time', '11:00'],
    ['booking_close_time', '21:00'],
    ['booking_slot_step_minutes', '20'],
    ['booking_same_day_lead_minutes', '30'],
    ['booking_available_from', ''],
    ['booking_available_until', '']
  ]) {
    assert.match(sql, new RegExp(`\\('${key}', '${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\)`));
  }
});

test('applyMigrations runs every statement once and records each version', async () => {
  const pool = fakePool();
  await applyMigrations(pool);
  assert.ok(pool.statements.length >= migrations.reduce((total, migration) => total + migration.statements.length, 0));
  assert.match(pool.statements.join('\n'), /uq_sales_order_line/);

  const freshPool = fakePool();
  const allVersions = new Set(migrations.map(migration => migration.version));
  await applyMigrations(freshPool);
  const secondRun = fakePool(allVersions);
  await applyMigrations(secondRun);
  assert.equal(secondRun.statements.length, 0, 'already-applied migrations must not run again');
});

test('applyMigrations takes and releases a PostgreSQL advisory lock', async () => {
  const calls = [];
  const connection = {
    async query(query) {
      calls.push(query);
      if (/^SELECT version FROM schema_migrations/.test(query)) return { rows: [] };
      if (/FROM information_schema\.columns/.test(query)) return { rows: [{ count: 0 }] };
      return { rows: [] };
    },
    release() {
      calls.push('RELEASE');
    }
  };
  await applyMigrations({ async connect() { return connection; } });
  assert.equal(calls[0], 'SELECT pg_advisory_lock(90210, 29)');
  assert.equal(calls.at(-2), 'SELECT pg_advisory_unlock(90210, 29)');
  assert.equal(calls.at(-1), 'RELEASE');
});

test('applyMigrations resumes from the last recorded version', async () => {
  const applied = new Set(migrations.filter(migration => migration.version <= 18).map(migration => migration.version));
  const pool = fakePool(applied);
  await applyMigrations(pool);
  assert.ok(pool.statements.some(statement => statement.includes('CREATE TABLE IF NOT EXISTS stream_releases')));
  assert.ok(pool.statements.some(statement => statement === 'ALTER TABLE licenses ALTER COLUMN expires_at DROP NOT NULL'));
  assert.ok(pool.statements.every(statement => !statement.includes('AUTO_INCREMENT')));
});

test('applyMigrations skips existing legacy columns and applies the next migration', async () => {
  const applied = new Set(migrations.filter(migration => migration.version <= 18).map(migration => migration.version));
  const existingColumns = new Set(migrations.find(migration => migration.version === 19).statements.map(({ ensureColumn }) =>
    `${ensureColumn.table}.${ensureColumn.column}`
  ));
  const pool = fakePool(applied, existingColumns);
  await applyMigrations(pool);
  assert.ok(pool.statements.some(statement => statement.includes('CREATE TABLE IF NOT EXISTS stream_releases')));
  assert.ok(!pool.statements.some(statement => statement.includes('ADD COLUMN email_verified_at')));
  assert.ok(pool.statements.some(statement => statement.includes('ADD COLUMN IF NOT EXISTS expires_at')));
});

test('PostgreSQL migration conversion handles identities, types, indexes, and conflict-safe seeds', () => {
  const converted = preparePostgresStatement(`CREATE TABLE IF NOT EXISTS sample (
    id INT PRIMARY KEY AUTO_INCREMENT,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    metadata JSON,
    INDEX idx_sample_enabled (enabled),
    UNIQUE KEY uq_sample_metadata (metadata)
  )`);
  assert.match(converted.query, /GENERATED BY DEFAULT AS IDENTITY/);
  assert.match(converted.query, /enabled SMALLINT NOT NULL DEFAULT 1/);
  assert.match(converted.query, /metadata JSONB/);
  assert.equal(converted.indexes.length, 2);
  assert.match(converted.indexes[0].query, /CREATE INDEX IF NOT EXISTS idx_sample_enabled/);
  assert.match(converted.indexes[1].query, /CREATE UNIQUE INDEX IF NOT EXISTS uq_sample_metadata/);

  const seed = preparePostgresStatement('INSERT IGNORE INTO settings (setting_key) VALUES (\'x\')');
  assert.equal(seed.query, "INSERT INTO settings (setting_key) VALUES ('x') ON CONFLICT DO NOTHING");
});

test('all versioned migration statements are converted away from MySQL-only syntax', () => {
  for (const migration of migrations) {
    for (const statement of migration.statements) {
      if (typeof statement !== 'string') continue;
      const { query } = preparePostgresStatement(statement);
      assert.doesNotMatch(
        query,
        /\bAUTO_INCREMENT\b|\bINSERT\s+IGNORE\b|\bTINYINT\b|\bDATETIME\b|\bMODIFY COLUMN\b|\bADD INDEX\b|\bADD UNIQUE KEY\b/i,
        `migration ${migration.version} has unconverted SQL`
      );
    }
  }
});
