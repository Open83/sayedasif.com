#!/usr/bin/env node
'use strict';
/*
 * Regression test: the Vercel bypass token must never be printed or written by the suite, and must still reach the preview.
 *
 *   node selftest-token.js            (about two minutes; needs no real token, preview or network)
 *
 * It uses a synthetic canary, never a real credential. A fake "protected preview" answers 401 unless the canary arrives in the
 * x-vercel-protection-bypass header, and otherwise forwards to the repository served by lib/server.js. The real run.js is run
 * against it with the canary in the environment, then stdout, stderr and every file in the output folder are scanned for the
 * canary in its raw, URL-encoded, base64 and base64url spellings.
 *
 *   1. canary set, header accepted: the check gets past the login wall, the proxy saw the header from Node and from the browser,
 *      and the canary is nowhere in the output.
 *   2. no token: check 20 fails with a readable message that names the environment variable.
 *   3. wrong token: the message says a token was sent; neither the wrong nor the right value is printed.
 *   4. legacy `--bypass <canary>`: refused with exit code 2, canary not echoed.
 *   5. origin scoping: when a redirect leads to another origin, the token is not sent there.
 *   6. sensitivity: a deliberately leaky copy of run.js (no redaction, options dumped) MUST be caught by the same scan. If it
 *      is not, this test fails, because a scan that cannot fail proves nothing.
 *
 * Exit code 1 if any assertion fails.
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const server = require('./lib/server');
const redact = require('./lib/redact');
const { ROOT } = require('./lib/site');

const CANARY = 'CANARY-selftest-7d1e5a90c3b24f68-not-a-real-token';
const WRONG = 'WRONGCANARY-selftest-41b8d2e6a0f97c35-also-fake';
const results = [];
const ok = (cond, name, detail) => { results.push({ cond: !!cond, name, detail }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail && !cond ? `  ::  ${detail}` : ''}`); };

// ---------------------------------------------------------------- fake protected preview
async function startProxy(originUrl, otherOriginUrl) {
  const seen = { authorized: 0, rejected: 0, browserAuthorized: 0, leakedToOther: 0 };
  const srv = http.createServer((req, res) => {
    const token = req.headers['x-vercel-protection-bypass'];
    if (token !== CANARY) {
      seen.rejected++;
      res.writeHead(401, { 'content-type': 'text/html' });
      return res.end('<html><title>Authentication Required</title><body>Authentication Required. vercel.com/sso</body></html>');
    }
    seen.authorized++;
    if (/Chrome|Headless/i.test(req.headers['user-agent'] || '')) seen.browserAuthorized++;
    if (req.url === '/capabilities/' && otherOriginUrl) { res.writeHead(301, { location: otherOriginUrl + '/' }); return res.end(); }
    const headers = { ...req.headers };
    delete headers['x-vercel-protection-bypass'];
    delete headers.host;
    const up = http.request(originUrl + req.url, { method: req.method, headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${srv.address().port}`, seen, close: () => new Promise((r) => srv.close(r)) };
}

async function startOther() {
  const seen = { requests: 0, withToken: 0 };
  const srv = http.createServer((req, res) => {
    seen.requests++;
    if (Object.keys(req.headers).some((k) => k === 'x-vercel-protection-bypass') || JSON.stringify(req.headers).includes(CANARY)) seen.withToken++;
    res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><title>elsewhere</title></html>');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${srv.address().port}`, seen, close: () => new Promise((r) => srv.close(r)) };
}

// ---------------------------------------------------------------- run run.js and scan everything it produced
function runSuite(runner, previewUrl, env, extraArgs = []) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-token-selftest-'));
  const childEnv = { ...process.env, ...env };
  if (!('VERCEL_PROTECTION_BYPASS' in env)) delete childEnv.VERCEL_PROTECTION_BYPASS;
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [runner, '--only', '20', '--preview', previewUrl, '--out', out, ...extraArgs], { cwd: __dirname, env: childEnv });
    let stdout = '', stderr = '';
    c.stdout.on('data', (d) => (stdout += d)); c.stderr.on('data', (d) => (stderr += d));
    c.on('close', (code) => resolve({ code, stdout, stderr, out }));
  });
}

function scan(res, secrets) {
  const hits = [];
  const needles = secrets.flatMap((s) => redact.forms(s));
  const look = (where, text) => { for (const n of needles) if (text.includes(n)) { hits.push(where); break; } };
  look('stdout', res.stdout); look('stderr', res.stderr);
  (function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else look(path.relative(res.out, p), fs.readFileSync(p, 'latin1')); }
  })(res.out);
  return hits;
}
const result20 = (res) => { try { return JSON.parse(fs.readFileSync(path.join(res.out, 'results.json'), 'utf8')).results.find((r) => r.id === 20); } catch { return null; } };
const cleanup = (res) => fs.rmSync(res.out, { recursive: true, force: true });

(async () => {
  const origin = await server.start({ root: ROOT });
  const other = await startOther();
  const proxy = await startProxy(origin.url, null);
  const proxyWithRedirect = await startProxy(origin.url, other.url);
  const tmpRunner = path.join(__dirname, '.selftest-leaky-run.js');
  try {
    // 1. token accepted, header sent, nothing leaked
    const a = await runSuite('run.js', proxy.url, { VERCEL_PROTECTION_BYPASS: CANARY });
    const ra = result20(a);
    const walled = ra && ra.details.some((l) => /reachable by the check|Authentication Required|login page/.test(l) && l.startsWith('FAIL'));
    ok(ra && !walled, '1a. with the token set the check gets past the login wall', ra ? ra.details.filter((l) => l.startsWith('FAIL')).slice(0, 2).join(' | ') : `no results.json (exit ${a.code}): ${a.stderr.slice(0, 200)}`);
    ok(proxy.seen.authorized >= 40, `1b. Node requests carried the header (${proxy.seen.authorized} authorized requests reached the preview)`, `${proxy.seen.authorized}`);
    ok(proxy.seen.browserAuthorized >= 1, `1c. the browser smoke test carried the header (${proxy.seen.browserAuthorized} browser requests authorized)`, `${proxy.seen.browserAuthorized}`);
    const hitsA = scan(a, [CANARY]);
    ok(hitsA.length === 0, '1d. the canary is not in stdout, stderr, report.md, results.json or any detail file', hitsA.join(', '));
    ok(fs.existsSync(path.join(a.out, 'results.json')) && fs.existsSync(path.join(a.out, 'report.md')), '1e. the report files were still written', `exit ${a.code}`);
    // The WhatsApp check's evidence line contains the wa.me URL, so the owner's number would be printed without the mask.
    const phoneDigits = require('./expected.json').phone.parts.join('');
    const hitsPhone = scan(a, [phoneDigits]);
    ok(hitsPhone.length === 0, '1f. the owner\'s phone number is masked in stdout, stderr, report.md, results.json and the detail files', hitsPhone.join(', '));
    const phoneInDetails = fs.readFileSync(path.join(a.out, 'details', 'check-20.txt'), 'utf8');
    ok(/wa\.me\/91\[redacted\]/.test(phoneInDetails), '1g. control: the wa.me evidence line is present, with the number replaced by [redacted]', phoneInDetails.split('\n').find((l) => l.includes('wa.me'))?.slice(0, 80) || 'no wa.me line');
    cleanup(a);

    // 2. no token
    const b = await runSuite('run.js', proxy.url, {});
    const rb = result20(b);
    const failB = rb && rb.details.find((l) => l.startsWith('FAIL'));
    ok(failB && /VERCEL_PROTECTION_BYPASS/.test(failB) && /no bypass token is set/.test(failB), '2. without a token the check fails readably and names the environment variable', failB || 'no FAIL line');
    ok(scan(b, [CANARY]).length === 0, '2b. nothing leaked (trivially: no token existed)');
    cleanup(b);

    // 3. wrong token
    const c = await runSuite('run.js', proxy.url, { VERCEL_PROTECTION_BYPASS: WRONG });
    const rc = result20(c);
    const failC = rc && rc.details.find((l) => l.startsWith('FAIL'));
    ok(failC && /although a bypass token was sent/.test(failC), '3a. with a wrong token the message says a token was sent', failC || 'no FAIL line');
    const hitsC = scan(c, [WRONG, CANARY]);
    ok(hitsC.length === 0, '3b. neither the wrong nor the right value is printed or written', hitsC.join(', '));
    cleanup(c);

    // 4. legacy argument
    const d = await runSuite('run.js', proxy.url, {}, ['--bypass', CANARY]);
    ok(d.code === 2 && /VERCEL_PROTECTION_BYPASS/.test(d.stderr), '4a. --bypass <token> is refused (exit 2) and the message names the environment variable', `exit ${d.code}; ${d.stderr.slice(0, 160)}`);
    ok(scan(d, [CANARY]).length === 0, '4b. the refused argument is not echoed');
    const d2 = await runSuite('run.js', proxy.url, {}, [`--bypass=${CANARY}`]);
    ok(d2.code === 2 && scan(d2, [CANARY]).length === 0, '4c. --bypass=<token> is refused too and not echoed', `exit ${d2.code}`);
    cleanup(d); cleanup(d2);

    // 5. origin scoping: /capabilities/ is a configured redirect; here it leads to another origin
    const e = await runSuite('run.js', proxyWithRedirect.url, { VERCEL_PROTECTION_BYPASS: CANARY });
    ok(other.seen.requests >= 1, '5a. the redirect to another origin was really followed (control)', `${other.seen.requests} requests`);
    ok(other.seen.withToken === 0, '5b. the other origin never received the token', `${other.seen.withToken} of ${other.seen.requests} requests carried it`);
    ok(scan(e, [CANARY]).length === 0, '5c. nothing leaked on this run either');
    cleanup(e);

    // 6. sensitivity: the same scan must catch a leaky runner
    let leaky = fs.readFileSync(path.join(__dirname, 'run.js'), 'utf8');
    const edits = [
      ['redact.write(', 'fs.writeFileSync('],
      ['redact.installStreams();', ''],
      ['redact.scanDir(outDir)', '[]'],
      ["bypass: bypassToken ? 'set (VERCEL_PROTECTION_BYPASS)' : null,", 'bypass: bypassToken,'],
    ];
    for (const [from, to] of edits) { if (!leaky.includes(from)) { ok(false, `6. could not build the leaky runner: "${from}" not found in run.js`); break; } leaky = leaky.split(from).join(to); }
    fs.writeFileSync(tmpRunner, leaky);
    const f = await runSuite(path.basename(tmpRunner), proxy.url, { VERCEL_PROTECTION_BYPASS: CANARY });
    const hitsF = scan(f, [CANARY]);
    ok(hitsF.length > 0, `6. sensitivity: a leaky runner IS caught by the scan (found in: ${hitsF.join(', ') || 'nowhere, so the scan cannot fail'})`);
    cleanup(f);
  } finally {
    fs.rmSync(tmpRunner, { force: true });
    await Promise.all([origin.close(), other.close(), proxy.close(), proxyWithRedirect.close()]);
  }
  const failed = results.filter((r) => !r.cond);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(String(e && e.stack || e).split('\n').slice(0, 8).join('\n')); process.exit(2); });
