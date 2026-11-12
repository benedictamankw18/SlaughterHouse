const {
  BOOKING_SESSION_MINUTES,
  bookingTimeToMinutes,
  bookingMinutesToTime
} = require('./booking');

const HOLD_DURATION_MINUTES = 30;

function normalizeSlotTime(value) {
  const minutes = bookingTimeToMinutes(String(value || '').slice(0, 5));
  return minutes === null ? '' : bookingMinutesToTime(minutes);
}

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

function all(db, query, parameters) {
  return new Promise((resolve, reject) => {
    let completed = false;
    const finish = (error, rows) => {
      if (completed) return;
      completed = true;
      if (error) reject(error);
      else resolve(rows || []);
    };
    const pending = db.all(query, parameters, (error, rows) => finish(error, rows));
    if (pending && typeof pending.then === 'function') pending.then(rows => finish(null, rows), error => finish(error));
  });
}

function orderedSlots(slots) {
  return [...slots].sort((left, right) => left.date.localeCompare(right.date) || left.time.localeCompare(right.time));
}

function slotError(slots, message = 'One or more selected booking slots are already reserved. Refresh availability and choose different slots.') {
  return Object.assign(new Error(message), {
    code: 'BOOKING_SLOT_UNAVAILABLE',
    unavailableSlots: slots.map(slot => ({ date: slot.date, time: slot.time }))
  });
}

function isBlockingRow(row, orderReference, now) {
  if (row.status === 'booked' || row.status === 'blocked') return true;
  if (row.status !== 'reserved' || !row.hold_expires_at) return false;
  if (row.booking_order_reference === orderReference) return false;
  const expiresAt = row.hold_expires_at instanceof Date
    ? row.hold_expires_at.getTime()
    : new Date(row.hold_expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

async function findConflicts(db, slots, orderReference, now, sessionMinutes) {
  const dates = [...new Set(slots.map(slot => slot.date))].sort();
  const conflicts = new Map();
  for (const date of dates) {
    const rows = await all(db,
      'SELECT slot_date, start_time, status, hold_expires_at, booking_order_reference FROM booking_availability WHERE slot_date = ?',
      [date]
    );
    const intervals = rows
      .filter(row => isBlockingRow(row, orderReference, now))
      .map(row => {
        const start = bookingTimeToMinutes(normalizeSlotTime(row.start_time));
        return start === null ? null : { start, end: start + sessionMinutes };
      })
      .filter(Boolean);
    for (const slot of slots.filter(candidate => candidate.date === date)) {
      const start = bookingTimeToMinutes(slot.time);
      if (start === null) continue;
      const end = start + sessionMinutes;
      if (intervals.some(interval => start < interval.end && interval.start < end)) {
        conflicts.set(`${slot.date}T${slot.time}`, slot);
      }
    }
  }
  return [...conflicts.values()];
}

async function reserveBookingSlots(db, orderReference, slots, { sessionMinutes = BOOKING_SESSION_MINUTES } = {}) {
  const duration = Number.isInteger(sessionMinutes) && sessionMinutes > 0 ? sessionMinutes : BOOKING_SESSION_MINUTES;
  const ordered = orderedSlots(slots);
  const now = new Date();

  // Serialize reservations per date so overlapping slots cannot be sold twice
  // by two concurrent checkouts.
  for (const date of [...new Set(ordered.map(slot => slot.date))].sort()) {
    await run(db, 'SELECT pg_advisory_xact_lock(hashtext(?)::bigint)', [`booking-slot:${date}`]);
  }

  const conflicts = await findConflicts(db, ordered, orderReference, now, duration);
  if (conflicts.length) throw slotError(conflicts);

  for (const slot of ordered) {
    const result = await run(db,
      `INSERT INTO booking_availability (slot_date, start_time, end_time, status, booking_order_reference, hold_expires_at, booking_id)
       VALUES (?, ?, ?::time + INTERVAL '${duration} minutes', 'reserved', ?, CURRENT_TIMESTAMP + INTERVAL '${HOLD_DURATION_MINUTES} minutes', NULL)
       ON CONFLICT (slot_date, start_time) DO UPDATE
       SET status = 'reserved',
           booking_order_reference = EXCLUDED.booking_order_reference,
           hold_expires_at = EXCLUDED.hold_expires_at,
           booking_id = NULL
       WHERE booking_availability.status = 'available'
          OR (booking_availability.status = 'reserved' AND booking_availability.hold_expires_at <= CURRENT_TIMESTAMP)
          OR (booking_availability.status = 'reserved' AND booking_availability.booking_order_reference = EXCLUDED.booking_order_reference)`,
      [slot.date, slot.time, slot.time, orderReference]
    );
    if (result.changes !== 1) throw slotError([slot]);
  }
}

async function confirmBookingSlots(db, orderReference, slots) {
  for (const slot of orderedSlots(slots)) {
    const result = await run(db,
      `UPDATE booking_availability
       SET status = 'booked', booking_order_reference = NULL, hold_expires_at = NULL
       WHERE slot_date = ? AND start_time = ?
         AND status = 'reserved'
         AND booking_order_reference = ?
         AND hold_expires_at > CURRENT_TIMESTAMP`,
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

async function expireBookingHoldsInRange(db, fromDate, toDate) {
  return run(db,
    `UPDATE booking_availability
     SET status = 'available', booking_order_reference = NULL, hold_expires_at = NULL
     WHERE status = 'reserved' AND hold_expires_at <= CURRENT_TIMESTAMP
       AND slot_date BETWEEN ? AND ?`,
    [fromDate, toDate]
  );
}

module.exports = {
  HOLD_DURATION_MINUTES,
  reserveBookingSlots,
  confirmBookingSlots,
  releaseBookingHold,
  expireBookingHolds,
  expireBookingHoldsInRange
};
