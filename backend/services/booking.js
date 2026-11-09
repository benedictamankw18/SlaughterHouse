const BOOKING_TIMEZONE = 'Africa/Accra';
const BOOKING_SESSION_MINUTES = 140;
const BOOKING_OPEN_MINUTES = 11 * 60;
const BOOKING_CLOSE_MINUTES = 21 * 60;
const BOOKING_SLOT_STEP_MINUTES = 20;
const BOOKING_SAME_DAY_LEAD_MINUTES = 30;
const BOOKING_AVAILABLE_WEEKDAYS = Object.freeze([0, 2, 3, 4]);

function calculateBookingFee(service, songCount, fees = {}, epAlbumDiscountPercent) {
  const normalizedService = typeof service === 'string' ? service.trim().toLowerCase() : '';
  const normalizedFees = fees && typeof fees === 'object' ? fees : {};
  if (!normalizedService || normalizedService !== 'ep-album') {
    const fee = Number(normalizedFees[normalizedService]);
    return Number.isFinite(fee) && fee > 0 ? Number(fee.toFixed(2)) : null;
  }
  const normalizedSongCount = Number(songCount);
  if (!Number.isInteger(normalizedSongCount) || normalizedSongCount < 1 || normalizedSongCount > 12) return null;
  const fullProductionRate = Number(normalizedFees['full-production']);
  if (!Number.isFinite(fullProductionRate) || fullProductionRate <= 0) return null;
  const discountPercent = Number(epAlbumDiscountPercent);
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent >= 100) return null;
  return Number((fullProductionRate * normalizedSongCount * (1 - discountPercent / 100)).toFixed(2));
}

