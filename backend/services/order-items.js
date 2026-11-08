function parseOrderItems(itemsJson) {
  if (Array.isArray(itemsJson)) return itemsJson;
  if (typeof itemsJson !== 'string') return null;
  try {
    const items = JSON.parse(itemsJson);
    return Array.isArray(items) ? items : null;
  } catch {
    return null;
  }
}

module.exports = { parseOrderItems };
