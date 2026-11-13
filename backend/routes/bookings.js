const express = require('express');
const crypto = require('node:crypto');
const database = require('../database');
const config = require('../config');
const {
  calculateBookingFee,
  areAvailableBookingSlots,
  isAvailableBookingSlot,
  isBookingDate,
  isFutureBookingSlot,
  computeDateAvailability,
  accraDateKey,
  BOOKING_TIMEZONE
} = require('../services/booking');
const { getBookingSettings } = require('../services/booking-settings');
const { getPricing } = require('../services/pricing');
const { getChargeQuote, isSupportedCurrency, BOOKING_QUOTE_TTL_MS } = require('../services/fx');
const { createCheckout: createFlutterwaveCheckout, isConfigured: isFlutterwaveConfigured } = require('../services/flutterwave');
const { databaseError } = require('../services/error-messages');
const validators = require('../services/input-validation');
const {
  HOLD_DURATION_MINUTES,
  reserveBookingSlots,
  releaseBookingHold,
  expireBookingHolds,
  expireBookingHoldsInRange
} = require('../services/booking-reservations');
const { queueEmailSafely } = require('../services/email/outbox');
const { rateLimit } = require('../services/rate-limit');
const { recordPayment, PAYMENT_REFERENCE_CONFLICT } = require('../services/payment-records');

const router = express.Router();
const { bookingServiceLabels, paystackSecretKey, paymentCallbackUrl, frontendOrigin } = config;
const bookingPaymentRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many booking payment requests. Try again later.' });
const queryRows = (query, parameters = []) => new Promise((resolve, reject) => database.all(query, parameters, (error, rows) => error ? reject(error) : resolve(rows || [])));
const run = (query, parameters = []) => new Promise((resolve, reject) => database.run(query, parameters, function (error) { error ? reject(error) : resolve(this); }));
const pad2 = value => String(value).padStart(2, '0');

const BOOKING_PAYMENT_HTTP_STATUS = Object.freeze({
  FX_CURRENCY_UNSUPPORTED: 400,
  FX_AMOUNT_INVALID: 400,
  FX_CHARGING_DISABLED: 409,
  FX_RATE_STALE: 503,
  FX_RATE_INVALID: 503,
  FX_MARKUP_INVALID: 503,
  FLW_NOT_CONFIGURED: 503,
  FLW_UNAVAILABLE: 503,
  FLW_REJECTED: 502,
  FLW_AMOUNT_INVALID: 400
});

function bookingPaymentErrorStatus(code) {
  return BOOKING_PAYMENT_HTTP_STATUS[code] || null;
}

function normalizeSubmissionId(value) {
  if (value === undefined || value === null || value === '') return { id: null };
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(candidate)) return { error: 'The submission identifier is invalid.' };
  return { id: candidate };
}

const AVAILABILITY_COLUMNS = 'slot_date::text AS slot_date, start_time, status, hold_expires_at, booking_order_reference';

router.get('/bookings/fees', (request, response) => {
  getPricing(database).then(({ bookingFees: fees, bookingRules }) => {
    if (Object.values(fees).some(fee => !Number.isFinite(fee) || fee <= 0)
      || !Number.isFinite(bookingRules.epAlbumDiscountPercent)
      || bookingRules.epAlbumDiscountPercent < 0
      || bookingRules.epAlbumDiscountPercent >= 100) {
      return response.status(503).json({ error: 'One or more booking fees or pricing rules are missing or invalid in the settings table.' });
    }
    response.json({ fees, rules: bookingRules });
  }).catch(error => response.status(500).json({ error: databaseError('Loading booking fees failed.', error) }));
});

