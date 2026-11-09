const {
  BOOKING_SESSION_MINUTES,
  bookingTimeToMinutes,
  isValidBookingDateKey,
  normalizeBookingRules
} = require('./booking');

const SETTING_KEYS = Object.freeze([
  'booking_available_weekdays',
  'booking_open_time',
  'booking_close_time',
  'booking_slot_step_minutes',
  'booking_same_day_lead_minutes',
  'booking_available_from',
  'booking_available_until'
]);

const DEFAULT_BOOKING_SETTINGS = Object.freeze({
  availableWeekdays: Object.freeze([0, 2, 3, 4]),
  openTime: '11:00',
  closeTime: '21:00',
  slotStepMinutes: 20,
  sameDayLeadMinutes: 30,
  availableFrom: null,
  availableUntil: null
});

function parseWeekdays(value, fallback = [...DEFAULT_BOOKING_SETTINGS.availableWeekdays]) {
  const candidates = Array.isArray(value)
    ? value
    : String(value ?? '').split(/[\s,]+/).filter(Boolean);
  const days = [...new Set(candidates.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort((left, right) => left - right);
  return days.length ? days : fallback;
}

function parseTime(value, fallback = DEFAULT_BOOKING_SETTINGS.openTime) {
  const minutes = bookingTimeToMinutes(value);
  if (minutes === null) return fallback;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function parseInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback;
}

function parseOptionalDate(value) {
  if (value === undefined || value === null || value === '') return { value: null };
  const candidate = String(value).trim();
  return isValidBookingDateKey(candidate) ? { value: candidate } : { error: true };
}

function normalizeBookingSettings(values = {}) {
  const source = values && typeof values === 'object' ? values : {};
  const availableWeekdays = parseWeekdays(source.booking_available_weekdays ?? source.availableWeekdays);
  let openTime = parseTime(source.booking_open_time ?? source.openTime, DEFAULT_BOOKING_SETTINGS.openTime);
  let closeTime = parseTime(source.booking_close_time ?? source.closeTime, DEFAULT_BOOKING_SETTINGS.closeTime);
  const sessionMinutes = BOOKING_SESSION_MINUTES;
  const openMinutes = bookingTimeToMinutes(openTime);
  const closeMinutes = bookingTimeToMinutes(closeTime);
  const hasSessionWindow = openMinutes !== null && closeMinutes !== null
    && openMinutes < closeMinutes && openMinutes + sessionMinutes <= closeMinutes;
  if (!hasSessionWindow) {
    openTime = DEFAULT_BOOKING_SETTINGS.openTime;
    closeTime = DEFAULT_BOOKING_SETTINGS.closeTime;
  }
  const fromResult = parseOptionalDate(source.booking_available_from ?? source.availableFrom);
  const untilResult = parseOptionalDate(source.booking_available_until ?? source.availableUntil);
  let availableFrom = fromResult.value ?? null;
  let availableUntil = untilResult.value ?? null;
  if (availableFrom && availableUntil && availableFrom > availableUntil) {
    availableFrom = null;
    availableUntil = null;
  }
  const settings = {
    availableWeekdays,
    openTime,
    closeTime,
    slotStepMinutes: parseInteger(source.booking_slot_step_minutes ?? source.slotStepMinutes, DEFAULT_BOOKING_SETTINGS.slotStepMinutes, 5, 240),
    sameDayLeadMinutes: parseInteger(source.booking_same_day_lead_minutes ?? source.sameDayLeadMinutes, DEFAULT_BOOKING_SETTINGS.sameDayLeadMinutes, 0, 1440),
    availableFrom,
    availableUntil,
    sessionMinutes
  };
  settings.rules = normalizeBookingRules({
    availableWeekdays: settings.availableWeekdays,
    openTime: settings.openTime,
    closeTime: settings.closeTime,
    slotStepMinutes: settings.slotStepMinutes,
    sameDayLeadMinutes: settings.sameDayLeadMinutes,
    availableFrom: settings.availableFrom,
    availableUntil: settings.availableUntil,
    sessionMinutes
  });
  return settings;
}

function getBookingSettings(database) {
  return new Promise((resolve, reject) => {
    let completed = false;
    const finish = (error, rows) => {
      if (completed) return;
      completed = true;
      if (error) return reject(error);
      const values = Object.fromEntries((rows || []).map(row => [row.setting_key, row.setting_value]));
      resolve(normalizeBookingSettings(values));
    };
    try {
      const pending = database.all(
        `SELECT setting_key, setting_value FROM settings WHERE setting_key IN (${SETTING_KEYS.map(() => '?').join(', ')})`,
        SETTING_KEYS,
        (error, rows) => finish(error, rows)
      );
      if (pending && typeof pending.then === 'function') pending.then(rows => finish(null, rows), error => finish(error));
    } catch (error) {
      finish(error);
    }
  });
}

function validateBookingSettingUpdates(updates) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return { error: 'Booking settings must be provided as an object.' };
  }
  const allowed = new Set(['availableWeekdays', 'openTime', 'closeTime', 'slotStepMinutes', 'sameDayLeadMinutes', 'availableFrom', 'availableUntil']);
  const entries = Object.entries(updates);
  if (!entries.length) return { error: 'Provide at least one booking setting to update.' };
  for (const key of Object.keys(updates)) {
    if (!allowed.has(key)) return { error: `Booking setting "${key}" cannot be changed through this endpoint.` };
  }

  const value = {};
  if (Object.hasOwn(updates, 'availableWeekdays')) {
    const raw = Array.isArray(updates.availableWeekdays)
      ? updates.availableWeekdays
      : String(updates.availableWeekdays ?? '').split(/[\s,]+/).filter(Boolean);
    const days = [...new Set(raw.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort((left, right) => left - right);
    if (!days.length) return { error: 'Choose at least one available weekday.' };
    value.booking_available_weekdays = days.join(',');
  }
  if (Object.hasOwn(updates, 'openTime')) {
    const minutes = bookingTimeToMinutes(updates.openTime);
    if (minutes === null) return { error: 'Opening time must be a valid HH:MM time.' };
    value.booking_open_time = parseTime(updates.openTime);
  }
  if (Object.hasOwn(updates, 'closeTime')) {
    const minutes = bookingTimeToMinutes(updates.closeTime);
    if (minutes === null) return { error: 'Closing time must be a valid HH:MM time.' };
    value.booking_close_time = parseTime(updates.closeTime);
  }
  if (Object.hasOwn(updates, 'slotStepMinutes')) {
    const step = Number(updates.slotStepMinutes);
    if (!Number.isInteger(step) || step < 5 || step > 240) return { error: 'Slot interval must be a whole number between 5 and 240 minutes.' };
    value.booking_slot_step_minutes = String(step);
  }
  if (Object.hasOwn(updates, 'sameDayLeadMinutes')) {
    const lead = Number(updates.sameDayLeadMinutes);
    if (!Number.isInteger(lead) || lead < 0 || lead > 1440) return { error: 'Same-day notice must be a whole number between 0 and 1440 minutes.' };
    value.booking_same_day_lead_minutes = String(lead);
  }
  if (Object.hasOwn(updates, 'availableFrom')) {
    const result = parseOptionalDate(updates.availableFrom);
    if (result.error) return { error: 'Available from date must be blank or a valid YYYY-MM-DD date.' };
    value.booking_available_from = result.value || '';
  }
  if (Object.hasOwn(updates, 'availableUntil')) {
    const result = parseOptionalDate(updates.availableUntil);
    if (result.error) return { error: 'Available until date must be blank or a valid YYYY-MM-DD date.' };
    value.booking_available_until = result.value || '';
  }

  if (Object.hasOwn(value, 'booking_open_time') && Object.hasOwn(value, 'booking_close_time')) {
    const open = bookingTimeToMinutes(value.booking_open_time);
    const close = bookingTimeToMinutes(value.booking_close_time);
    if (open === null || close === null || open >= close) return { error: 'Closing time must be after opening time.' };
    if (open + BOOKING_SESSION_MINUTES > close) {
      return { error: `Closing time must leave at least ${BOOKING_SESSION_MINUTES} minutes after opening for a session.` };
    }
  }
  if (value.booking_available_from && value.booking_available_until && value.booking_available_from > value.booking_available_until) {
    return { error: 'The availability start date must be on or before the end date.' };
  }
  return { value: Object.entries(value).map(([key, settingValue]) => [key, settingValue]) };
}

module.exports = {
  SETTING_KEYS,
  DEFAULT_BOOKING_SETTINGS,
  normalizeBookingSettings,
  getBookingSettings,
  validateBookingSettingUpdates
};
