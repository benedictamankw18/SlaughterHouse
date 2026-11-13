const express = require('express');
const database = require('../database');
const sessions = require('../session-store');
const { requireCustomer } = sessions;
const { databaseError } = require('../services/error-messages');
const { rateLimit } = require('../services/rate-limit');

const router = express.Router();
const queryRows = (query, parameters = []) => new Promise((resolve, reject) => database.all(query, parameters, (error, rows) => error ? reject(error) : resolve(rows || [])));
const queryOne = (query, parameters = []) => new Promise((resolve, reject) => database.get(query, parameters, (error, row) => error ? reject(error) : resolve(row)));
const runQuery = (query, parameters = []) => new Promise((resolve, reject) => database.run(query, parameters, function (error) { error ? reject(error) : resolve(this); }));

router.use(express.json());

// Cart rate limit: generous for browsing cart operations
router.use(rateLimit({ windowMs: 60 * 1000, max: 120, message: 'Too many cart requests. Try again shortly.' }));

/**
 * Resolve cart scope: authenticated users use user_id; guests use cart_id header.
 * Returns { userId, cartId } where exactly one is set.
 */
function resolveCartScope(request) {
  const userId = request.customer && request.customer.id ? request.customer.id : null;
  const cartId = request.headers['x-cart-id'] || null;
  return { userId, cartId };
}

/**
 * Validate cart item shape.
 */
function validateCartItem(item) {
  if (!item || typeof item !== 'object') return { error: 'Item is required.' };
  if (!item.type || !['beat', 'merchandise'].includes(item.type)) return { error: 'Item type must be "beat" or "merchandise".' };
  if (!item.productId || !Number.isFinite(Number(item.productId))) return { error: 'A valid product ID is required.' };
  if (!item.name || typeof item.name !== 'string' || !item.name.trim()) return { error: 'Item name is required.' };
  if (!item.price || !Number.isFinite(Number(item.price)) || Number(item.price) < 0) return { error: 'A valid price is required.' };
  if (!item.priceCurrency || !['GHS', 'USD', 'NGN', 'GBP', 'EUR'].includes(String(item.priceCurrency).toUpperCase())) return { error: 'A valid currency is required.' };
  if (item.type === 'beat' && (!item.license || !['basic', 'premium', 'unlimited', 'exclusive'].includes(String(item.license).toLowerCase()))) return { error: 'A valid license is required for beats.' };
  if (typeof item.selected !== 'boolean') return { error: 'selected flag is required.' };
  return null;
}

/**
 * Cart item key: "type:productId:license" for beats, "type:productId" for merchandise.
 */
function cartItemKey(item) {
  if (item.type === 'beat') return `beat:${item.productId}:${item.license}`;
  return `merchandise:${item.productId}`;
}

/**
 * GET /api/cart - return cart items for the current user/guest.
 */
router.get('/', async (request, response) => {
  try {
    const { userId, cartId } = resolveCartScope(request);
    let rows;
    if (userId) {
      const result = await queryOne('SELECT items_json FROM carts WHERE user_id = ?', [userId]);
      rows = result ? JSON.parse(result.items_json || '[]') : [];
    } else if (cartId) {
      const result = await queryOne('SELECT items_json FROM carts WHERE cart_id = ?', [cartId]);
      rows = result ? JSON.parse(result.items_json || '[]') : [];
    } else {
      return response.json({ items: [] });
    }
    response.json({ items: rows });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading cart failed.', error) });
  }
});

/**
 * POST /api/cart - add or update a cart item.
 * Body: { item: {...} } or { items: [...] }
 */
router.post('/', async (request, response) => {
  try {
    const { userId, cartId } = resolveCartScope(request);
    const { item, items } = request.body || {};

    const incomingItems = items || (item ? [item] : []);
    if (!incomingItems.length) return response.status(400).json({ error: 'No items provided.' });

    for (const candidate of incomingItems) {
      const error = validateCartItem(candidate);
      if (error) return response.status(400).json({ error: error.error });
    }

    let existingItems = [];
    let rowExists = false;

    if (userId) {
      const result = await queryOne('SELECT items_json FROM carts WHERE user_id = ?', [userId]);
      if (result) {
        rowExists = true;
        existingItems = JSON.parse(result.items_json || '[]');
      }
    } else if (cartId) {
      const result = await queryOne('SELECT items_json FROM carts WHERE cart_id = ?', [cartId]);
      if (result) {
        rowExists = true;
        existingItems = JSON.parse(result.items_json || '[]');
      }
    } else {
      return response.status(400).json({ error: 'No cart scope available. Sign in or provide a cart id.' });
    }

    // Merge: replace items with same key, append new ones
    const existingByKey = new Map();
    for (const existing of existingItems) {
      existingByKey.set(cartItemKey(existing), existing);
    }
    for (const incoming of incomingItems) {
      existingByKey.set(cartItemKey(incoming), incoming);
    }
    const mergedItems = Array.from(existingByKey.values());

    if (rowExists) {
      if (userId) {
        await runQuery('UPDATE carts SET items_json = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?', [JSON.stringify(mergedItems), userId]);
      } else {
        await runQuery('UPDATE carts SET items_json = ?, updated_at = CURRENT_TIMESTAMP WHERE cart_id = ?', [JSON.stringify(mergedItems), cartId]);
      }
    } else {
      if (userId) {
        await runQuery('INSERT INTO carts (user_id, items_json) VALUES (?, ?)', [userId, JSON.stringify(mergedItems)]);
      } else {
        await runQuery('INSERT INTO carts (cart_id, items_json) VALUES (?, ?)', [cartId, JSON.stringify(mergedItems)]);
      }
    }

    response.json({ items: mergedItems });
  } catch (error) {
    response.status(500).json({ error: databaseError('Saving cart failed.', error) });
  }
});

