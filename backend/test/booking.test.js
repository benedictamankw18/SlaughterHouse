const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateBookingFee, isAvailableBookingSlot, areAvailableBookingSlots, normalizeBookingSlots, isBookingDate, bookingGridTimes, computeDateAvailability, isFutureBookingSlot } = require('../services/booking');

const fees = {
  mixtape: 700,
  'full-production': 1000,
  'beat-production': 500,
  'adverts-promos': 1000
};

test('calculateBookingFee returns the configured fee for flat services', () => {
  assert.equal(calculateBookingFee('mixtape', null, fees), 700);
  assert.equal(calculateBookingFee('beat-production', null, fees), 500);
});

test('calculateBookingFee applies the per-song EP rate with the 20% discount', () => {
  assert.equal(calculateBookingFee('ep-album', 1, fees, 20), 800);
  assert.equal(calculateBookingFee('ep-album', 3, fees, 20), 2400);
  assert.equal(calculateBookingFee('ep-album', 12, fees, 20), 9600);
  assert.equal(calculateBookingFee('ep-album', 3, fees, 0), 3000);
});

test('calculateBookingFee rejects invalid EP song counts or missing rates', () => {
  assert.equal(calculateBookingFee('ep-album', 0, fees), null);
  assert.equal(calculateBookingFee('ep-album', 13, fees), null);
  assert.equal(calculateBookingFee('ep-album', 2.5, fees), null);
  assert.equal(calculateBookingFee('ep-album', 3, { ...fees, 'full-production': 0 }, 20), null);
  assert.equal(calculateBookingFee('ep-album', 3, {}, 20), null);
  assert.equal(calculateBookingFee('ep-album', 3, fees), null);
  assert.equal(calculateBookingFee('ep-album', 3, fees, 100), null);
});

test('isAvailableBookingSlot accepts allowed weekdays between 11:00 and 21:00', () => {
  // 2026-11-03 is a Tuesday.
  assert.equal(isAvailableBookingSlot('2026-11-03', '11:00'), true);
  assert.equal(isAvailableBookingSlot('2026-11-03', '18:40'), true);
});

test('isAvailableBookingSlot rejects invalid dates, weekdays, and times', () => {
  assert.equal(isAvailableBookingSlot('2026-11-02', '11:00'), false, 'Monday is closed');
  assert.equal(isAvailableBookingSlot('2026-02-30', '11:00'), false, 'impossible calendar date');
  assert.equal(isAvailableBookingSlot('03-11-2026', '11:00'), false, 'non-ISO date');
  assert.equal(isAvailableBookingSlot('2026-11-03', '10:59'), false, 'before opening');
  assert.equal(isAvailableBookingSlot('2026-11-03', '19:00'), false, 'session would run past 21:00');
  assert.equal(isAvailableBookingSlot('2026-11-03', '25:00'), false, 'invalid hour');
  assert.equal(isAvailableBookingSlot('2026-11-03', '11:60'), false, 'invalid minute');
});

test('areAvailableBookingSlots enforces the requested count and non-overlap', () => {
  assert.equal(areAvailableBookingSlots([{ date: '2026-11-03', time: '11:00' }], 1), true);
  assert.equal(areAvailableBookingSlots([{ date: '2026-11-03', time: '11:00' }], 2), false, 'wrong count');
  assert.equal(areAvailableBookingSlots([{ date: '2026-11-03', time: '11:00' }, { date: '2026-11-03', time: '13:00' }], 2), false, 'overlapping sessions');
  assert.equal(areAvailableBookingSlots([{ date: '2026-11-03', time: '11:00' }, { date: '2026-11-03', time: '13:20' }], 2), true, 'back-to-back sessions');
  assert.equal(areAvailableBookingSlots([{ date: '2026-11-03', time: '11:00' }, { date: '2026-11-04', time: '11:00' }], 2), true, 'different days');
  assert.equal(areAvailableBookingSlots(null, 1), false);
});

