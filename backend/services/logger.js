const SENSITIVE_KEY = /authorization|cookie|password|token|secret|api[_-]?key|mysql_pwd/i;
const SENSITIVE_VALUE = [
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /\b(?:sk_live|sk_test|re)_[A-Za-z0-9_-]{12,}\b/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g
];

function redactString(value) {
  return SENSITIVE_VALUE.reduce((text, pattern) => text.replace(pattern, '[REDACTED]'), value);
}

function redact(value, key = '') {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return redactString(value);
  if (value instanceof Error) return { name: value.name, message: redactString(value.message), code: value.code };
  if (Array.isArray(value)) return value.map(item => redact(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([field, item]) => [field, redact(item, field)]));
  }
  return value;
}

function write(level, message, fields = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    message: redactString(String(message)),
    ...redact(fields)
  };
  const serialized = JSON.stringify(record);
  if (level === 'error') console.error(serialized);
  else if (level === 'warn') console.warn(serialized);
  else console.log(serialized);
}

module.exports = {
  info: (message, fields) => write('info', message, fields),
  warn: (message, fields) => write('warn', message, fields),
  error: (message, fields) => write('error', message, fields),
  redact
};