router.get('/bookings/availability/month', async (request, response) => {
  const month = String(request.query.month || '').trim();
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return response.status(400).json({ error: 'Provide a month in YYYY-MM format to load booking availability.' });
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (!Number.isInteger(year) || monthNumber < 1 || monthNumber > 12) {
    return response.status(400).json({ error: 'Provide a valid month in YYYY-MM format.' });
  }
  const today = accraDateKey();
  const currentMonth = today.slice(0, 7);
  const [todayYear, todayMonth] = today.split('-').map(Number);
  const horizon = new Date(Date.UTC(todayYear, todayMonth - 1 + 12, 1));
  const horizonMonth = `${horizon.getUTCFullYear()}-${pad2(horizon.getUTCMonth() + 1)}`;
  if (month < currentMonth) return response.status(400).json({ error: 'Booking availability is only shown for the current month onward.' });
  if (month > horizonMonth) return response.status(400).json({ error: 'Booking availability is only shown up to 12 months ahead.' });

  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const firstDate = `${month}-01`;
  const lastDate = `${month}-${pad2(daysInMonth)}`;
  try {
    const settings = await getBookingSettings(database);
    await expireBookingHoldsInRange(database, firstDate, lastDate);
    const rows = await queryRows(
      `SELECT ${AVAILABILITY_COLUMNS} FROM booking_availability WHERE slot_date BETWEEN ? AND ? ORDER BY slot_date, start_time`,
      [firstDate, lastDate]
    );
    const rowsByDate = new Map();
    for (const row of rows) {
      const key = String(row.slot_date).slice(0, 10);
      if (!rowsByDate.has(key)) rowsByDate.set(key, []);
      rowsByDate.get(key).push(row);
    }
    const days = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${month}-${pad2(day)}`;
      const availability = computeDateAvailability(date, rowsByDate.get(date) || [], { rules: settings.rules });
      const slotsAvailable = availability.slots.filter(slot => slot.available).length;
      days.push({
        date,
        sessionDay: availability.validDay,
        available: slotsAvailable > 0,
        slotsAvailable
      });
    }
    response.json({
      month,
      timezone: BOOKING_TIMEZONE,
      today,
      sessionMinutes: settings.sessionMinutes,
      availableWeekdays: settings.availableWeekdays,
      openTime: settings.openTime,
      closeTime: settings.closeTime,
      days
    });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading monthly booking availability failed.', error) });
  }
});

router.get('/bookings/availability', async (request, response) => {
  const date = String(request.query.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return response.status(400).json({ error: 'Provide a valid booking date in YYYY-MM-DD format.' });
  }
  try {
    const settings = await getBookingSettings(database);
    if (!isBookingDate(date, settings.rules)) {
      return response.status(400).json({ error: 'Bookings are not open on this date. Choose an available day.' });
    }
    await expireBookingHolds(database, date);
    const rows = await queryRows(
      `SELECT ${AVAILABILITY_COLUMNS} FROM booking_availability WHERE slot_date = ? ORDER BY start_time`,
      [date]
    );
    response.json({
      ...computeDateAvailability(date, rows, { rules: settings.rules }),
      today: accraDateKey(),
      openTime: settings.openTime,
      closeTime: settings.closeTime
    });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading booking availability failed.', error) });
  }
});

router.post('/bookings', (request, response) => response.status(402).json({ error: 'Payment is required before a booking can be submitted.' }));

router.post('/bookings/initialize-payment', bookingPaymentRateLimit, async (request, response) => {
  const { name, email, phone, service, artistCount, songCount, slots, details, paymentMethod, timezone, durationMinutes, currency, submissionId } = request.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedArtistCount = Number(artistCount);
  const normalizedSongCount = Number(songCount);
  const requestedCurrency = String(currency || 'GHS').trim().toUpperCase();
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
  if (!isSupportedCurrency(requestedCurrency)) {
    return response.status(400).json({ error: `Unsupported currency "${requestedCurrency}". Choose one of: GHS, USD, NGN, GBP, EUR.` });
  }
  if (timezone !== 'Africa/Accra') return response.status(400).json({ error: 'Booking timezone must be Africa/Accra.' });
  if (Number(durationMinutes) !== 140) return response.status(400).json({ error: 'Each booking session must have a duration of exactly 140 minutes.' });
  const submission = normalizeSubmissionId(submissionId);
  if (submission.error) return response.status(400).json({ error: submission.error });
  if (submission.id) {
    const existingRows = await queryRows('SELECT reference, checkout_url, amount, currency FROM orders WHERE submission_id = ? AND lower(customer_email) = lower(?)', [submission.id, normalizedEmail]);
    const existing = existingRows[0];
    if (existing) {
      if (existing.checkout_url) {
        return response.json({ authorizationUrl: existing.checkout_url, reference: existing.reference, amount: existing.amount, currency: existing.currency, replay: true });
      }
      return response.status(409).json({ error: 'This booking payment is already being prepared. Please wait a moment and try again.' });
    }
  }
  let fees;
  let bookingRules;
  try { ({ bookingFees: fees, bookingRules } = await getPricing(database)); } catch (error) { return response.status(500).json({ error: databaseError('Loading booking fees failed.', error) }); }
  let bookingSettings;
  try { bookingSettings = await getBookingSettings(database); } catch (error) { return response.status(500).json({ error: databaseError('Loading booking availability settings failed.', error) }); }
  const availabilityRules = bookingSettings.rules;
  const needsSongCount = service === 'ep-album';
  if (needsSongCount && (!Number.isInteger(normalizedSongCount) || normalizedSongCount < 1 || normalizedSongCount > 12)) return response.status(400).json({ error: 'Choose between 1 and 12 songs for EP / Album.' });
  const expectedSlotCount = needsSongCount ? Math.ceil(normalizedSongCount / 2) : 1;
  if (slots.length !== expectedSlotCount) {
    return response.status(400).json({ error: `This service requires ${expectedSlotCount} booking slot${expectedSlotCount === 1 ? '' : 's'}. Each slot must contain a date and time.` });
  }
  if (slots.some(slot => !slot || typeof slot !== 'object' || typeof slot.date !== 'string' || typeof slot.time !== 'string')) {
    return response.status(400).json({ error: 'Each booking slot must use the format { "date": "YYYY-MM-DD", "time": "HH:MM" }.' });
  }
  const feeGhs = calculateBookingFee(service, normalizedSongCount, fees, bookingRules.epAlbumDiscountPercent);
  if (!Number.isFinite(feeGhs) || feeGhs <= 0) return response.status(400).json({ error: `No valid price is configured for the "${service}" booking service.` });
  if (!areAvailableBookingSlots(slots, expectedSlotCount, availabilityRules)) {
    return response.status(400).json({ error: `Choose a valid, non-overlapping slot between ${bookingSettings.openTime} and ${bookingSettings.closeTime} for each session.` });
  }
  const now = new Date();
  if (slots.some(slot => !isFutureBookingSlot(slot.date, slot.time, now, availabilityRules))) {
    return response.status(400).json({ error: `Choose a future booking date. Same-day sessions need at least ${bookingSettings.sameDayLeadMinutes} minutes notice.` });
  }
  let quote;
  try {
    quote = await getChargeQuote(database, feeGhs, requestedCurrency, { ttlMs: BOOKING_QUOTE_TTL_MS });
  } catch (error) {
    return response.status(bookingPaymentErrorStatus(error.code) || 400).json({ error: error.message, code: error.code });
  }
  if (quote.provider === 'paystack' && !paystackSecretKey) return response.status(503).json({ error: 'Booking payments are unavailable because PAYSTACK_SECRET_KEY is missing or still set to the example placeholder. Add a valid Paystack secret key to backend/.env and restart the server.' });
  if (quote.provider === 'flutterwave' && !isFlutterwaveConfigured()) return response.status(503).json({ error: 'Booking payments in this currency are unavailable because FLUTTERWAVE_SECRET_KEY is not configured. Choose GHS to continue.' });
  let reference;
  let holdAcquired = false;
  let orderId;
  try {
    reference = `UBB-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const foreign = quote.provider === 'flutterwave';
    const bookingItem = {
      type: 'booking', name: `${bookingServiceLabels[service]}${needsSongCount ? ` (${normalizedSongCount} songs)` : ''}`, service,
      songCount: needsSongCount ? normalizedSongCount : null, feeGhs,
      booking: { name: String(name).trim(), email: normalizedEmail, phone: String(phone || '').trim(), artistCount: normalizedArtistCount, songCount: needsSongCount ? normalizedSongCount : null, timezone, durationMinutes: 140, sessionSlots: slots.map(slot => ({ date: slot.date, time: slot.time })), details: String(details || '').trim() }
    };
    await database.transaction(async transaction => {
      await reserveBookingSlots(transaction, reference, slots);
      const insertResult = await transaction.run(
        `INSERT INTO orders (reference, customer_name, customer_email, amount, currency, items_json, amount_ghs, fx_rate, fx_markup_percent, fx_source, fx_quoted_at, provider, submission_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (submission_id) DO NOTHING`,
        [
          reference,
          bookingItem.booking.name,
          normalizedEmail,
          quote.amount,
          quote.currency,
          JSON.stringify([bookingItem]),
          quote.amountGhs,
          foreign ? quote.midRate : null,
          foreign ? quote.markupPercent : null,
          foreign ? quote.source : null,
          foreign ? new Date() : null,
          quote.provider,
          submission.id
        ]
      );
      if (submission.id && insertResult.changes === 0) {
        throw Object.assign(new Error('This booking payment was already started.'), { code: 'BOOKING_DUPLICATE_SUBMISSION' });
      }
      orderId = insertResult.lastID;
    });
    holdAcquired = true;
    let checkout;
    try {
      if (foreign) {
        checkout = await createFlutterwaveCheckout({
          reference,
          amount: quote.amount,
          currency: quote.currency,
          customer: { email: normalizedEmail, name: bookingItem.booking.name },
          redirectUrl: paymentCallbackUrl.toString(),
          meta: { order_reference: reference, booking: true }
        });
      } else {
        const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', { method: 'POST', headers: { Authorization: `Bearer ${paystackSecretKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: normalizedEmail, amount: Math.round(quote.amount * 100), currency: quote.currency, reference, channels: [paymentMethod], callback_url: paymentCallbackUrl.toString() }) });
        const payment = await paystackResponse.json();
        if (!paystackResponse.ok || !payment.status) {
          await database.transaction(async transaction => {
            await transaction.run('UPDATE orders SET status = ? WHERE reference = ? AND status = ?', ['failed', reference, 'pending']);
            await releaseBookingHold(transaction, reference);
          });
          return response.status(502).json({ error: payment.message || 'Paystack rejected the booking payment initialization request.' });
        }
        checkout = {
          authorizationUrl: payment.data.authorization_url,
          providerReference: payment.data.reference,
          payload: payment.data
        };
      }
    } catch (error) {
      if (error.code === 'FLW_REJECTED' || error.code === 'FLW_AMOUNT_INVALID') {
        await database.transaction(async transaction => {
          await transaction.run('UPDATE orders SET status = ? WHERE reference = ? AND status = ?', ['failed', reference, 'pending']);
          await releaseBookingHold(transaction, reference);
        });
        return response.status(502).json({ error: error.message, code: error.code });
      }
      throw error;
    }
    await recordPayment(run, {
      orderId,
      provider: quote.provider,
      reference: checkout.providerReference,
      status: 'pending',
      amount: quote.amount,
      currency: quote.currency,
      amountGhs: quote.amountGhs,
      payload: checkout.payload
    });
    await run('UPDATE orders SET checkout_url = ? WHERE reference = ?', [checkout.authorizationUrl, reference]).catch(() => {});
    await queueEmailSafely(database, {
      to: normalizedEmail,
      template: 'booking_request_received',
      idempotencyKey: `booking-request-received:${reference}`,
      data: {
        name: bookingItem.booking.name,
        reference,
        service: bookingItem.name,
        amount: quote.amount,
        feeGhs,
        currency: quote.currency,
        slots: bookingItem.booking.sessionSlots,
        holdMinutes: HOLD_DURATION_MINUTES,
        accountUrl: new URL('/user/bookings.html', frontendOrigin).toString()
      }
    });
    response.json({ authorizationUrl: checkout.authorizationUrl, reference, amount: quote.amount, currency: quote.currency });
  } catch (error) {
    if (error.code === 'BOOKING_DUPLICATE_SUBMISSION') {
      const existingRows = await queryRows('SELECT reference, checkout_url, amount, currency FROM orders WHERE submission_id = ? AND lower(customer_email) = lower(?)', [submission.id, normalizedEmail]);
      const existing = existingRows[0];
      if (existing?.checkout_url) {
        return response.json({ authorizationUrl: existing.checkout_url, reference: existing.reference, amount: existing.amount, currency: existing.currency, replay: true });
      }
      return response.status(409).json({ error: 'This booking payment is already being prepared. Please wait a moment and try again.' });
    }
    if (error.code === 'BOOKING_SLOT_UNAVAILABLE') {
      return response.status(409).json({
        error: error.message,
        conflict: 'booking_slot_unavailable',
        unavailableSlots: error.unavailableSlots || []
      });
    }
    if (error.code === PAYMENT_REFERENCE_CONFLICT) {
      await database.transaction(async transaction => {
        await transaction.run('UPDATE orders SET status = ? WHERE reference = ? AND status = ?', ['failed', reference, 'pending']);
        await releaseBookingHold(transaction, reference);
      }).catch(() => {});
      return response.status(409).json({ error: error.message, code: error.code });
    }
    if (holdAcquired) return response.status(502).json({ error: `Payment initialization could not be confirmed. The selected slot will be released automatically after ${HOLD_DURATION_MINUTES} minutes.` });
    response.status(500).json({ error: databaseError('Reserving booking slots failed.', error) });
  }
});

module.exports = router;
