const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedOrigin } = require('../services/cors-origin');

test('allows requests without an Origin header and the configured frontend origin', () => {
  assert.equal(isAllowedOrigin(undefined, 'http://localhost:5500'), true);
  assert.equal(isAllowedOrigin('http://localhost:5500', 'http://localhost:5500'), true);
});

test('allows localhost aliases only in development on the configured port and scheme', () => {
  assert.equal(isAllowedOrigin('http://127.0.0.1:5500', 'http://localhost:5500', true), true);
  assert.equal(isAllowedOrigin('http://localhost:5500', 'http://127.0.0.1:5500', true), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:5501', 'http://localhost:5500', true), false);
  assert.equal(isAllowedOrigin('https://127.0.0.1:5500', 'http://localhost:5500', true), false);
});

test('rejects non-local origins and keeps production origin matching strict', () => {
  assert.equal(isAllowedOrigin('https://example.com', 'http://localhost:5500', true), false);
  assert.equal(isAllowedOrigin('http://127.0.0.1:5500', 'http://localhost:5500', false), false);
  assert.equal(isAllowedOrigin('not an origin', 'http://localhost:5500', true), false);
});