function bookingTimeToMinutes(value) {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(String(value || '').trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function bookingMinutesToTime(totalMinutes) {
  const normalized = Number(totalMinutes);
  if (!Number.isInteger(normalized) || normalized < 0 || normalized >= 24 * 60) return '';
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function isValidBookingDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function normalizeAvailableWeekdays(value) {
  if (!Array.isArray(value)) return [...BOOKING_AVAILABLE_WEEKDAYS];
  const days = [...new Set(value.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort((left, right) => left - right);
  return days.length ? days : [...BOOKING_AVAILABLE_WEEKDAYS];
}

function normalizeBookingRules(rules) {
  const source = rules && typeof rules === 'object' ? rules : {};
  const openMinutes = Number.isInteger(source.openMinutes) ? source.openMinutes : bookingTimeToMinutes(source.openTime);
  const closeMinutes = Number.isInteger(source.closeMinutes) ? source.closeMinutes : bookingTimeToMinutes(source.closeTime);
  const sessionMinutes = Number.isInteger(source.sessionMinutes) && source.sessionMinutes > 0
    ? source.sessionMinutes
    : BOOKING_SESSION_MINUTES;
  const slotStepMinutes = Number.isInteger(source.slotStepMinutes) && source.slotStepMinutes > 0
    ? source.slotStepMinutes
    : BOOKING_SLOT_STEP_MINUTES;
  const sameDayLeadMinutes = Number.isInteger(source.sameDayLeadMinutes) && source.sameDayLeadMinutes >= 0
    ? source.sameDayLeadMinutes
    : BOOKING_SAME_DAY_LEAD_MINUTES;
  const hasSessionWindow = Number.isInteger(openMinutes) && Number.isInteger(closeMinutes)
    && openMinutes < closeMinutes && openMinutes + sessionMinutes <= closeMinutes;
  return {
    availableWeekdays: normalizeAvailableWeekdays(source.availableWeekdays),
    openMinutes: hasSessionWindow ? openMinutes : BOOKING_OPEN_MINUTES,
    closeMinutes: hasSessionWindow ? closeMinutes : BOOKING_CLOSE_MINUTES,
    sessionMinutes,
    slotStepMinutes,
    sameDayLeadMinutes,
    availableFrom: isValidBookingDateKey(source.availableFrom) ? String(source.availableFrom) : null,
    availableUntil: isValidBookingDateKey(source.availableUntil) ? String(source.availableUntil) : null
  };
}

function isBookingDate(dateValue, rules) {
  if (!isValidBookingDateKey(dateValue)) return false;
  const normalized = normalizeBookingRules(rules);
  const date = String(dateValue);
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (!normalized.availableWeekdays.includes(weekday)) return false;
  if (normalized.availableFrom && date < normalized.availableFrom) return false;
  if (normalized.availableUntil && date > normalized.availableUntil) return false;
  return true;
}

function isAvailableBookingSlot(dateValue, timeValue, rules) {
  if (!isBookingDate(dateValue, rules)) return false;
  const timeParts = /^(\d{2}):(\d{2})$/.exec(String(timeValue || ''));
  if (!timeParts) return false;
  const hour = Number(timeParts[1]);
  const minute = Number(timeParts[2]);
  if (hour > 23 || minute > 59) return false;
  const normalized = normalizeBookingRules(rules);
  const minutes = hour * 60 + minute;
  return minutes >= normalized.openMinutes && minutes + normalized.sessionMinutes <= normalized.closeMinutes;
}

function areAvailableBookingSlots(slots, expectedCount, rules) {
  const normalized = normalizeBookingRules(rules);
  if (!Array.isArray(slots) || slots.length !== expectedCount || !slots.every(slot => isAvailableBookingSlot(slot?.date, slot?.time, normalized))) return false;
  return slots.every((slot, index) => slots.slice(index + 1).every(otherSlot => {
    if (slot.date !== otherSlot.date) return true;
    const start = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
    return start(slot.time) + normalized.sessionMinutes <= start(otherSlot.time) || start(otherSlot.time) + normalized.sessionMinutes <= start(slot.time);
  }));
}

function normalizeBookingSlots(slots) {
  if (!Array.isArray(slots)) return [];
  return slots
    .filter(Boolean)
    .map(slot => ({
      date: typeof slot.date === 'string' ? slot.date.trim() : '',
      time: typeof slot.time === 'string' ? slot.time.trim() : ''
    }))
    .filter(slot => slot.date && slot.time);
}

function bookingGridTimes(rules) {
  const normalized = normalizeBookingRules(rules);
  const times = [];
  for (let start = normalized.openMinutes; start + normalized.sessionMinutes <= normalized.closeMinutes; start += normalized.slotStepMinutes) {
    times.push(bookingMinutesToTime(start));
  }
  return times;
}

function accraDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BOOKING_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const part = type => parts.find(candidate => candidate.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function accraMinutesOfDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BOOKING_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  const part = type => Number(parts.find(candidate => candidate.type === type)?.value || 0);
  return (part('hour') % 24) * 60 + part('minute');
}

function isFutureBookingSlot(dateValue, timeValue, now = new Date(), rules) {
  if (!isAvailableBookingSlot(dateValue, timeValue, rules)) return false;
  const normalized = normalizeBookingRules(rules);
  const date = String(dateValue);
  const today = accraDateKey(now);
  if (date > today) return true;
  if (date < today) return false;
  const start = bookingTimeToMinutes(timeValue);
  return start !== null && start >= accraMinutesOfDay(now) + normalized.sameDayLeadMinutes;
}

function normalizeSlotTime(value) {
  const minutes = bookingTimeToMinutes(String(value || '').slice(0, 5));
  return minutes === null ? '' : bookingMinutesToTime(minutes);
}

function isActiveHold(row, now) {
  if (row?.status !== 'reserved' || !row.hold_expires_at) return false;
  const expiresAt = row.hold_expires_at instanceof Date
    ? row.hold_expires_at.getTime()
    : new Date(row.hold_expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

function computeDateAvailability(dateValue, rows = [], options = {}) {
  const { now = new Date(), rules } = options;
  const normalized = normalizeBookingRules(rules);
  const date = String(dateValue || '');
  const validDay = isBookingDate(date, normalized);
  const result = {
    date,
    validDay,
    timezone: BOOKING_TIMEZONE,
    sessionMinutes: normalized.sessionMinutes,
    slots: []
  };
  if (!validDay) return result;

  const times = new Set(bookingGridTimes(normalized));
  const blockedStarts = new Set();
  const blockingIntervals = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const time = normalizeSlotTime(row?.start_time ?? row?.time);
    if (!time || !isAvailableBookingSlot(date, time, normalized)) continue;
    times.add(time);
    const start = bookingTimeToMinutes(time);
    if (row.status === 'blocked') {
      blockedStarts.add(time);
      blockingIntervals.push({ start, end: start + normalized.sessionMinutes, reason: 'blocked' });
      continue;
    }
    if (row.status === 'booked' || isActiveHold(row, now)) {
      blockingIntervals.push({ start, end: start + normalized.sessionMinutes, reason: 'reserved' });
    }
  }

  result.slots = [...times]
    .sort((left, right) => left.localeCompare(right))
    .map(time => {
      const start = bookingTimeToMinutes(time);
      const end = start + normalized.sessionMinutes;
      let reason = null;
      if (!isFutureBookingSlot(date, time, now, normalized)) reason = 'past';
      else if (blockedStarts.has(time)) reason = 'blocked';
      else {
        const overlap = blockingIntervals.find(interval => start < interval.end && interval.start < end);
        if (overlap) reason = overlap.reason;
      }
      return {
        time,
        endTime: bookingMinutesToTime(end),
        available: reason === null,
        reason
      };
    });
  return result;
}

function dateHasAvailability(dateValue, rows = [], options) {
  return computeDateAvailability(dateValue, rows, options).slots.some(slot => slot.available);
}

module.exports = {
  BOOKING_TIMEZONE,
  BOOKING_SESSION_MINUTES,
  BOOKING_OPEN_MINUTES,
  BOOKING_CLOSE_MINUTES,
  BOOKING_SLOT_STEP_MINUTES,
  BOOKING_SAME_DAY_LEAD_MINUTES,
  BOOKING_AVAILABLE_WEEKDAYS,
  calculateBookingFee,
  areAvailableBookingSlots,
  isAvailableBookingSlot,
  isBookingDate,
  isValidBookingDateKey,
  isFutureBookingSlot,
  normalizeBookingRules,
  normalizeBookingSlots,
  bookingGridTimes,
  bookingTimeToMinutes,
  bookingMinutesToTime,
  accraDateKey,
  accraMinutesOfDay,
  computeDateAvailability,
  dateHasAvailability
};