test('normalizeBookingSlots keeps only date and time', () => {
  assert.deepEqual(normalizeBookingSlots([{ date: '2026-11-03', time: '11:00', extra: 'ignored' }]), [{ date: '2026-11-03', time: '11:00' }]);
  assert.deepEqual(normalizeBookingSlots(null), []);
  assert.deepEqual(normalizeBookingSlots([{ date: '2026-11-03' }]), []);
});

test('calculateBookingFee rejects unknown services and missing fee data without crashing', () => {
  assert.equal(calculateBookingFee('mixtape', null, null), null);
  assert.equal(calculateBookingFee('unknown', 2, { 'full-production': 1000 }), null);
  assert.equal(calculateBookingFee('ep-album', '3', { 'full-production': 1000 }, 20), 2400);
});

test('configurable booking rules override weekdays, hours, and date range', () => {
  const rules = { availableWeekdays: [1, 5], openTime: '09:00', closeTime: '12:00', slotStepMinutes: 30, sessionMinutes: 140 };
  assert.equal(isBookingDate('2026-11-02', rules), true, 'Monday is enabled');
  assert.equal(isBookingDate('2026-11-03', rules), false, 'Tuesday is disabled');
  assert.equal(isAvailableBookingSlot('2026-11-02', '09:00', rules), true);
  assert.equal(isAvailableBookingSlot('2026-11-02', '10:00', rules), false, 'session would end after closing');
  assert.deepEqual(bookingGridTimes(rules), ['09:00', '09:30']);

  const ranged = { availableWeekdays: [1], openTime: '09:00', closeTime: '12:00', availableFrom: '2026-11-02', availableUntil: '2026-11-09' };
  assert.equal(isBookingDate('2026-10-26', ranged), false, 'before the available range');
  assert.equal(isBookingDate('2026-11-02', ranged), true, 'inside the available range');
  assert.equal(isBookingDate('2026-11-16', ranged), false, 'after the available range');
});

test('same-day notice uses the configured lead time', () => {
  const rules = { availableWeekdays: [1], openTime: '09:00', closeTime: '13:00', sessionMinutes: 140, sameDayLeadMinutes: 60 };
  const now = new Date('2026-11-02T09:30:00Z');
  assert.equal(isFutureBookingSlot('2026-11-02', '10:00', now, rules), false, 'less than the configured notice');
  assert.equal(isFutureBookingSlot('2026-11-02', '10:30', now, rules), true, 'exactly the configured notice');
});

test('computeDateAvailability applies configured grids and blocks overlapping slots', () => {
  const rules = { availableWeekdays: [1], openTime: '09:00', closeTime: '18:00', slotStepMinutes: 20, sessionMinutes: 140 };
  const now = new Date('2026-11-01T12:00:00Z');
  const blocked = computeDateAvailability('2026-11-02', [
    { start_time: '13:20', status: 'blocked' }
  ], { now, rules });
  assert.equal(blocked.validDay, true);
  assert.equal(blocked.sessionMinutes, 140);
  assert.equal(blocked.slots.length, 21);
  const blockedSlots = Object.fromEntries(blocked.slots.map(slot => [slot.time, slot]));
  assert.equal(blockedSlots['09:00'].available, true);
  assert.equal(blockedSlots['09:00'].reason, null);
  assert.equal(blockedSlots['11:20'].reason, 'blocked');
  assert.equal(blockedSlots['13:20'].reason, 'blocked');

  const booked = computeDateAvailability('2026-11-02', [
    { start_time: '13:20', status: 'booked' }
  ], { now, rules });
  const bookedSlots = Object.fromEntries(booked.slots.map(slot => [slot.time, slot]));
  assert.equal(bookedSlots['09:00'].available, true);
  assert.equal(bookedSlots['11:20'].reason, 'reserved');
  assert.equal(bookedSlots['13:20'].reason, 'reserved');

  const closed = computeDateAvailability('2026-11-03', [], { now, rules });
  assert.equal(closed.validDay, false);
  assert.deepEqual(closed.slots, []);
});
