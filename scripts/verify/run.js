#!/usr/bin/env node
'use strict';
/*
 * Repeatable verification of the built site. Run from scripts/verify:
 *
 *   npm install            (once)
 *   node run.js            all checks
 *   node run.js --only 13,14
 *   node run.js --skip-network            skip checks that call GitHub / Formspree / the CDN
 *   node run.js --probe-formspree         also send ONE honeypot-flagged POST to the Formspree endpoint (not delivered)
 *   node run.js --release                 pre-deploy gate: also fail while any TODO marker ships in a page
 *   node run.js --out <dir>               write the report somewhere else (default scripts/verify/out)
 *   VERIFY_ROOT=<dir> node run.js         test another copy of the site (see mutate.js)
 *   node run.js --lighthouse              also run Lighthouse on every page (slow)
 *   node run.js --preview https://<name>.vercel.app    also run the real-host checks (20). If the preview has Deployment
 *                                                      Protection, put the bypass token in the environment variable
 *                                                      VERCEL_PROTECTION_BYPASS (sent as x-vercel-protection-bypass to the
 *                                                      preview only; never printed or written). A --bypass <token> argument
 *                                                      is refused: command lines end up in shell history and process lists.
 *
 * It serves the repository through lib/server.js (honours vercel.json redirects, trailingSlash, headers and
 * .vercelignore), drives Chromium with Playwright and writes out/report.md, out/results.json and out/details.
 * Exit code 1 if any check fails.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const server = require('./lib/server');
const { result, table, markdown } = require('./lib/report');
const { ROOT, deployedFiles, pagesOf } = require('./lib/site');
const { loadModels } = require('./lib/models');
const redact = require('./lib/redact');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };
if (argv.some((a) => a === '--bypass' || a.startsWith('--bypass='))) {
  console.error('--bypass is no longer accepted: a token on the command line is stored in shell history and visible in process lists.');
  console.error('Set the environment variable VERCEL_PROTECTION_BYPASS instead (for example: read -s VERCEL_PROTECTION_BYPASS; export VERCEL_PROTECTION_BYPASS).');
  process.exit(2);
}
const bypassToken = (process.env.VERCEL_PROTECTION_BYPASS || '').trim() || null;
if (bypassToken) {
  try { redact.register(bypassToken); } catch (e) { console.error('VERCEL_PROTECTION_BYPASS is set but too short to be a token, so it was not used. ' + e.message); process.exit(2); }
}
redact.installStreams(); // also masks the phone number (registered below) in everything printed or written
const args = {
  only: opt('only') ? opt('only').split(',').map(Number) : null,
  skipNetwork: flag('skip-network'),
  probeFormspree: flag('probe-formspree'),
  lighthouse: flag('lighthouse'),
  preview: opt('preview'),
  bypass: bypassToken ? 'set (VERCEL_PROTECTION_BYPASS)' : null, // a label only: the value lives in ctx.bypass and is never serialised
  out: opt('out'),
  release: flag('release'),
};

const MODULES = [
  './checks/c01_build', './checks/c02_redirects', './checks/c03_leftovers', './checks/c04_homepage', './checks/c05_copy',
  './checks/c09_counts', './checks/c10_excerpts', './checks/c11_privacy', './checks/c13_whatsapp', './checks/c14_forms',
  './checks/c15_pdfs', './checks/c16_links', './checks/c17_axe', './checks/c18_runtime', './checks/c19_images', './checks/c20_preview', './checks/c21_api_testing',
].filter((m) => fs.existsSync(path.join(__dirname, m + '.js')));

(async () => {
  const started = Date.now();
  const outDir = args.out ? path.resolve(args.out) : path.join(__dirname, 'out');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, 'details'), { recursive: true });

  const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'expected.json'), 'utf8'));
  const ph = expected.phone; // assembled here, see expected.json
  ph.digits = ph.parts.join('');
  ph.display = `+${ph.countryCode} ${ph.digits}`;
  // The number is the owner's private data: the checks still look for it, but it is masked in the console output and the reports.
  const d = ph.digits;
  for (const v of [d, `${d.slice(0, 5)} ${d.slice(5)}`, `${d.slice(0, 5)}-${d.slice(5)}`, `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`, `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`, `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`]) redact.registerMask(v);
  expected.whatsapp.urlPrefix = `https://wa.me/${ph.countryCode}${ph.digits}?text=`;
  const srv = await server.start({ root: ROOT });
  const browser = await chromium.launch();
  const files = deployedFiles();
  const ctx = { root: ROOT, expected, args, bypass: bypassToken, outDir, files, pages: pagesOf(files), baseUrl: srv.url, browser, _models: null };
  ctx.models = async () => (ctx._models ||= await loadModels(browser, srv.url, ctx.pages.map((p) => p.url)));

  const results = [];
  try {
    for (const m of MODULES) {
      const mod = require(m);
      if (args.only && !mod.ids.some((i) => args.only.includes(i))) continue;
      process.stdout.write(`running ${path.basename(m)} ... `);
      const t0 = Date.now();
      try {
        const rs = await mod.run(ctx);
        results.push(...rs.filter((r) => !args.only || args.only.includes(r.id)));
        console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`);
      } catch (e) {
        console.log('CRASHED');
        const r = result(mod.ids[0], `check module ${path.basename(m)} crashed`);
        r.fail('exception', String(e && e.stack || e).split('\n').slice(0, 18).join(' | '));
        results.push(r.finish());
      }
    }
  } finally {
    await browser.close();
    await srv.close();
  }

  results.sort((a, b) => a.id - b.id);
  const text = table(results);
  console.log('\n' + text + '\n');
  for (const r of results) redact.write(path.join(outDir, 'details', `check-${String(r.id).padStart(2, '0')}.txt`), r.details.join('\n') + '\n');
  const meta = { generated: new Date().toISOString(), node: process.version, base: srv.url, duration: `${((Date.now() - started) / 1000).toFixed(0)}s`, options: JSON.stringify(args) };
  redact.write(path.join(outDir, 'report.md'), markdown(results, meta));
  redact.write(path.join(outDir, 'results.json'), JSON.stringify({ meta, results }, null, 2));
  const leaked = bypassToken ? redact.scanDir(outDir) : [];
  if (leaked.length) { console.error(`The bypass token was found in ${leaked.length} output file(s); they were deleted: ${leaked.join(', ')}. This is a bug in the suite. The token was not printed.`); process.exit(2); }
  const counts = results.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  console.log(`PASS ${counts.PASS || 0}  FAIL ${counts.FAIL || 0}  SKIPPED ${counts.SKIPPED || 0}   (details: scripts/verify/out/)`);
  process.exit(counts.FAIL ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
