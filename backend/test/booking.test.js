const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateBookingFee, isAvailableBookingSlot, areAvailableBookingSlots, normalizeBookingSlots } = require('../services/booking');

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
  assert.equal(calculateBookingFee('ep-album', 1, fees), 800);
  assert.equal(calculateBookingFee('ep-album', 3, fees), 2400);
  assert.equal(calculateBookingFee('ep-album', 12, fees), 9600);
});

test('calculateBookingFee rejects invalid EP song counts or missing rates', () => {
  assert.equal(calculateBookingFee('ep-album', 0, fees), null);
  assert.equal(calculateBookingFee('ep-album', 13, fees), null);
  assert.equal(calculateBookingFee('ep-album', 2.5, fees), null);
  assert.equal(calculateBookingFee('ep-album', 3, { ...fees, 'full-production': 0 }), null);
  assert.equal(calculateBookingFee('ep-album', 3, {}), null);
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
  assert.equal(calculateBookingFee('ep-album', '3', { 'full-production': 1000 }), 2400);
});
