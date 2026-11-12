const { getPricing, getUsdGhsRate } = require('./pricing');
const { parseOrderItems } = require('./order-items');

const LICENSE_PRICE_COLUMNS = Object.freeze({
  basic: 'basic_price',
  premium: 'premium_price',
  unlimited: 'unlimited_price',
  exclusive: 'exclusive_price'
});
const DEFAULT_LICENSE_TYPES = Object.freeze(Object.keys(LICENSE_PRICE_COLUMNS));

function amountToCents(amount) {
  return Math.round(Number(amount) * 100);
}

function invalidItem(message) {
  return Object.assign(new Error(message), { code: 'CART_ITEM_INVALID' });
}

function queryRows(database, query, parameters = []) {
  return new Promise((resolve, reject) => {
    database.all(query, parameters, (error, rows) => error ? reject(error) : resolve(rows || []));
  });
}

function queryOne(database, query, parameters = []) {
  return new Promise((resolve, reject) => {
    database.get(query, parameters, (error, row) => error ? reject(error) : resolve(row));
  });
}

// All beat licenses (basic, premium, unlimited, and exclusive) have unlimited
// stock and can be purchased repeatedly. Exclusive is no longer limited to one sale.
async function hasPaidExclusiveLicense(queryAll, beatId, excludedReference = null) {
  return false;
}

// Bulk version kept for API compatibility. Always returns an empty set because
// exclusive licenses now have unlimited stock.
async function getSoldExclusiveBeatIds(database) {
  return new Set();
}

async function availableLicenseTypes(database) {
  const licenseStatusRows = await queryRows(database, 'SELECT license_type, is_active FROM license_definition_status');
  if (!licenseStatusRows.length) return new Set(DEFAULT_LICENSE_TYPES);
  return new Set(
    licenseStatusRows
      .filter(row => Boolean(Number(row.is_active)))
      .map(row => String(row.license_type).toLowerCase())
  );
}

async function priceMerchandise(database, item) {
  const productId = Number(item.productId);
  if (!Number.isInteger(productId) || productId < 1) throw invalidItem('Invalid merchandise selected.');
  const product = await queryOne(database, "SELECT id, title, price, stock_quantity FROM merchandise WHERE id = ? AND catalog_status = 'published'", [productId]);
  if (!product || !Number.isFinite(Number(product.price)) || Number(product.price) <= 0) {
    throw invalidItem(`Merchandise unavailable: ${item.name || 'Unknown item'}.`);
  }
  if (product.stock_quantity !== null && Number(product.stock_quantity) < 1) {
    throw invalidItem(`${product.title} is out of stock.`);
  }
  return { type: 'merchandise', productId: product.id, name: product.title, priceGhs: Number(product.price) };
}

async function priceBeat(database, item, { licenseTypes, beatDefaultPrices }) {
  const license = String(item.license || '').toLowerCase();
  if (typeof item.name !== 'string' || !item.name.trim() || item.name.trim().length > 255) {
    throw invalidItem('Each beat item must include a title up to 255 characters.');
  }
  if (!LICENSE_PRICE_COLUMNS[license]) throw invalidItem('Invalid license selected.');
  if (!licenseTypes.has(license)) throw invalidItem('This license is no longer available for new purchases.');
  const beat = await queryOne(
    database,
    'SELECT id, title, cover_art, COALESCE(NULLIF(' + LICENSE_PRICE_COLUMNS[license] + ', 0), ?) AS price FROM beats WHERE lower(title) = lower(?)',
    [beatDefaultPrices[license], String(item.name || '')]
  );
  if (!beat || !Number.isFinite(Number(beat.price)) || Number(beat.price) <= 0) {
    throw invalidItem(`Beat unavailable: ${item.name || 'Unknown beat'}.`);
  }
  return { type: 'beat', productId: beat.id, name: beat.title, license, priceUsd: Number(beat.price) };
}

/**
 * Validates a cart payload against the catalog and returns the authoritative
 * GHS line prices plus the cart total. This is the single source of truth for
 * both the public quote and payment initialization.
 */
async function priceCartItems(database, items) {
  const [{ beatDefaultPrices }, licenseTypes] = await Promise.all([
    getPricing(database),
    availableLicenseTypes(database)
  ]);
  const validatedItems = await Promise.all(items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return Promise.reject(invalidItem('Each payment item must be an object.'));
    }
    return item.type === 'merchandise'
      ? priceMerchandise(database, item)
      : priceBeat(database, item, { licenseTypes, beatDefaultPrices });
  }));
  const exchangeRate = validatedItems.some(item => item.type === 'beat')
    ? await getUsdGhsRate(database)
    : null;
  const pricedItems = validatedItems.map(item => {
    if (item.type !== 'beat') return { ...item, priceGhs: amountToCents(item.priceGhs) / 100 };
    return {
      ...item,
      priceGhs: amountToCents(Number(item.priceUsd) * exchangeRate.rate) / 100,
      exchangeRate: exchangeRate.rate
    };
  });
  const amountCents = pricedItems.reduce((total, item) => total + amountToCents(item.priceGhs), 0);
  return { items: pricedItems, amountGhs: amountCents / 100 };
}

module.exports = {
  LICENSE_PRICE_COLUMNS,
  amountToCents,
  hasPaidExclusiveLicense,
  getSoldExclusiveBeatIds,
  priceCartItems
};
