const { types } = require('pg');

types.setTypeParser(types.builtins.INT8, value => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : value;
});

function toPostgresQuery(query) {
  let output = '';
  let parameterIndex = 0;
  let state = 'normal';

  for (let index = 0; index < query.length; index += 1) {
    const character = query[index];
    const next = query[index + 1];

    if (state === 'lineComment') {
      output += character;
      if (character === '\n') state = 'normal';
      continue;
    }

    if (state === 'blockComment') {
      output += character;
      if (character === '*' && next === '/') {
        output += next;
        index += 1;
        state = 'normal';
      }
      continue;
    }

    if (state === 'single' || state === 'double' || state === 'backtick') {
      if (state === 'backtick') {
        if (character === '`') {
          output += '"';
          if (next === '`') {
            output += '"';
            index += 1;
          } else {
            state = 'normal';
          }
        } else {
          output += character;
        }
        continue;
      }

      output += character;
      const closingCharacter = state === 'single' ? "'" : '"';
      if (character === closingCharacter) {
        if (next === closingCharacter && state !== 'backtick') {
          output += next;
          index += 1;
        } else {
          state = 'normal';
        }
      } else if (character === '\\' && state === 'single' && next) {
        output += next;
        index += 1;
      }
      continue;
    }

    if (character === "'") {
      state = 'single';
      output += character;
    } else if (character === '"') {
      state = 'double';
      output += character;
    } else if (character === '`') {
      state = 'backtick';
      output += '"';
    } else if (character === '-' && next === '-') {
      state = 'lineComment';
      output += '--';
      index += 1;
    } else if (character === '/' && next === '*') {
      state = 'blockComment';
      output += '/*';
      index += 1;
    } else if (character === '?') {
      parameterIndex += 1;
      output += `$${parameterIndex}`;
    } else {
      output += character;
    }
  }

  return output;
}

function isInsertWithId(query) {
  const match = /^\s*INSERT\s+INTO\s+([a-z_]+)/i.exec(query);
  if (!match) return false;
  return new Set([
    'users', 'beats', 'merchandise', 'sales', 'orders', 'customization_requests',
    'customer_reviews', 'withdrawals', 'bookings', 'order_items', 'payments',
    'licenses', 'audit_logs', 'notifications', 'wishlists', 'account_tokens',
    'booking_availability', 'merchandise_categories', 'merchandise_variants',
    'user_sessions', 'download_events', 'payment_webhook_events',
    'order_fulfillment_history', 'stream_releases', 'license_certificates',
    'license_certificate_history', 'email_outbox'
  ]).has(match[1].toLowerCase());
}

function withReturningId(query) {
  if (!isInsertWithId(query) || /\bRETURNING\b/i.test(query)) return query;
  return `${query.trim().replace(/;$/, '')} RETURNING id`;
}

function summarizeResult(result) {
  const insertId = result.rows?.[0]?.id;
  return {
    ...result,
    insertId: insertId === undefined ? undefined : Number(insertId),
    affectedRows: result.rowCount
  };
}

module.exports = { isInsertWithId, summarizeResult, toPostgresQuery, withReturningId };
