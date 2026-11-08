const logger = require('../services/logger');
const { hashPassword, validatePassword } = require('../services/security');

function readOption(argv, name) {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for --${name}.`);
  return value;
}

function parseOptions(argv = process.argv.slice(2), env = process.env) {
  return {
    email: String(readOption(argv, 'email') ?? env.ADMIN_EMAIL ?? '').trim().toLowerCase(),
    name: String(readOption(argv, 'name') ?? env.ADMIN_NAME ?? '').trim(),
    password: String(readOption(argv, 'password') ?? env.ADMIN_PASSWORD ?? ''),
    update: argv.includes('--update')
  };
}

function getRow(database, query, parameters = []) {
  return new Promise((resolve, reject) => {
    database.get(query, parameters, (error, row) => error ? reject(error) : resolve(row));
  });
}

function runStatement(database, query, parameters = []) {
  return new Promise((resolve, reject) => {
    database.run(query, parameters, function (error) {
      if (error) reject(error);
      else resolve({ lastID: this?.lastID, changes: this?.changes });
    });
  });
}

async function createAdmin(database, options, { hash = hashPassword } = {}) {
  const email = String(options?.email || '').trim().toLowerCase();
  const name = String(options?.name || '').trim();
  const password = String(options?.password || '');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Provide a valid administrator email with --email or ADMIN_EMAIL.');
  }
  if (!name || name.length > 255) {
    throw new Error('Provide an administrator name with --name or ADMIN_NAME (up to 255 characters).');
  }
  const passwordError = validatePassword(password);
  if (passwordError) throw new Error(passwordError);

  const existing = await getRow(database, 'SELECT id FROM users WHERE lower(email) = lower(?)', [email]);
  if (existing && !options.update) {
    throw new Error(`An account already exists for ${email}. Pass --update to reset its password and ensure the super_admin role.`);
  }

  const passwordHash = await hash(password);
  if (existing) {
    await runStatement(
      database,
      `UPDATE users
       SET name = ?, role = 'super_admin', password_hash = ?,
           email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP)
       WHERE id = ?`,
      [name, passwordHash, existing.id]
    );
    return { id: existing.id, email, created: false };
  }

  const result = await runStatement(
    database,
    `INSERT INTO users (name, email, role, password_hash, email_verified_at)
     VALUES (?, ?, 'super_admin', ?, CURRENT_TIMESTAMP)`,
    [name, email, passwordHash]
  );
  return { id: result.lastID, email, created: true };
}

async function main() {
  require('dotenv').config();
  const options = parseOptions();
  const database = require('../database');
  try {
    const result = await createAdmin(database, options);
    logger.info('super_admin_bootstrapped', {
      id: result.id,
      email: result.email,
      created: result.created
    });
  } finally {
    await database.close().catch(() => {});
  }
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`Admin bootstrap failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { parseOptions, createAdmin };
