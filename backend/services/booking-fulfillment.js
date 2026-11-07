const config = require('../config');
const { bookingServiceLabels } = config;
const { normalizeBookingSlots } = require('./booking');
const { confirmBookingSlots } = require('./booking-reservations');
const { createNotificationSafely, notifyAdminsSafely } = require('./notifications');
const { queueEmailSafely } = require('./email/outbox');

async function fulfillPaidBooking(db, order, bookingItem) {
  const booking = bookingItem.booking;
  if (!booking) throw Object.assign(new Error('Booking details are missing from this order.'), { code: 'INVALID_BOOKING' });
  const serviceName = bookingServiceLabels[bookingItem.service] || bookingItem.service;
  const sessionSlots = normalizeBookingSlots(booking.sessionSlots || (booking.preferredDate && booking.preferredTime ? [{ date: booking.preferredDate, time: booking.preferredTime }] : []));
  if (!sessionSlots.length) throw Object.assign(new Error('Booking session slots are missing.'), { code: 'INVALID_BOOKING' });
  const firstSlot = sessionSlots[0];
  await confirmBookingSlots(db, order.reference, sessionSlots);
  const bookingResult = await db.run(
    'INSERT INTO bookings (name, email, phone, service, artist_count, song_count, booking_slots_json, preferred_date, preferred_time, details, payment_reference, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [booking.name, booking.email, booking.phone, serviceName, booking.artistCount, booking.songCount || null, JSON.stringify(sessionSlots), firstSlot.date, firstSlot.time, booking.details, order.reference, 'paid']
  );
  for (const slot of sessionSlots) {
    await db.run('UPDATE booking_availability SET booking_id = ? WHERE slot_date = ? AND start_time = ?', [bookingResult.lastID, slot.date, slot.time]);
  }
  const customer = await db.get("SELECT id FROM users WHERE lower(email) = lower(?) AND role NOT IN ('admin', 'super_admin')", [order.customer_email]);
  if (customer?.id) await createNotificationSafely(db, {
    userId: customer.id,
    type: 'booking_paid',
    title: 'Booking confirmed',
    message: `${serviceName} booking ${order.reference} is paid and awaiting studio confirmation.`
  });
  await notifyAdminsSafely(db, {
    type: 'booking_paid',
    title: 'Booking payment received',
    message: `${serviceName} booking ${order.reference} from ${booking.name || order.customer_name} was paid.`,
    dedupeKey: `booking-paid:${order.reference}`
  });
  await queueEmailSafely(db, {
    to: booking.email || order.customer_email,
    template: 'booking_confirmation',
    idempotencyKey: `booking-confirmation:${order.reference}`,
    data: {
      name: booking.name || order.customer_name,
      reference: order.reference,
      service: bookingItem.name,
      feeGhs: bookingItem.feeGhs,
      currency: order.currency,
      slots: sessionSlots,
      bookingUrl: new URL('/', config.frontendOrigin).toString()
    }
  });
  return bookingResult.lastID;
}

module.exports = { fulfillPaidBooking };
