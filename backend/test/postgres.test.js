const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isInsertWithId,
  summarizeResult,
  toPostgresQuery,
  withReturningId
} = require('../services/postgres');

test('PostgreSQL placeholder conversion skips quoted strings, identifiers, and comments', () => {
  const query = `SELECT ?, '?', "?", \`?\` -- ?
    /* ? */ WHERE value = ?`;
  assert.equal(
    toPostgresQuery(query),
    `SELECT $1, '?', "?", "?" -- ?
    /* ? */ WHERE value = $2`
  );
});

test('PostgreSQL insert IDs are requested only from tables with generated IDs', () => {
  assert.equal(withReturningId('INSERT INTO users (name) VALUES (?)'), 'INSERT INTO users (name) VALUES (?) RETURNING id');
  assert.equal(withReturningId('INSERT INTO settings (setting_key) VALUES (?)'), 'INSERT INTO settings (setting_key) VALUES (?)');
  assert.equal(withReturningId('INSERT INTO users (name) VALUES (?) RETURNING id'), 'INSERT INTO users (name) VALUES (?) RETURNING id');
  assert.equal(isInsertWithId('INSERT INTO email_outbox (idempotency_key) VALUES (?)'), true);
});

test('PostgreSQL results retain the legacy database helper result fields', () => {
  const result = summarizeResult({ rows: [{ id: '18' }], rowCount: 1, command: 'INSERT' });
  assert.equal(result.insertId, 18);
  assert.equal(result.affectedRows, 1);
  assert.equal(result.command, 'INSERT');
});
