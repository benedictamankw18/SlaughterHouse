const test = require('node:test');
const assert = require('node:assert/strict');
const validators = require('../services/input-validation');

test('text trims, enforces required values, and caps length', () => {
  assert.equal(validators.text('  hello  ', 'Name'), null);
  assert.equal(validators.text('   ', 'Name', { required: true }), 'Name is required.');
  assert.equal(validators.text(null, 'Name', { required: true }), 'Name is required.');
  assert.equal(validators.text('abc', 'Name', { max: 2 }), 'Name must be 2 characters or fewer.');
});

test('email accepts normal addresses and rejects malformed ones', () => {
  assert.equal(validators.email('User@Example.com'), null);
  assert.equal(validators.email('user@example'), 'Email must be a valid email address.');
  assert.equal(validators.email('user example.com'), 'Email must be a valid email address.');
  assert.equal(validators.email(''), 'Email must be a valid email address.');
});

test('phone accepts common characters and rejects short or invalid values', () => {
  assert.equal(validators.phone('+233 24 000 0000'), null);
  assert.equal(validators.phone('12345'), 'Phone number must contain 7–30 valid phone characters.');
  assert.equal(validators.phone('024abc0000'), 'Phone number must contain 7–30 valid phone characters.');
  assert.equal(validators.phone(null), 'Phone number must contain 7–30 valid phone characters.');
});

test('integer enforces whole numbers and bounds', () => {
  assert.equal(validators.integer(3, 'Count', { min: 1, max: 5 }), null);
  assert.equal(validators.integer('3', 'Count', { min: 1, max: 5 }), null);
  assert.equal(validators.integer(3.5, 'Count', { min: 1, max: 5 }), 'Count must be a whole number.');
  assert.equal(validators.integer(0, 'Count', { min: 1, max: 5 }), 'Count must be between 1 and 5.');
  assert.equal(validators.integer(6, 'Count', { min: 1, max: 5 }), 'Count must be between 1 and 5.');
  assert.equal(validators.integer('', 'Count', { min: 1, max: 5, required: false }), null);
});

test('money requires a positive finite amount within the ceiling', () => {
  assert.equal(validators.money(10, 'Amount'), null);
  assert.equal(validators.money('10.50', 'Amount'), null);
  assert.equal(validators.money(0, 'Amount'), 'Amount must be greater than 0 and no more than 100,000,000.');
  assert.equal(validators.money(-1, 'Amount'), 'Amount must be greater than 0 and no more than 100,000,000.');
  assert.equal(validators.money(Infinity, 'Amount'), 'Amount must be greater than 0 and no more than 100,000,000.');
  assert.equal(validators.money(100000001, 'Amount'), 'Amount must be greater than 0 and no more than 100,000,000.');
  assert.equal(validators.money('', 'Amount', { required: false }), null);
});
