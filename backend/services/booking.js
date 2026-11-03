function calculateBookingFee(service, songCount, fees) {
  if (service !== 'ep-album') return fees[service];
  if (!Number.isInteger(songCount) || songCount < 1 || songCount > 12) return null;
  const fullProductionRate = fees['full-production'];
  if (!Number.isFinite(fullProductionRate) || fullProductionRate <= 0) return null;
  return Number((fullProductionRate * songCount * 0.8).toFixed(2));
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
  const minutes = Number(timeParts[1]) * 60 + Number(timeParts[2]);
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
  return slots.map(slot => ({ date: slot.date, time: slot.time }));
}

module.exports = { calculateBookingFee, areAvailableBookingSlots, isAvailableBookingSlot, normalizeBookingSlots };
