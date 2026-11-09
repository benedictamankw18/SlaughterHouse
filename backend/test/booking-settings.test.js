const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getBookingSettings,
  normalizeBookingSettings,
  validateBookingSettingUpdates
} = require('../services/booking-settings');

test('getBookingSettings falls back to the documented defaults when nothing is stored', async () => {
  const settings = await getBookingSettings({ all: async () => [] });
  assert.deepEqual(settings.availableWeekdays, [0, 2, 3, 4]);
  assert.equal(settings.openTime, '11:00');
  assert.equal(settings.closeTime, '21:00');
  assert.equal(settings.slotStepMinutes, 20);
  assert.equal(settings.sameDayLeadMinutes, 30);
  assert.equal(settings.availableFrom, null);
  assert.equal(settings.availableUntil, null);
  assert.equal(settings.sessionMinutes, 140);
  assert.equal(settings.rules.openMinutes, 11 * 60);
  assert.equal(settings.rules.closeMinutes, 21 * 60);
});

test('getBookingSettings normalizes stored setting values', async () => {
  const settings = await getBookingSettings({
    all: async () => [
      { setting_key: 'booking_available_weekdays', setting_value: '5,1' },
      { setting_key: 'booking_open_time', setting_value: '09:00:00' },
      { setting_key: 'booking_close_time', setting_value: '13:00' },
      { setting_key: 'booking_slot_step_minutes', setting_value: '30' },
      { setting_key: 'booking_same_day_lead_minutes', setting_value: '45' },
      { setting_key: 'booking_available_from', setting_value: '2026-11-01' },
      { setting_key: 'booking_available_until', setting_value: '2026-12-31' }
    ]
  });
  assert.deepEqual(settings.availableWeekdays, [1, 5]);
  assert.equal(settings.openTime, '09:00');
  assert.equal(settings.closeTime, '13:00');
  assert.equal(settings.slotStepMinutes, 30);
  assert.equal(settings.sameDayLeadMinutes, 45);
  assert.equal(settings.availableFrom, '2026-11-01');
  assert.equal(settings.availableUntil, '2026-12-31');
  assert.equal(settings.rules.openMinutes, 9 * 60);
  assert.equal(settings.rules.slotStepMinutes, 30);
});

test('getBookingSettings supports the callback-style database adapter', async () => {
  const settings = await getBookingSettings({
    all(query, parameters, callback) {
      callback(null, [{ setting_key: 'booking_open_time', setting_value: '10:00' }]);
    }
  });
  assert.equal(settings.openTime, '10:00');
  assert.equal(settings.closeTime, '21:00');
});

test('normalizeBookingSettings falls back when a stored session window is too short', () => {
  const settings = normalizeBookingSettings({ booking_open_time: '11:00', booking_close_time: '12:00' });
  assert.equal(settings.openTime, '11:00');
  assert.equal(settings.closeTime, '21:00');
  assert.equal(settings.rules.openMinutes, 11 * 60);
  assert.equal(settings.rules.closeMinutes, 21 * 60);
});

test('normalizeBookingSettings clears an inverted date range', () => {
  const settings = normalizeBookingSettings({ booking_available_from: '2026-12-01', booking_available_until: '2026-11-01' });
  assert.equal(settings.availableFrom, null);
  assert.equal(settings.availableUntil, null);
});

test('validateBookingSettingUpdates rejects malformed or unsupported updates', () => {
  assert.match(validateBookingSettingUpdates(null).error, /object/);
  assert.match(validateBookingSettingUpdates({}).error, /at least one/);
  assert.match(validateBookingSettingUpdates({ timezone: 'UTC' }).error, /cannot be changed/);
  assert.match(validateBookingSettingUpdates({ availableWeekdays: [] }).error, /at least one available weekday/);
  assert.match(validateBookingSettingUpdates({ openTime: 'not-a-time' }).error, /Opening time/);
  assert.match(validateBookingSettingUpdates({ closeTime: '25:00' }).error, /Closing time/);
  assert.match(validateBookingSettingUpdates({ slotStepMinutes: 2 }).error, /Slot interval/);
  assert.match(validateBookingSettingUpdates({ sameDayLeadMinutes: -1 }).error, /Same-day notice/);
  assert.match(validateBookingSettingUpdates({ availableFrom: '2026-02-30' }).error, /Available from/);
  assert.match(validateBookingSettingUpdates({ availableUntil: 'tomorrow' }).error, /Available until/);
});

test('validateBookingSettingUpdates enforces the session window and date order', () => {
  assert.match(validateBookingSettingUpdates({ openTime: '12:00', closeTime: '11:00' }).error, /after opening/);
  assert.match(validateBookingSettingUpdates({ openTime: '11:00', closeTime: '12:00' }).error, /at least 140 minutes/);
  assert.match(validateBookingSettingUpdates({ availableFrom: '2026-12-01', availableUntil: '2026-11-01' }).error, /on or before/);
});

test('validateBookingSettingUpdates returns persisted setting pairs', () => {
  const validation = validateBookingSettingUpdates({
    availableWeekdays: [5, 1],
    openTime: '09:00',
    closeTime: '13:00',
    slotStepMinutes: 30,
    sameDayLeadMinutes: 45,
    availableFrom: '2026-11-01',
    availableUntil: '2026-12-31'
  });
  assert.equal(validation.error, undefined);
  assert.deepEqual(Object.fromEntries(validation.value), {
    booking_available_weekdays: '1,5',
    booking_open_time: '09:00',
    booking_close_time: '13:00',
    booking_slot_step_minutes: '30',
    booking_same_day_lead_minutes: '45',
    booking_available_from: '2026-11-01',
    booking_available_until: '2026-12-31'
  });

  const cleared = validateBookingSettingUpdates({ availableFrom: '', availableUntil: '' });
  assert.deepEqual(Object.fromEntries(cleared.value), {
    booking_available_from: '',
    booking_available_until: ''
  });
});