/**
 * DELETE /api/cart/:itemKey - remove a single cart item by its cart item key.
 */
router.delete('/:itemKey', async (request, response) => {
  try {
    const { userId, cartId } = resolveCartScope(request);
    const itemKey = request.params.itemKey;

    let existingItems = [];
    let rowExists = false;

    if (userId) {
      const result = await queryOne('SELECT items_json FROM carts WHERE user_id = ?', [userId]);
      if (result) {
        rowExists = true;
        existingItems = JSON.parse(result.items_json || '[]');
      }
    } else if (cartId) {
      const result = await queryOne('SELECT items_json FROM carts WHERE cart_id = ?', [cartId]);
      if (result) {
        rowExists = true;
        existingItems = JSON.parse(result.items_json || '[]');
      }
    } else {
      return response.status(400).json({ error: 'No cart scope available.' });
    }

    const filtered = existingItems.filter(item => cartItemKey(item) !== itemKey);

    if (rowExists) {
      if (userId) {
        await runQuery('UPDATE carts SET items_json = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?', [JSON.stringify(filtered), userId]);
      } else {
        await runQuery('UPDATE carts SET items_json = ?, updated_at = CURRENT_TIMESTAMP WHERE cart_id = ?', [JSON.stringify(filtered), cartId]);
      }
    }

    response.json({ items: filtered });
  } catch (error) {
    response.status(500).json({ error: databaseError('Removing cart item failed.', error) });
  }
});

/**
 * DELETE /api/cart - clear all cart items.
 */
router.delete('/', async (request, response) => {
  try {
    const { userId, cartId } = resolveCartScope(request);

    if (userId) {
      await runQuery('DELETE FROM carts WHERE user_id = ?', [userId]);
    } else if (cartId) {
      await runQuery('DELETE FROM carts WHERE cart_id = ?', [cartId]);
    } else {
      return response.status(400).json({ error: 'No cart scope available.' });
    }

    response.json({ items: [] });
  } catch (error) {
    response.status(500).json({ error: databaseError('Clearing cart failed.', error) });
  }
});

/**
 * GET /api/cart/pending-payments - list pending payment references.
 */
router.get('/pending-payments', async (request, response) => {
  try {
    const rows = await queryRows('SELECT reference, items_json, status, created_at FROM cart_pending_payments WHERE status = ? ORDER BY created_at DESC', ['pending']);
    const payments = rows.map(row => ({
      reference: row.reference,
      items: JSON.parse(row.items_json || '[]'),
      status: row.status,
      createdAt: row.created_at
    }));
    response.json({ payments });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading pending payments failed.', error) });
  }
});

/**
 * POST /api/cart/pending-payments/:ref - register a pending payment.
 * Body: { items: [...] }
 */
router.post('/pending-payments/:ref', async (request, response) => {
  try {
    const { ref } = request.params;
    const { items } = request.body || {};

    if (!items || !Array.isArray(items) || !items.length) {
      return response.status(400).json({ error: 'Items are required.' });
    }

    await runQuery(
      `INSERT INTO cart_pending_payments (reference, items_json, status)
       VALUES (?, ?, 'pending')
       ON CONFLICT (reference) DO UPDATE SET items_json = EXCLUDED.items_json, status = 'pending', created_at = CURRENT_TIMESTAMP`,
      [ref, JSON.stringify(items)]
    );

    response.json({ reference, items });
  } catch (error) {
    response.status(500).json({ error: databaseError('Registering pending payment failed.', error) });
  }
});

/**
 * DELETE /api/cart/pending-payments/:ref - remove a pending payment.
 */
router.delete('/pending-payments/:ref', async (request, response) => {
  try {
    const { ref } = request.params;
    await runQuery('DELETE FROM cart_pending_payments WHERE reference = ?', [ref]);
    response.json({ ok: true });
  } catch (error) {
    response.status(500).json({ error: databaseError('Removing pending payment failed.', error) });
  }
});

/**
 * GET /api/cart/license-purchase-counter - get current counter value.
 */
router.get('/license-purchase-counter', async (request, response) => {
  try {
    const row = await queryOne('SELECT count FROM license_purchase_counter WHERE id = 1');
    response.json({ count: row ? row.count : 0 });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading counter failed.', error) });
  }
});

/**
 * POST /api/cart/license-purchase-counter/increment - increment and return new value.
 */
router.post('/license-purchase-counter/increment', async (request, response) => {
  try {
    await runQuery('UPDATE license_purchase_counter SET count = count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1');
    const row = await queryOne('SELECT count FROM license_purchase_counter WHERE id = 1');
    response.json({ count: row ? row.count : 0 });
  } catch (error) {
    response.status(500).json({ error: databaseError('Incrementing counter failed.', error) });
  }
});

module.exports = router;
