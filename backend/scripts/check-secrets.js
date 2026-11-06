#!/usr/bin/env node
// Scans every tracked file for credential patterns. Output is redacted so running the
// check never prints a usable secret into a terminal or log.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.tif', '.tiff',
  '.pdf', '.mp3', '.wav', '.ogg', '.m4a', '.zip', '.gz', '.tar', '.woff',
  '.woff2', '.ttf', '.eot', '.mp4', '.mov', '.sqlite', '.db'
]);

const PATTERNS = [
  { name: 'Paystack live secret key', regex: /sk_live_[0-9A-Za-z]{16,}/g },
  { name: 'Paystack test secret key', regex: /sk_test_(?!your_)[0-9A-Za-z]{16,}/g },
  { name: 'Resend API key', regex: /re_[0-9A-Za-z]{20,}/g },
  { name: 'AWS access key ID', regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: 'GitHub token', regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[0-9A-Za-z]{20,}\b|\bgithub_pat_[0-9A-Za-z_]{20,}\b/g },
  { name: 'Private key block', regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g }
];

function redact(value) {
  if (value.length <= 10) return '*'.repeat(value.length);
  return `${value.slice(0, 4)}${'*'.repeat(Math.min(8, value.length - 8))}${value.slice(-4)}`;
}

function looksBinary(buffer) {
  const sample = buffer.subarray(0, 8000);
  return sample.includes(0);
}

function repoRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}

function trackedFiles(root) {
  const output = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  return output.split('\0').filter(Boolean);
}

function scanFile(root, relativePath) {
  if (SKIP_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) return [];

  let buffer;
  try {
    buffer = fs.readFileSync(path.join(root, relativePath));
  } catch (error) {
    throw new Error(`Could not read tracked file ${relativePath}: ${error.message}`);
  }
  if (looksBinary(buffer)) return [];

  const text = buffer.toString('utf8');
  const lines = text.split(/\r?\n/);
  const findings = [];

  lines.forEach((line, index) => {
    for (const pattern of PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(line)) !== null) {
        findings.push({
          file: relativePath,
          line: index + 1,
          name: pattern.name,
          preview: redact(match[0])
        });
      }
    }
  });

  return findings;
}

function main() {
  let root;
  try {
    root = repoRoot();
  } catch {
    console.error('check:secrets must run inside a git repository.');
    process.exit(2);
  }

  const findings = [];
  const files = trackedFiles(root);
  try {
    for (const file of files) {
      findings.push(...scanFile(root, file));
    }
  } catch (error) {
    console.error(`Secret scan incomplete: ${error.message}`);
    process.exit(2);
  }

  if (!findings.length) {
    console.log(`No credential patterns found in ${files.length} tracked files.`);
    return;
  }

  console.error(`Found ${findings.length} possible credential(s) in tracked files:`);
  for (const finding of findings) {
    console.error(`  ${finding.file}:${finding.line}  ${finding.name}  ${finding.preview}`);
  }
  console.error('Remove or rotate these values before committing.');
  process.exit(1);
}

main();
