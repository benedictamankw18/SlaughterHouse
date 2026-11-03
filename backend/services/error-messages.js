function databaseError(action, error) {
  const code = error?.code;
  const known = {
    ER_NO_SUCH_TABLE: 'The required database table is missing. Run node database.js to initialize the database.',
    ER_BAD_FIELD_ERROR: 'The database schema is missing a required column. Run node database.js to update the database.',
    ER_DATA_TOO_LONG: 'One of the submitted values is longer than the database allows.',
    ER_BAD_NULL_ERROR: 'A required database value was empty.',
    ER_DUP_ENTRY: 'A record with the same unique value already exists.'
  };
  if (known[code]) return known[code];
  return `${action} Database error${code ? ` (${code})` : ''}.`;
}

module.exports = { databaseError };
