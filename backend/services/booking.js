function calculateBookingFee(service, songCount, fees = {}) {
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
  return Number((fullProductionRate * normalizedSongCount * 0.8).toFixed(2));
}

function isAvailableBookingSlot(dateValue, timeValue) {
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || ''));
  const timeParts = /^(\d{2}):(\d{2})$/.exec(String(timeValue || ''));
  if (!dateParts || !timeParts) return false;
  const [, yearValue, monthValue, dayValue] = dateParts;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || ![0, 2, 3, 4].includes(date.getUTCDay())) return false;
  const hour = Number(timeParts[1]);
  const minute = Number(timeParts[2]);
  if (hour > 23 || minute > 59) return false;
  const minutes = hour * 60 + minute;
  return minutes >= 11 * 60 && minutes + 140 <= 21 * 60;
}

function areAvailableBookingSlots(slots, expectedCount) {
  if (!Array.isArray(slots) || slots.length !== expectedCount || !slots.every(slot => isAvailableBookingSlot(slot?.date, slot?.time))) return false;
  return slots.every((slot, index) => slots.slice(index + 1).every(otherSlot => {
    if (slot.date !== otherSlot.date) return true;
    const start = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
    return start(slot.time) + 140 <= start(otherSlot.time) || start(otherSlot.time) + 140 <= start(slot.time);
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

module.exports = { calculateBookingFee, areAvailableBookingSlots, isAvailableBookingSlot, normalizeBookingSlots };
