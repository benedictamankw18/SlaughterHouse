const HOLD_DURATION_MINUTES = 30;

function run(db, query, parameters) {
  return new Promise((resolve, reject) => {
    let completed = false;
    const finish = (error, result) => {
      if (completed) return;
      completed = true;
      if (error) reject(error);
      else resolve(result);
    };
    const pending = db.run(query, parameters, function (error, result) {
      finish(error, error ? undefined : {
        ...(result || {}),
        changes: this.changes
      });
    });
    if (pending && typeof pending.then === 'function') pending.then(result => finish(null, result), error => finish(error));
  });
}

function orderedSlots(slots) {
  return [...slots].sort((left, right) => left.date.localeCompare(right.date) || left.time.localeCompare(right.time));
}

async function reserveBookingSlots(db, orderReference, slots) {
  for (const slot of orderedSlots(slots)) {
    const result = await run(db,
      `UPDATE booking_availability
       SET status = 'reserved', booking_order_reference = ?, hold_expires_at = CURRENT_TIMESTAMP + INTERVAL '${HOLD_DURATION_MINUTES} minutes', booking_id = NULL
       WHERE slot_date = ? AND start_time = ?
         AND (status = 'available' OR (status = 'reserved' AND hold_expires_at <= CURRENT_TIMESTAMP))`,
      [orderReference, slot.date, slot.time]
    );
    if (result.changes !== 1) {
      throw Object.assign(new Error('One or more selected booking slots are already reserved. Refresh availability and choose different slots.'), {
        code: 'BOOKING_SLOT_UNAVAILABLE'
      });
    }
  }
}

async function confirmBookingSlots(db, orderReference, slots) {
  for (const slot of orderedSlots(slots)) {
    const result = await run(db,
      `UPDATE booking_availability
       SET status = 'booked', booking_order_reference = NULL, hold_expires_at = NULL
       WHERE slot_date = ? AND start_time = ?
         AND (status = 'available' OR (status = 'reserved' AND booking_order_reference = ?))`,
      [slot.date, slot.time, orderReference]
    );
    if (result.changes !== 1) {
      throw Object.assign(new Error('One or more selected booking slots are no longer available.'), {
        code: 'BOOKING_SLOT_UNAVAILABLE'
      });
    }
  }
}

async function releaseBookingHold(db, orderReference) {
  return run(db,
    `UPDATE booking_availability
     SET status = 'available', booking_order_reference = NULL, hold_expires_at = NULL
     WHERE status = 'reserved' AND booking_order_reference = ?`,
    [orderReference]
  );
}

async function expireBookingHolds(db, date = null) {
  const dateCondition = date ? ' AND slot_date = ?' : '';
  return run(db,
    `UPDATE booking_availability
     SET status = 'available', booking_order_reference = NULL, hold_expires_at = NULL
     WHERE status = 'reserved' AND hold_expires_at <= CURRENT_TIMESTAMP${dateCondition}`,
    date ? [date] : []
  );
}

module.exports = {
  HOLD_DURATION_MINUTES,
  reserveBookingSlots,
  confirmBookingSlots,
  releaseBookingHold,
  expireBookingHolds
};
