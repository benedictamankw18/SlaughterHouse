#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DUMP_EXTENSIONS = new Set(['.dump', '.backup', '.bak', '.sqlite', '.sqlite3', '.db']);
const NAMED_EXPORT = /(?:dump|export|backup|snapshot)(?:[-_.]|$)/i;
const COMPRESSED_SQL_EXPORT = /\.sql\.(?:gz|zip)$/i;

function isDatabaseDump(relativePath) {
  const normalizedPath = relativePath.replace(/\\/g, '/');
  const basename = path.posix.basename(normalizedPath);
  const extension = path.posix.extname(basename).toLowerCase();
  return DUMP_EXTENSIONS.has(extension)
    || (extension === '.sql' && (normalizedPath.startsWith('db/') || NAMED_EXPORT.test(basename)))
    || COMPRESSED_SQL_EXPORT.test(basename);
}

function findDatabaseDumps(paths) {
  return paths.filter(isDatabaseDump);
}

function trackedFiles(root) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

function main() {
  let root;
  try {
    root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    console.error('check:database-dumps must run inside a git repository.');
    process.exit(2);
  }

  const dumps = findDatabaseDumps(trackedFiles(root).filter(file => fs.existsSync(path.join(root, file))));
  if (!dumps.length) {
    console.log('No tracked database dumps or exports found.');
    return;
  }

  console.error('Database dumps and exports must not be tracked:');
  for (const file of dumps) console.error(`  ${file}`);
  process.exit(1);
}

if (require.main === module) main();

module.exports = { findDatabaseDumps, isDatabaseDump };
