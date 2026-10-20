'use strict';
/*
 * Keeps secrets (today: the Vercel Deployment Protection bypass token) out of everything the suite prints or writes.
 *
 * The token is read from the environment (VERCEL_PROTECTION_BYPASS), never from the command line, registered here, and then:
 *   - stdout and stderr are wrapped, so nothing printed can contain it (including a crash stack trace),
 *   - every report file goes through write(), which replaces it before the bytes reach the disk,
 *   - scanDir() re-reads the whole output folder afterwards as a last line of defence: a file written by any code path that
 *     bypassed write() is deleted and reported (by name, never by value).
 * Registered forms: the raw value plus its URL-encoded, base64 and base64url spellings, since a header, a URL and a log line
 * can each carry it differently.
 */
const fs = require('fs');
const path = require('path');

const MIN_LENGTH = 8;
const needles = new Set(); // secrets: masked in output AND searched for by scanDir
const maskOnly = new Set(); // private but legitimately present in some files (the phone number): masked in output, not searched for
const MASK = '[redacted]';

function forms(secret) {
  const b64 = Buffer.from(secret, 'utf8').toString('base64');
  return [secret, encodeURIComponent(secret), b64, b64.replace(/=+$/, ''), b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')].filter((s) => s.length >= MIN_LENGTH);
}

function register(secret) {
  if (typeof secret !== 'string' || secret.length < MIN_LENGTH) throw new Error(`a secret must be at least ${MIN_LENGTH} characters (the value is not shown)`);
  for (const f of forms(secret)) needles.add(f);
}

// Mask a private value in what is printed and written without treating its presence in a file as a leak.
function registerMask(value) {
  if (typeof value !== 'string' || value.length < MIN_LENGTH) throw new Error(`a masked value must be at least ${MIN_LENGTH} characters`);
  for (const f of forms(value)) maskOnly.add(f);
}

function redact(text) {
  let out = String(text);
  for (const n of [...needles, ...maskOnly]) if (out.includes(n)) out = out.split(n).join(MASK);
  return out;
}

const contains = (text) => [...needles].some((n) => String(text).includes(n));

function installStreams() {
  for (const stream of [process.stdout, process.stderr]) {
    const original = stream.write.bind(stream);
    stream.write = (chunk, ...rest) => original(typeof chunk === 'string' ? redact(chunk) : Buffer.isBuffer(chunk) ? Buffer.from(redact(chunk.toString('latin1')), 'latin1') : chunk, ...rest);
  }
}

// Redacted write for text reports.
function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, redact(content));
}

// Returns the files under dir that contain a registered secret (and deletes them), names only.
function scanDir(dir) {
  const hits = [];
  (function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (contains(fs.readFileSync(p, 'latin1'))) { hits.push(path.relative(dir, p)); fs.rmSync(p, { force: true }); }
    }
  })(dir);
  return hits;
}

module.exports = { register, registerMask, redact, contains, forms, installStreams, write, scanDir, MASK };
