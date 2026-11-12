const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const frontendDirectory = path.join(__dirname, '..', '..', 'frontend');
const legacyInlinePages = new Set(['out.html', 'songmeta_1.html', 'songmeta_2.html', 'songmeta_3.html', 'songmeta_4.html']);
const legacyNginxRule = String.raw`~^/(?:out|songmeta_[1-4])\.html$ "'self' 'unsafe-inline'";`;

function inlineScriptHashes(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter(([, attributes, body]) => !/\bsrc\s*=/i.test(attributes)
      && body.trim()
      && !/\btype\s*=\s*["']application\/ld\+json/i.test(attributes))
    .map(([, , body]) => `sha256-${crypto.createHash('sha256').update(body).digest('base64')}`);
}

function scriptSource(value) {
  return value.match(/(?:^|;\s*)script-src\s+([^;]+)/)?.[1];
}

function vercelPolicies() {
  const config = JSON.parse(fs.readFileSync(path.join(frontendDirectory, '..', 'vercel.json'), 'utf8'));
  return new Map(config.headers.flatMap(rule => {
    const header = rule.headers.find(item => item.key.toLowerCase() === 'content-security-policy');
    return header ? [[rule.source, header.value]] : [];
  }));
}

function htmlPagePaths(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return htmlPagePaths(fullPath);
    return entry.name.endsWith('.html') ? [fullPath] : [];
  });
}

function nginxPolicyFor(nginxMap, pageName) {
  const requestPath = `/${pageName}`;
  for (const line of nginxMap.split(/\r?\n/)) {
    const match = line.match(/^\s*(\S+)\s+"([^"]+)"\s*;$/);
    if (!match || !match[1].startsWith('~')) continue;
    if (new RegExp(match[1].slice(1)).test(requestPath)) return match[2];
  }
  return null;
}

test('production CSP limits application inline scripts to reviewed hashes', () => {
  const nginx = fs.readFileSync(path.join(frontendDirectory, 'nginx.conf'), 'utf8');
  const nginxMap = nginx.match(/map \$uri \$script_sources \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(nginxMap, 'nginx must map script sources by request path');
  assert.match(nginxMap, /default "'self'";/);
  assert.ok(nginxMap.includes(legacyNginxRule));
  assert.match(nginx, /connect-src 'self';/);
  assert.ok(nginxMap.includes(`/ "'self' 'sha256-XL78bdzNaXSWc4jvroFmjWfuAuS+6z4mV9+Zt+6nvoc='";`), 'nginx root policy must allow the reviewed index.html hash');

  const policies = vercelPolicies();
  const globalPolicy = policies.get('/(.*)');
  assert.ok(globalPolicy);
  assert.match(globalPolicy, /connect-src 'self';/);
  assert.doesNotMatch(globalPolicy, /connect-src[^;]*(?:https:|wss:)/);

  for (const pagePath of htmlPagePaths(frontendDirectory)) {
    const pageName = path.relative(frontendDirectory, pagePath).split(path.sep).join('/');
    if (legacyInlinePages.has(pageName)) {
      assert.ok(nginxMap.includes(legacyNginxRule));
      continue;
    }

    const hashes = inlineScriptHashes(fs.readFileSync(pagePath, 'utf8'));
    const routePolicy = policies.get(`/${pageName}`);
    assert.ok(routePolicy, `Vercel must apply a page-specific script policy to ${pageName}`);
    const vercelScriptSource = scriptSource(routePolicy);
    assert.ok(vercelScriptSource, `Vercel policy for ${pageName} must set script-src`);
    const nginxScriptSource = nginxPolicyFor(nginxMap, pageName) || "'self'";
    if (hashes.length) {
      for (const hash of hashes) {
        assert.ok(vercelScriptSource.includes(`'${hash}'`), `Vercel policy for ${pageName} must allow its exact inline script hash`);
        assert.ok(nginxScriptSource.includes(`'${hash}'`), `nginx policy for ${pageName} must allow its exact inline script hash`);
      }
    } else {
      assert.equal(vercelScriptSource, "'self'", `Vercel policy for ${pageName} must disallow inline scripts`);
      assert.equal(nginxScriptSource, "'self'", `nginx policy for ${pageName} must disallow inline scripts`);
    }
  }
});
