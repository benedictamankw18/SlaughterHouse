const test = require('node:test');
const assert = require('node:assert/strict');
const {
  cartItemKey,
  safeJsonParse,
  validateCartItem,
  mergeCartItems,
  isValidGuestCartId
} = require('../services/cart');

const cartItem = (overrides = {}) => ({
  type: 'beat',
  productId: 7,
  name: 'Test Beat',
  license: 'basic',
  price: 25,
  priceCurrency: 'USD',
  selected: true,
  ...overrides
});

test('cart item keys match the storefront key format', () => {
  assert.equal(cartItemKey(cartItem()), 'beat|id:7|basic');
  assert.equal(cartItemKey(cartItem({ license: 'PREMIUM' })), 'beat|id:7|premium');
  assert.equal(
    cartItemKey({ type: 'merchandise', productId: 9, name: 'Tour Shirt' }),
    'merchandise|id:9|'
  );
  assert.equal(
    cartItemKey({ type: 'beat', productId: null, name: '  Fallback Beat ', license: 'basic' }),
    'beat|name:fallback beat|basic'
  );
});

test('cart merging replaces duplicate keys and keeps insertion order', () => {
  const first = cartItem({ name: 'Original' });
  const second = cartItem({ productId: 8, license: 'premium', name: 'Second' });
  const replacement = cartItem({ name: 'Replacement' });
  const merged = mergeCartItems([first, second], [replacement, cartItem({ productId: 10, license: 'basic' })]);
  assert.deepEqual(merged.map(item => item.name), ['Replacement', 'Second', 'Test Beat']);
  assert.deepEqual(mergeCartItems([], [first]), [first]);
  assert.deepEqual(mergeCartItems(null, null), []);
});

test('safeJsonParse tolerates legacy and PostgreSQL values', () => {
  assert.deepEqual(safeJsonParse('[{"a":1}]'), [{ a: 1 }]);
  assert.deepEqual(safeJsonParse([{ a: 1 }]), [{ a: 1 }]);
  assert.deepEqual(safeJsonParse('[object Object]'), []);
  assert.deepEqual(safeJsonParse(null), []);
  assert.deepEqual(safeJsonParse('', ['fallback']), ['fallback']);
});

test('cart item validation mirrors the cart API contract', () => {
  assert.equal(validateCartItem(cartItem()), null);
  assert.equal(validateCartItem(cartItem({ type: 'merchandise', license: '' })), null);
  assert.match(validateCartItem(null).error, /Item is required/);
  assert.match(validateCartItem(cartItem({ type: 'booking' })).error, /type/);
  assert.match(validateCartItem(cartItem({ productId: 0 })).error, /product ID/);
  assert.match(validateCartItem(cartItem({ name: '   ' })).error, /name/);
  assert.match(validateCartItem(cartItem({ price: -1 })).error, /price/);
  assert.match(validateCartItem(cartItem({ priceCurrency: 'BTC' })).error, /currency/);
  assert.match(validateCartItem(cartItem({ license: 'legacy' })).error, /license/);
  assert.match(validateCartItem(cartItem({ selected: 'yes' })).error, /selected/);
});

test('guest cart ids accept UUIDs and timestamp fallbacks only', () => {
  assert.equal(isValidGuestCartId('3f2c9d1e-6b7a-4c8d-9e0f-1a2b3c4d5e6f'), true);
  assert.equal(isValidGuestCartId('1750000000000-abc123xy'), true);
  assert.equal(isValidGuestCartId('guest_cart-01'), true);
  assert.equal(isValidGuestCartId('short'), false);
  assert.equal(isValidGuestCartId('has spaces here'), false);
  assert.equal(isValidGuestCartId('slash/not/allowed'), false);
  assert.equal(isValidGuestCartId('a'.repeat(65)), false);
  assert.equal(isValidGuestCartId(''), false);
  assert.equal(isValidGuestCartId(null), false);
  assert.equal(isValidGuestCartId(42), false);
});
