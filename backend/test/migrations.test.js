const test = require('node:test');
const assert = require('node:assert/strict');
const { migrations, applyMigrations } = require('../services/migrations');

function fakePool(appliedVersions = new Set(), existingColumns = new Set()) {
  const statements = [];
  return {
    statements,
    query(query, parameters, callback) {
      if (/^CREATE TABLE IF NOT EXISTS schema_migrations/.test(query)) return callback(null, {});
      if (/^SELECT version FROM schema_migrations/.test(query)) {
        return callback(null, appliedVersions.has(parameters[0]) ? [{ version: parameters[0] }] : []);
      }
      if (/^INSERT INTO schema_migrations/.test(query)) {
        appliedVersions.add(parameters[0]);
        return callback(null, {});
      }
      if (/FROM information_schema\.COLUMNS/.test(query)) {
        return callback(null, [{ count: existingColumns.has(`${parameters[0]}.${parameters[1]}`) ? 1 : 0 }]);
      }
      statements.push(query);
      const addedColumn = query.match(/^ALTER TABLE `([^`]+)` ADD COLUMN `([^`]+)`/);
      if (addedColumn) existingColumns.add(`${addedColumn[1]}.${addedColumn[2]}`);
      callback(null, {});
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

test('applyMigrations resumes from the last recorded version', async () => {
  const applied = new Set(migrations.filter(migration => migration.version <= 18).map(migration => migration.version));
  const pool = fakePool(applied);
  await applyMigrations(pool);
  const expected = migrations.find(migration => migration.version === 19).statements.map(({ ensureColumn: { table, column, definition } }) =>
    `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`
  ).concat(migrations.find(migration => migration.version === 20).statements);
  assert.deepEqual(pool.statements, expected);
});

test('applyMigrations skips existing legacy columns and applies the next migration', async () => {
  const applied = new Set(migrations.filter(migration => migration.version <= 18).map(migration => migration.version));
  const existingColumns = new Set(migrations.find(migration => migration.version === 19).statements.map(({ ensureColumn }) =>
    `${ensureColumn.table}.${ensureColumn.column}`
  ));
  const pool = fakePool(applied, existingColumns);
  await applyMigrations(pool);
  assert.deepEqual(pool.statements, migrations.find(migration => migration.version === 20).statements);
});
