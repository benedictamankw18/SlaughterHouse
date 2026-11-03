const test = require('node:test');
const assert = require('node:assert/strict');
const { migrations, applyMigrations } = require('../services/migrations');

function fakePool(appliedVersions = new Set()) {
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
      statements.push(query);
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
  const applied = new Set(migrations.filter(migration => migration.version <= 13).map(migration => migration.version));
  const pool = fakePool(applied);
  await applyMigrations(pool);
  const expected = migrations.find(migration => migration.version === 14);
  assert.deepEqual(pool.statements, expected.statements);
});
