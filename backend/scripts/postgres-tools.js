const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { Pool } = require('pg');

function getDatabaseConfig() {
  // Backup and restore operations need a direct connection. Pooled endpoints
  // such as Neon's do not support pg_dump/pg_restore reliably, so prefer the
  // explicit backup URL and the unpooled URL before the runtime connection.
  const connectionString = process.env.BACKUP_DATABASE_URL
    || process.env.DATABASE_URL_UNPOOLED
    || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Configure DATABASE_URL (or BACKUP_DATABASE_URL / DATABASE_URL_UNPOOLED) with a PostgreSQL connection string.');
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must use the postgres:// or postgresql:// protocol.');
  }
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (!database) throw new Error('DATABASE_URL must include a database name.');
  return {
    connectionString,
    host: url.hostname,
    port: Number(url.port) || 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    sslmode: url.searchParams.get('sslmode'),
    channelBinding: url.searchParams.get('channel_binding')
  };
}

function validateDatabaseName(name) {
  if (!name || !/^[A-Za-z0-9_$][A-Za-z0-9_$-]*$/.test(name)) {
    throw new Error('Database name is missing or contains unsupported characters.');
  }
  return name;
}

function getPostgresBinary(tool) {
  const configured = process.env[tool === 'pg_dump' ? 'PGDUMP_PATH' : 'PGRESTORE_PATH'];
  const executable = process.platform === 'win32' ? `${tool}.exe` : tool;
  const candidates = [configured, executable].filter(Boolean);

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && fs.existsSync(candidate)) return candidate;
    if (!path.isAbsolute(candidate) && candidate === executable) return candidate;
  }
  throw new Error(`Could not find ${executable}. Set ${tool === 'pg_dump' ? 'PGDUMP_PATH' : 'PGRESTORE_PATH'}.`);
}

function clientArgs(config, database = config.database) {
  validateDatabaseName(database);
  if (!config.host || !config.user) throw new Error('Configure DATABASE_URL with a PostgreSQL host and user.');
  return [
    '--host', config.host,
    '--port', String(config.port),
    '--username', config.user,
    '--dbname', database,
    '--no-password'
  ];
}

function childEnvironment(config) {
  const env = { ...process.env };
  delete env.PGPASSWORD;
  if (config.password) env.PGPASSWORD = config.password;
  if (config.sslmode) env.PGSSLMODE = config.sslmode;
  if (config.channelBinding) env.PGCHANNELBINDING = config.channelBinding;
  return env;
}

function runClient(tool, args, config, { inputPath, outputPath } = {}) {
  const child = spawn(getPostgresBinary(tool), args, {
    env: childEnvironment(config),
    stdio: [inputPath ? 'pipe' : 'ignore', outputPath ? 'pipe' : 'ignore', 'pipe']
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => {
    if (stderr.length < 8192) stderr += chunk.slice(0, 8192 - stderr.length);
  });

  const processDone = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => code === 0
      ? resolve()
      : reject(new Error(`${tool} exited with code ${code}${stderr.trim() ? `: ${stderr.trim()}` : ''}`)));
  });
  const streamWork = outputPath
    ? pipeline(child.stdout, fs.createWriteStream(outputPath, { flags: 'wx' }))
    : Promise.resolve();
  const inputWork = inputPath
    ? pipeline(fs.createReadStream(inputPath), child.stdin)
    : Promise.resolve();
  return Promise.all([processDone, streamWork, inputWork]).then(() => undefined);
}

function connectionForDatabase(config, database) {
  const url = new URL(config.connectionString);
  url.pathname = `/${validateDatabaseName(database)}`;
  return new Pool({ connectionString: url.toString() });
}

async function getTableCounts(config, database = config.database) {
  const pool = connectionForDatabase(config, database);
  try {
    const { rows: tables } = await pool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = current_schema()
      ORDER BY tablename
    `);
    const counts = {};
    for (const { tablename } of tables) {
      const escapedName = `"${String(tablename).replace(/"/g, '""')}"`;
      const { rows } = await pool.query(`SELECT COUNT(*) AS "rowCount" FROM ${escapedName}`);
      counts[tablename] = Number(rows[0].rowCount);
    }
    return counts;
  } finally {
    await pool.end();
  }
}

async function assertDatabaseEmpty(config, database) {
  const pool = connectionForDatabase(config, database);
  try {
    const { rows } = await pool.query(`
      SELECT COUNT(*) AS object_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema()
        AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
    `);
    if (Number(rows[0].object_count) !== 0) {
      throw new Error(`Refusing to restore into non-empty database "${database}".`);
    }
  } finally {
    await pool.end();
  }
}

module.exports = {
  assertDatabaseEmpty,
  clientArgs,
  getDatabaseConfig,
  getTableCounts,
  runClient,
  validateDatabaseName
};
