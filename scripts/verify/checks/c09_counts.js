'use strict';
/*
 * 9. Test counts on the site match the repositories (37 / 47 / 6 / 26) and the Razorpay coverage matrix totals 37 (34 CI-safe + 3 live).
 * The numbers are counted again here from the spec files of the public repos, pinned to the commits the site cites.
 */
const fs = require('fs');
const path = require('path');
const { result } = require('../lib/report');
const { normalizeText, readText } = require('../lib/site');
const repos = require('../lib/repos');

const TEST_NOUN = /(\d{1,3})\+?\s*(?:unique\s+|automated\s+|CI-safe\s+|live\s+|Razorpay-live\s+)*(?:test definitions?|tests?\b|API tests?|UI tests?)/gi;

async function run(ctx) {
  const r = result(9, 'Test counts match the repos (37 / 47 / 6 / 26) and the coverage matrix totals 37 (34 + 3)');
  const { expected: ex, baseUrl, browser } = ctx;

  // ---------------------------------------------------------------- count again from the spec files
  let dirs;
  try { dirs = repos.ensureAll(ex.repos); } catch (e) {
    r.skip(`could not clone the repositories (${String(e.message).split('\n')[0]}); needs network on the first run`);
    return [r.finish()];
  }
  const counted = {};
  for (const [key, cfg] of Object.entries(ex.repos)) {
    const c = repos.countTests(dirs[key], { ...cfg, specPattern: new RegExp(cfg.specPattern) });
    const tests = c.tests;
    counted[key] = { files: c.files, total: tests.length, live: tests.filter((t) => t.live).length, tests };
  }
  const rz = counted.razorpay;
  const ae = counted['automation-exercise'];
  const er = counted.erpnext;
  const derived = {
    razorpay: { total: rz.total, ci: rz.total - rz.live, live: rz.live },
    'restful-booker': { total: counted['restful-booker'].total },
    erpnext: { total: er.total, ui: er.tests.filter((t) => /\.spec\./.test(t.file)).length, setup: er.tests.filter((t) => /\.setup\./.test(t.file)).length },
    'automation-exercise': { total: ae.total, api: ae.tests.filter((t) => /tests\/api\//.test(t.file)).length, ui: ae.tests.filter((t) => !/tests\/api\//.test(t.file)).length },
  };
  for (const [key, want] of Object.entries(ex.projects)) {
    const got = derived[key];
    const wantNums = Object.fromEntries(Object.entries(want).filter(([k, v]) => typeof v === 'number'));
    r.expect(JSON.stringify(Object.fromEntries(Object.keys(wantNums).map((k) => [k, got[k]]))) === JSON.stringify(wantNums),
      `${key}: spec files count to the expected numbers`, `${JSON.stringify(got)} @ ${ex.repos[key].sha}`);
  }
  r.expect(Object.values(derived).reduce((n, d) => n + d.total, 0) === ex.totalAcrossProjects, `sum across the four repos = ${ex.totalAcrossProjects}`, Object.values(derived).map((d) => d.total).join(' + '));
  const specCounts = {};
  for (const t of rz.tests) specCounts[t.file] = (specCounts[t.file] || 0) + 1;

  // ---------------------------------------------------------------- what the site says
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const D = derived;

  // every "N tests" style statement on every page must be a number the repos can explain
  const allowed = new Set([ex.totalAcrossProjects, ...Object.values(D).flatMap((d) => Object.values(d)), ...Object.values(specCounts), counted['restful-booker'].files]);
  const stray = [];
  let seen = 0;
  for (const p of ctx.pages) {
    const html = readText(p.file);
    const meta = [...html.matchAll(/<meta[^>]+content="([^"]*)"/g)].map((m) => m[1]).join(' ');
    const body = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ');
    const text = normalizeText(body + ' ' + meta);
    for (const m of text.matchAll(TEST_NOUN)) {
      seen++;
      if (!allowed.has(Number(m[1]))) stray.push(`${p.url}: "${m[0]}"`);
    }
  }
  r.expect(stray.length === 0, `every "N tests / test definitions" statement on the site is a number the repos explain (${seen} statements read)`, stray.length ? stray.slice(0, 5).join(' | ') : `allowed set: ${[...allowed].sort((a, b) => a - b).join(', ')}`);

  // targeted statements: the exact numbers per project and place
  const text = async (url) => { await page.goto(baseUrl + url, { waitUntil: 'load' }); return normalizeText(await page.evaluate(() => document.body.innerText)); };
  const statements = [
    { url: '/', re: /(\d+) test definitions · (\d+) run in CI/, want: [D.razorpay.total, D.razorpay.ci], label: 'home: Razorpay card' },
    { url: '/', re: /RESTful Booker TypeScript API Automation[\s\S]*?(\d+) test definitions/, want: [D['restful-booker'].total], label: 'home: RESTful Booker card' },
    { url: '/', re: /(\d+) test definitions · (\d+) UI, (\d+) auth setup/, want: [D.erpnext.total, D.erpnext.ui, D.erpnext.setup], label: 'home: ERPNext card' },
    { url: '/', re: /(\d+) test definitions · (\d+) API, (\d+) UI/, want: [D['automation-exercise'].total, D['automation-exercise'].api, D['automation-exercise'].ui], label: 'home: Automation Exercise card' },
    { url: '/', re: /(\d+)\s+Test Definitions in 4 Public Projects/i, want: [ex.totalAcrossProjects], label: 'home: stat bar total' },
    { url: '/proof-of-work/', re: /(\d+) unique automated test definitions/i, want: [ex.totalAcrossProjects], label: 'proof of work: intro total' },
    { url: ex.projects.razorpay.page, re: /(\d+) Automated Tests[\s\S]*?(\d+) CI-Safe Tests/, want: [D.razorpay.total, D.razorpay.ci], label: 'Razorpay case study: snapshot' },
    { url: ex.projects.razorpay.page, re: /(\d+) of the (\d+) tests deliberately isolated/, want: [D.razorpay.ci, D.razorpay.total], label: 'Razorpay case study: CI-safe sentence' },
    { url: ex.projects['restful-booker'].page, re: /(\d+) Automated Tests/, want: [D['restful-booker'].total], label: 'RESTful Booker case study: header' },
    { url: ex.projects['restful-booker'].page, re: /(\d+) tests organized across (\d+) suites/, want: [D['restful-booker'].total, counted['restful-booker'].files], label: 'RESTful Booker case study: suites' },
    { url: ex.projects.erpnext.page, re: /Test Suite\s*(\d+) Tests/i, want: [D.erpnext.total], label: 'ERPNext case study: header' },
    { url: ex.projects['automation-exercise'].page, re: /(\d+) test definitions \((\d+) API, (\d+) UI\)/, want: [D['automation-exercise'].total, D['automation-exercise'].api, D['automation-exercise'].ui], label: 'Automation Exercise case study' },
    { url: '/services/', re: /(\d+) test definitions; (\d+) run in CI, (\d+) need/, want: [D.razorpay.total, D.razorpay.ci, D.razorpay.live], label: 'services: Razorpay' },
    { url: '/services/', re: /(\d+) test definitions in (\d+) suites/, want: [D['restful-booker'].total, counted['restful-booker'].files], label: 'services: RESTful Booker' },
    { url: '/services/', re: /(\d+) test definitions: (\d+) API and (\d+) UI/, want: [D['automation-exercise'].total, D['automation-exercise'].api, D['automation-exercise'].ui], label: 'services: Automation Exercise' },
    { url: '/resume/', re: /(\d+)\s+Test Definitions in 4 Public Projects/i, want: [ex.totalAcrossProjects], label: 'resume: sidebar total' },
    { url: '/blog/payment-gateway-testing-playwright/', re: /Of (\d+) tests, (\d+) are CI-safe/, want: [D.razorpay.total, D.razorpay.ci], label: 'payment article' },
    { url: '/evidence/', re: /(\d+) test definitions, (\d+) CI-safe and (\d+) that need/, want: [D.razorpay.total, D.razorpay.ci, D.razorpay.live], label: 'evidence: matrix intro' },
    { url: '/evidence/', re: /all (\d+) tests passed\. With the fix reverted[\s\S]*?(\d+) of the (\d+) failed/, want: [specCounts['tests/security/webhook-validation.spec.js'], 6, specCounts['tests/security/webhook-validation.spec.js']], label: 'evidence: DEF-002 re-run (webhook spec size)' },
  ];
  const cache = {};
  for (const s of statements) {
    cache[s.url] ||= await text(s.url);
    const m = s.re.exec(cache[s.url]);
    const got = m ? m.slice(1).map(Number) : null;
    r.expect(got && JSON.stringify(got) === JSON.stringify(s.want), s.label, got ? `site says ${got.join('/')}, repos say ${s.want.join('/')}` : 'statement not found on the page');
  }

  // Proof of Work cards, each read on its own
  await page.goto(baseUrl + '/proof-of-work/', { waitUntil: 'load' });
  const cards = await page.$$eval('.project-card', (els) => els.map((e) => ({ title: e.querySelector('.project-title')?.textContent || '', text: e.innerText })));
  const powWant = [['Razorpay', D.razorpay.total], ['RESTful Booker', D['restful-booker'].total], ['ERPNext', D.erpnext.total], ['Automation Exercise', D['automation-exercise'].total]];
  for (const [name, want] of powWant) {
    const card = cards.find((c) => c.title.includes(name));
    const m = card && /(\d+) Tests/.exec(normalizeText(card.text));
    r.expect(m && Number(m[1]) === want, `proof of work: ${name} card`, m ? `site says ${m[1]}, repos say ${want}` : 'card or count not found');
  }

  // covers: the big number and the sub line
  const covers = [];
  for (const [key, p] of Object.entries(ex.projects)) {
    await page.goto(baseUrl + p.page, { waitUntil: 'load' });
    const t = await page.evaluate(() => ({ count: document.querySelector('svg.cv-wide .count')?.textContent, sub: document.querySelector('svg.cv-wide .sub')?.textContent }));
    const nums = (t.sub.match(/\d+/g) || []).map(Number);
    const want = key === 'razorpay' ? [D.razorpay.ci, D.razorpay.live] : key === 'restful-booker' ? [counted['restful-booker'].files] : key === 'erpnext' ? [D.erpnext.ui, D.erpnext.setup] : [D['automation-exercise'].api, D['automation-exercise'].ui];
    covers.push(Number(t.count) === D[key].total && JSON.stringify(nums) === JSON.stringify(want) ? null : `${key}: cover says ${t.count} (${t.sub}), repos say ${D[key].total} (${want})`);
  }
  r.expect(covers.every((c) => c === null), 'cover SVGs show the repo counts (big number and breakdown)', covers.filter(Boolean).join(' | ') || '37 / 47 / 6 / 26 with their breakdowns');

  // ---------------------------------------------------------------- coverage matrix on /evidence/
  await page.goto(baseUrl + '/evidence/', { waitUntil: 'load' });
  const matrix = await page.evaluate(() => {
    const tables = [...document.querySelectorAll('#coverage-matrix table')];
    const rows = (t) => [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent.replace(/\s+/g, ' ').replace(/ ?\(opens in a new tab\)/g, '').trim()));
    return { summary: rows(tables[0]), all: rows(tables[1]) };
  });
  const totalRow = matrix.summary.find((row) => row[0] === 'Total');
  r.expect(totalRow && Number(totalRow[1]) === D.razorpay.ci && Number(totalRow[2]) === D.razorpay.live && Number(totalRow[3]) === D.razorpay.total, 'matrix summary totals row = 34 CI-safe + 3 live = 37', totalRow ? totalRow.slice(0, 4).join(' / ') : 'no total row');
  const ids = matrix.all.map((row) => row[0]);
  const repoIds = rz.tests.map((t) => /^([A-Z0-9-]+):/.exec(t.title)?.[1]);
  r.expect(ids.length === D.razorpay.total && JSON.stringify([...ids].sort()) === JSON.stringify([...repoIds].sort()), `matrix lists all ${D.razorpay.total} test IDs, the same set as the spec files`, `${ids.length} rows; missing from page: ${repoIds.filter((i) => !ids.includes(i)).join(',') || 'none'}; extra on page: ${ids.filter((i) => !repoIds.includes(i)).join(',') || 'none'}`);
  const pageLive = matrix.all.filter((row) => /Live/i.test(row[3])).map((row) => row[0]).sort();
  const repoLive = rz.tests.filter((t) => t.live).map((t) => /^([A-Z0-9-]+):/.exec(t.title)[1]).sort();
  r.expect(JSON.stringify(pageLive) === JSON.stringify(repoLive), 'live-gateway tests in the matrix are exactly the @razorpay-live ones', `${pageLive.join(', ')} vs ${repoLive.join(', ')}`);
  const perFile = {};
  for (const row of matrix.summary.filter((x) => x[0] !== 'Total')) perFile[row[4]] = [Number(row[1]), Number(row[2])];
  const wantPerFile = {};
  for (const t of rz.tests) { const f = t.file.split('/').pop(); (wantPerFile[f] ||= [0, 0])[t.live ? 1 : 0]++; }
  r.expect(JSON.stringify(Object.entries(perFile).sort()) === JSON.stringify(Object.entries(wantPerFile).sort()), 'per-spec-file CI/live counts in the matrix equal the spec files', Object.entries(wantPerFile).map(([f, v]) => `${f.replace('.spec.js', '')} ${v.join('+')}`).join(', '));

  await context.close();
  return [r.finish()];
}

module.exports = { ids: [9], run };
