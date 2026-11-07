const express = require('express');
const crypto = require('node:crypto');
const database = require('../database');
const config = require('../config');
const { calculateBookingFee, areAvailableBookingSlots } = require('../services/booking');
const { getPricing } = require('../services/pricing');
const { databaseError } = require('../services/error-messages');
const validators = require('../services/input-validation');
const { HOLD_DURATION_MINUTES, reserveBookingSlots, releaseBookingHold, expireBookingHolds } = require('../services/booking-reservations');

const router = express.Router();
const { bookingServiceLabels, paystackSecretKey, paymentCallbackUrl } = config;
const queryRows = (query, parameters = []) => new Promise((resolve, reject) => database.all(query, parameters, (error, rows) => error ? reject(error) : resolve(rows || [])));
const run = (query, parameters = []) => new Promise((resolve, reject) => database.run(query, parameters, function (error) { error ? reject(error) : resolve(this); }));

router.get('/bookings/fees', (request, response) => {
  getPricing(database).then(({ bookingFees: fees }) => {
    if (Object.values(fees).some(fee => !Number.isFinite(fee) || fee <= 0)) return response.status(503).json({ error: 'One or more booking service fees are missing or not greater than zero in the settings table.' });
    response.json({ fees });
  }).catch(error => response.status(500).json({ error: databaseError('Loading booking fees failed.', error) }));
});

