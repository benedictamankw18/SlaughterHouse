const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const mysql = require('mysql2/promise');

function getDatabaseConfig() {
  if (process.env.MYSQL_URL && !process.env.MYSQL_URL.includes('user:password')) {
    const url = new URL(process.env.MYSQL_URL);
    if (url.protocol !== 'mysql:') throw new Error('MYSQL_URL must use the mysql: protocol.');
    return {
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    };
  }
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME
  };
}

function validateDatabaseName(name) {
  if (!name || !/^[A-Za-z0-9_$][A-Za-z0-9_$-]*$/.test(name)) {
    throw new Error('Database name is missing or contains unsupported characters.');
  }
  return name;
}

function getMysqlBinary(tool) {
  const configured = process.env[tool === 'mysqldump' ? 'MYSQLDUMP_PATH' : 'MYSQL_PATH'];
  const executable = process.platform === 'win32' ? `${tool}.exe` : tool;
  const candidates = [
    configured,
    path.join('C:\\xampp\\mysql\\bin', executable),
    path.join('C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin', executable),
    executable
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && fs.existsSync(candidate)) return candidate;
    if (!path.isAbsolute(candidate) && candidate === executable) return candidate;
  }
  throw new Error(`Could not find ${executable}. Set ${tool === 'mysqldump' ? 'MYSQLDUMP_PATH' : 'MYSQL_PATH'}.`);
}

function clientArgs(config, database = config.database) {
  validateDatabaseName(database);
  if (!config.host || !config.user) throw new Error('Configure MYSQL_URL or DB_HOST, DB_USER, and DB_NAME first.');
  return ['--host', config.host, '--port', String(config.port), '--user', config.user, '--default-character-set=utf8mb4', database];
}

function runClient(tool, args, config, { inputPath, outputPath } = {}) {
  const binary = getMysqlBinary(tool);
  const childEnvironment = { ...process.env };
  delete childEnvironment.MYSQL_PWD;
  if (config.password) childEnvironment.MYSQL_PWD = config.password;
  const child = spawn(binary, args, {
    env: childEnvironment,
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

async function getTableCounts(config, database = config.database) {
  validateDatabaseName(database);
  const connection = await mysql.createConnection({ ...config, database });
  try {
    const [tables] = await connection.execute(
      'SELECT TABLE_NAME AS tableName FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = ? ORDER BY TABLE_NAME',
      [database, 'BASE TABLE']
    );
    const counts = {};
    for (const { tableName } of tables) {
      const escapedName = `\`${String(tableName).replace(/`/g, '``')}\``;
      const [rows] = await connection.query(`SELECT COUNT(*) AS rowCount FROM ${escapedName}`);
      counts[tableName] = Number(rows[0].rowCount);
    }
    return counts;
  } finally {
    await connection.end();
  }
}

async function assertDatabaseEmpty(config, database) {
  validateDatabaseName(database);
  const connection = await mysql.createConnection({ ...config, database });
  try {
    const [tables] = await connection.execute(
      'SELECT COUNT(*) AS objectCount FROM information_schema.tables WHERE TABLE_SCHEMA = ?',
      [database]
    );
    const [routines] = await connection.execute(
      'SELECT COUNT(*) AS routineCount FROM information_schema.routines WHERE ROUTINE_SCHEMA = ?',
      [database]
    );
    const [events] = await connection.execute(
      'SELECT COUNT(*) AS eventCount FROM information_schema.events WHERE EVENT_SCHEMA = ?',
      [database]
    );
    if (Number(tables[0].objectCount) + Number(routines[0].routineCount) + Number(events[0].eventCount) !== 0) {
      throw new Error(`Refusing to restore into non-empty database "${database}".`);
    }
  } finally {
    await connection.end();
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
