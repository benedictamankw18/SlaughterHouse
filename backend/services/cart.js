const GUEST_CART_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const CART_ITEM_TYPES = ['beat', 'merchandise'];
const CART_CURRENCIES = ['GHS', 'USD', 'NGN', 'GBP', 'EUR'];
const CART_LICENSES = ['basic', 'premium', 'unlimited', 'exclusive'];

/**
 * Cart item key: "type|id:productId|license" for beats, "type|id:productId" for merchandise.
 * Must match frontend/script.js cartItemKey exactly so DELETE /api/cart/:itemKey works.
 */
function cartItemKey(item) {
  const product = Number.isInteger(Number(item.productId)) && Number(item.productId) > 0
    ? `id:${Number(item.productId)}`
    : `name:${String(item.name || '').trim().toLowerCase()}`;
  return `${item.type || 'beat'}|${product}|${String(item.license || '').toLowerCase()}`;
}

/**
 * Safely parse JSON, returning the fallback on failure.
 * Handles legacy cart rows that may contain invalid JSON (e.g. "[object Object]").
 * PostgreSQL JSONB columns are auto-parsed by pg into JavaScript objects, so
 * non-string values are returned as-is.
 */
function safeJsonParse(value, fallback = []) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value || fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function validateCartItem(item) {
  if (!item || typeof item !== 'object') return { error: 'Item is required.' };
  if (!item.type || !CART_ITEM_TYPES.includes(item.type)) return { error: 'Item type must be "beat" or "merchandise".' };
  if (!item.productId || !Number.isFinite(Number(item.productId))) return { error: 'A valid product ID is required.' };
  if (!item.name || typeof item.name !== 'string' || !item.name.trim()) return { error: 'Item name is required.' };
  if (!item.price || !Number.isFinite(Number(item.price)) || Number(item.price) < 0) return { error: 'A valid price is required.' };
  if (!item.priceCurrency || !CART_CURRENCIES.includes(String(item.priceCurrency).toUpperCase())) return { error: 'A valid currency is required.' };
  if (item.type === 'beat' && (!item.license || !CART_LICENSES.includes(String(item.license).toLowerCase()))) return { error: 'A valid license is required for beats.' };
  if (typeof item.selected !== 'boolean') return { error: 'selected flag is required.' };
  return null;
}

/**
 * Union two cart item lists by cartItemKey. The incoming list wins on duplicates.
 */
function mergeCartItems(existing, incoming) {
  const itemsByKey = new Map();
  for (const item of Array.isArray(existing) ? existing : []) {
    itemsByKey.set(cartItemKey(item), item);
  }
  for (const item of Array.isArray(incoming) ? incoming : []) {
    itemsByKey.set(cartItemKey(item), item);
  }
  return Array.from(itemsByKey.values());
}

function isValidGuestCartId(value) {
  return typeof value === 'string' && GUEST_CART_ID_PATTERN.test(value);
}

/**
 * Merge a guest cart into a customer cart after login. The guest row is either
 * reassigned to the customer when no customer cart exists, or merged by
 * cartItemKey (guest items win) and then deleted.
 */
async function mergeGuestCartOnLogin(db, userId, cartId) {
  if (!userId || !isValidGuestCartId(cartId)) return { merged: false, itemCount: 0 };
  return db.transaction(async transaction => {
    const guest = await transaction.get(
      'SELECT id, items_json FROM carts WHERE cart_id = ? FOR UPDATE',
      [cartId]
    );
    if (!guest) return { merged: false, itemCount: 0 };

    const customer = await transaction.get(
      'SELECT id, items_json FROM carts WHERE user_id = ? FOR UPDATE',
      [userId]
    );
    if (!customer) {
      await transaction.run(
        'UPDATE carts SET user_id = ?, cart_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [userId, guest.id]
      );
      return { merged: true, itemCount: safeJsonParse(guest.items_json).length };
    }

    const mergedItems = mergeCartItems(safeJsonParse(customer.items_json), safeJsonParse(guest.items_json));
    await transaction.run(
      'UPDATE carts SET items_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [JSON.stringify(mergedItems), customer.id]
    );
    await transaction.run('DELETE FROM carts WHERE id = ?', [guest.id]);
    return { merged: true, itemCount: mergedItems.length };
  });
}

module.exports = {
  cartItemKey,
  safeJsonParse,
  validateCartItem,
  mergeCartItems,
  isValidGuestCartId,
  mergeGuestCartOnLogin
};
