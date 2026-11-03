const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+()\d\s-]{7,30}$/;

function text(value, field, { required = false, max = 255 } = {}) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (required && !normalized) return `${field} is required.`;
  if (normalized.length > max) return `${field} must be ${max} characters or fewer.`;
  return null;
}

function email(value, field = 'Email') {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!emailPattern.test(normalized)) return `${field} must be a valid email address.`;
  if (normalized.length > 255) return `${field} must be 255 characters or fewer.`;
  return null;
}

function phone(value) {
  if (typeof value !== 'string' || !phonePattern.test(value.trim())) return 'Phone number must contain 7–30 valid phone characters.';
  return null;
}

function integer(value, field, { min, max, required = true } = {}) {
  if (!required && (value === undefined || value === null || value === '')) return null;
  if (!Number.isInteger(Number(value))) return `${field} must be a whole number.`;
  const number = Number(value);
  if (number < min || number > max) return `${field} must be between ${min} and ${max}.`;
  return null;
}

function money(value, field, { required = true } = {}) {
  if (!required && (value === undefined || value === null || value === '')) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 100000000) return `${field} must be greater than 0 and no more than 100,000,000.`;
  return null;
}

module.exports = { text, email, phone, integer, money };
