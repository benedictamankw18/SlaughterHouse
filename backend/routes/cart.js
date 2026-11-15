const express = require('express');
const database = require('../database');
const sessions = require('../session-store');
const { databaseError } = require('../services/error-messages');
const { rateLimit } = require('../services/rate-limit');
const logger = require('../services/logger');
const {
  cartItemKey,
  safeJsonParse,
  validateCartItem,
  mergeCartItems,
  isValidGuestCartId
} = require('../services/cart');

const router = express.Router();
const queryOne = (query, parameters = []) => new Promise((resolve, reject) => database.get(query, parameters, (error, row) => error ? reject(error) : resolve(row)));
const runQuery = (query, parameters = []) => new Promise((resolve, reject) => database.run(query, parameters, function (error) { error ? reject(error) : resolve(this); }));

router.use(express.json());

// Cart rate limit: generous for browsing cart operations
router.use('/cart', rateLimit({ windowMs: 60 * 1000, max: 120, message: 'Too many cart requests. Try again shortly.' }));

// Populate request.customer for authenticated customers while still allowing guests.
router.use(sessions.allowVisitor);

/**
 * Resolve cart scope. An authenticated customer is always scoped to their own
 * session user id; the X-Cart-Id header is ignored entirely so a customer can
 * never select another cart. Guests must present a validated cart id header.
 */
function resolveCartScope(request) {
  if (request.customer && request.customer.id) return { userId: request.customer.id };
  const header = request.get('X-Cart-Id');
  if (!header) return {};
  if (!isValidGuestCartId(header)) return { error: 'A valid cart id is required.' };
  return { cartId: header };
}

function scopeWhere(scope) {
  return scope.userId
    ? { where: 'user_id = ?', column: 'user_id', value: scope.userId }
    : { where: 'cart_id = ?', column: 'cart_id', value: scope.cartId };
}

/**
 * GET /api/cart - return cart items for the current user/guest.
 */
router.get('/cart', async (request, response) => {
  const scope = resolveCartScope(request);
  if (scope.error) return response.status(400).json({ error: scope.error });
  if (!scope.userId && !scope.cartId) return response.json({ items: [] });

  try {
    const { where, value } = scopeWhere(scope);
    const row = await queryOne(`SELECT items_json FROM carts WHERE ${where}`, [value]);
    response.json({ items: row ? safeJsonParse(row.items_json) : [] });
  } catch (error) {
    logger.error('cart_get_failed', {
      requestId: request.requestId,
      code: error?.code,
      message: error?.message,
      detail: error?.detail,
      userId: scope.userId,
      cartId: scope.cartId,
    });
    response.status(500).json({ error: databaseError('Loading cart failed.', error) });
  }
});

/**
 * POST /api/cart - add or update a cart item.
 * Body: { item: {...} } or { items: [...] }
 */
router.post('/cart', async (request, response) => {
  const scope = resolveCartScope(request);
  if (scope.error) return response.status(400).json({ error: scope.error });
  if (!scope.userId && !scope.cartId) {
    return response.status(400).json({ error: 'No cart scope available. Sign in or provide a cart id.' });
  }

  const { item, items } = request.body || {};
  const incomingItems = items || (item ? [item] : []);
  if (!Array.isArray(incomingItems) || !incomingItems.length) {
    return response.status(400).json({ error: 'No items provided.' });
  }
  for (const candidate of incomingItems) {
    const error = validateCartItem(candidate);
    if (error) return response.status(400).json({ error: error.error });
  }

  try {
    const { where, column, value } = scopeWhere(scope);
    const mergedItems = await database.transaction(async transaction => {
      // Create the row if it does not exist yet. Concurrent creators wait on
      // the unique index and then continue with the locked read below.
      await transaction.run(
        `INSERT INTO carts (${column}, items_json) VALUES (?, '[]') ON CONFLICT DO NOTHING`,
        [value]
      );
      const row = await transaction.get(`SELECT items_json FROM carts WHERE ${where} FOR UPDATE`, [value]);
      const merged = mergeCartItems(safeJsonParse(row?.items_json), incomingItems);
      await transaction.run(
        `UPDATE carts SET items_json = ?, updated_at = CURRENT_TIMESTAMP WHERE ${where}`,
        [JSON.stringify(merged), value]
      );
      return merged;
    });

    response.json({ items: mergedItems });
  } catch (error) {
    logger.error('cart_post_failed', {
      requestId: request.requestId,
      code: error?.code,
      message: error?.message,
      detail: error?.detail,
      userId: scope.userId,
      cartId: scope.cartId,
    });
    response.status(500).json({ error: databaseError('Saving cart failed.', error) });
  }
});

/**
 * DELETE /api/cart/:itemKey - remove a single cart item by its cart item key.
 */
router.delete('/cart/:itemKey', async (request, response) => {
  const scope = resolveCartScope(request);
  if (scope.error) return response.status(400).json({ error: scope.error });
  if (!scope.userId && !scope.cartId) {
    return response.status(400).json({ error: 'No cart scope available.' });
  }

  const itemKey = String(request.params.itemKey || '');
  if (!itemKey || itemKey.length > 255) {
    return response.status(400).json({ error: 'A valid cart item key is required.' });
  }

  try {
    const { where, value } = scopeWhere(scope);
    const filteredItems = await database.transaction(async transaction => {
      const row = await transaction.get(`SELECT items_json FROM carts WHERE ${where} FOR UPDATE`, [value]);
      if (!row) return [];
      const filtered = safeJsonParse(row.items_json).filter(candidate => cartItemKey(candidate) !== itemKey);
      await transaction.run(
        `UPDATE carts SET items_json = ?, updated_at = CURRENT_TIMESTAMP WHERE ${where}`,
        [JSON.stringify(filtered), value]
      );
      return filtered;
    });

    response.json({ items: filteredItems });
  } catch (error) {
    response.status(500).json({ error: databaseError('Removing cart item failed.', error) });
  }
});

/**
 * DELETE /api/cart - clear all cart items.
 */
router.delete('/cart', async (request, response) => {
  const scope = resolveCartScope(request);
  if (scope.error) return response.status(400).json({ error: scope.error });
  if (!scope.userId && !scope.cartId) {
    return response.status(400).json({ error: 'No cart scope available.' });
  }

  try {
    const { where, value } = scopeWhere(scope);
    await runQuery(`DELETE FROM carts WHERE ${where}`, [value]);
    response.json({ items: [] });
  } catch (error) {
    response.status(500).json({ error: databaseError('Clearing cart failed.', error) });
  }
});

module.exports = router;