router.get('/bookings/availability', async (request, response) => {
  const date = String(request.query.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return response.status(400).json({ error: 'Provide a date in YYYY-MM-DD format to load booking availability.' });
  try {
    await expireBookingHolds(database, date);
    const rows = await queryRows('SELECT start_time, end_time, status FROM booking_availability WHERE slot_date = ? ORDER BY start_time', [date]);
    response.json({ date, slots: rows.map(row => ({ time: String(row.start_time).slice(0, 5), endTime: String(row.end_time).slice(0, 5), available: row.status === 'available' })) });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading booking availability failed.', error) });
  }
});

router.post('/bookings', (request, response) => response.status(402).json({ error: 'Payment is required before a booking can be submitted.' }));

router.post('/bookings/initialize-payment', async (request, response) => {
  const { name, email, phone, service, artistCount, songCount, slots, details, paymentMethod, timezone, durationMinutes } = request.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedArtistCount = Number(artistCount);
  const normalizedSongCount = Number(songCount);
  const basicError = validators.text(name, 'Name', { required: true, max: 255 })
    || validators.email(email)
    || validators.integer(artistCount, 'Artist count', { min: 1, max: 10 })
    || validators.text(details, 'Booking details', { max: 5000 });
  if (basicError) return response.status(400).json({ error: basicError });
  if (phone && validators.phone(String(phone))) return response.status(400).json({ error: validators.phone(String(phone)) });
  if (!Array.isArray(slots)) return response.status(400).json({ error: 'Booking slots must be provided as an array.' });
  if (!bookingServiceLabels[service]) {
    return response.status(400).json({ error: `Invalid booking service "${service}". Choose one of: ${Object.keys(bookingServiceLabels).join(', ')}.` });
  }
  if (!['card', 'mobile_money'].includes(paymentMethod)) {
    return response.status(400).json({ error: `Invalid payment method "${paymentMethod}". Choose "card" or "mobile_money".` });
  }
  if (timezone !== 'Africa/Accra') return response.status(400).json({ error: 'Booking timezone must be Africa/Accra.' });
  if (Number(durationMinutes) !== 140) return response.status(400).json({ error: 'Each booking session must have a duration of exactly 140 minutes.' });
  let fees;
  try { ({ bookingFees: fees } = await getPricing(database)); } catch (error) { return response.status(500).json({ error: databaseError('Loading booking fees failed.', error) }); }
  const needsSongCount = service === 'ep-album';
  if (needsSongCount && (!Number.isInteger(normalizedSongCount) || normalizedSongCount < 1 || normalizedSongCount > 12)) return response.status(400).json({ error: 'Choose between 1 and 12 songs for EP / Album.' });
  const expectedSlotCount = needsSongCount ? Math.ceil(normalizedSongCount / 2) : 1;
  if (slots.length !== expectedSlotCount) {
    return response.status(400).json({ error: `This service requires ${expectedSlotCount} booking slot${expectedSlotCount === 1 ? '' : 's'}. Each slot must contain a date and time.` });
  }
  if (slots.some(slot => !slot || typeof slot !== 'object' || typeof slot.date !== 'string' || typeof slot.time !== 'string')) {
    return response.status(400).json({ error: 'Each booking slot must use the format { "date": "YYYY-MM-DD", "time": "HH:MM" }.' });
  }
  const feeGhs = calculateBookingFee(service, normalizedSongCount, fees);
  if (!Number.isFinite(feeGhs) || feeGhs <= 0) return response.status(400).json({ error: `No valid price is configured for the "${service}" booking service.` });
  if (!areAvailableBookingSlots(slots, expectedSlotCount)) return response.status(400).json({ error: 'Choose a valid, non-overlapping Tuesday, Wednesday, Thursday, or Sunday slot for each 2h20 session. Slots must end by 9:00 PM.' });
  if (!paystackSecretKey) return response.status(503).json({ error: 'Booking payments are unavailable because PAYSTACK_SECRET_KEY is missing or still set to the example placeholder. Add a valid Paystack secret key to backend/.env and restart the server.' });
  let reference;
  let holdAcquired = false;
  try {
    reference = `UBB-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const bookingItem = {
      type: 'booking', name: `${bookingServiceLabels[service]}${needsSongCount ? ` (${normalizedSongCount} songs)` : ''}`, service,
      songCount: needsSongCount ? normalizedSongCount : null, feeGhs,
      booking: { name: String(name).trim(), email: normalizedEmail, phone: String(phone || '').trim(), artistCount: normalizedArtistCount, songCount: needsSongCount ? normalizedSongCount : null, timezone, durationMinutes: 140, sessionSlots: slots.map(slot => ({ date: slot.date, time: slot.time })), details: String(details || '').trim() }
    };
    await database.transaction(async transaction => {
      await reserveBookingSlots(transaction, reference, slots);
      await transaction.run('INSERT INTO orders (reference, customer_name, customer_email, amount, currency, items_json) VALUES (?, ?, ?, ?, ?, ?)', [reference, bookingItem.booking.name, normalizedEmail, feeGhs, 'GHS', JSON.stringify([bookingItem])]);
    });
    holdAcquired = true;
    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', { method: 'POST', headers: { Authorization: `Bearer ${paystackSecretKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: normalizedEmail, amount: Math.round(feeGhs * 100), currency: 'GHS', reference, channels: [paymentMethod], callback_url: paymentCallbackUrl.toString() }) });
    const payment = await paystackResponse.json();
    if (!paystackResponse.ok || !payment.status) {
      await database.transaction(async transaction => {
        await transaction.run('UPDATE orders SET status = ? WHERE reference = ? AND status = ?', ['failed', reference, 'pending']);
        await releaseBookingHold(transaction, reference);
      });
      return response.status(502).json({ error: payment.message || 'Paystack rejected the booking payment initialization request.' });
    }
    await run(
      `INSERT INTO payments (order_id, provider, provider_reference, status, amount, currency, provider_payload)
       SELECT id, ?, ?, ?, ?, ?, ? FROM orders WHERE reference = ?
       ON CONFLICT (provider_reference) DO UPDATE SET order_id = EXCLUDED.order_id, status = EXCLUDED.status,
         amount = EXCLUDED.amount, currency = EXCLUDED.currency, provider_payload = EXCLUDED.provider_payload`,
      ['paystack', payment.data.reference, 'pending', feeGhs, 'GHS', JSON.stringify(payment.data), reference]
    );
    response.json({ authorizationUrl: payment.data.authorization_url, reference, amount: feeGhs, currency: 'GHS' });
  } catch (error) {
    if (error.code === 'BOOKING_SLOT_UNAVAILABLE') return response.status(409).json({ error: error.message });
    if (holdAcquired) return response.status(502).json({ error: `Payment initialization could not be confirmed. The selected slot will be released automatically after ${HOLD_DURATION_MINUTES} minutes.` });
    response.status(500).json({ error: databaseError('Reserving booking slots failed.', error) });
  }
});

module.exports = router;
