const FULFILLMENT_STATUSES = Object.freeze(['unfulfilled', 'shipped', 'delivered']);

async function updateFulfillmentStatus(db, { orderId, status, adminId }) {
  if (!FULFILLMENT_STATUSES.includes(status)) {
    throw new Error(`Fulfillment status must be one of: ${FULFILLMENT_STATUSES.join(', ')}.`);
  }
  const order = await db.get('SELECT id, fulfillment_status FROM orders WHERE id = ? FOR UPDATE', [orderId]);
  if (!order) return { notFound: true };
  if (order.fulfillment_status === status) return { changed: false, status };
  await db.run('UPDATE orders SET fulfillment_status = ? WHERE id = ?', [status, orderId]);
  await db.run(
    'INSERT INTO order_fulfillment_history (order_id, status, changed_by) VALUES (?, ?, ?)',
    [orderId, status, adminId]
  );
  return { changed: true, previousStatus: order.fulfillment_status, status };
}

module.exports = { FULFILLMENT_STATUSES, updateFulfillmentStatus };
