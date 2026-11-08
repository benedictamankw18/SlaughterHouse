const test = require('node:test');
const assert = require('node:assert/strict');
const { findDatabaseDumps } = require('../scripts/check-database-dumps');

test('database dump protection flags exports and backup formats but permits application SQL', () => {
  assert.deepEqual(findDatabaseDumps([
    'db/customer-export.sql',
    'db/archive.dump',
    'backend/data/app.db',
    'backend/data/snapshot.sqlite3',
    'backend/migrations/20261108-schema.sql',
    'backend/scripts/check-database-dumps.js'
  ]), [
    'db/customer-export.sql',
    'db/archive.dump',
    'backend/data/app.db',
    'backend/data/snapshot.sqlite3'
  ]);
});
