#!/usr/bin/env node
'use strict';
/*
 * Mutation self-test: proves the checks can fail.
 *
 * A copy of the repository is made in the temp folder. First the copy is run unchanged (every selected check must PASS: the
 * control). Then, one at a time, a realistic regression is injected into the copy, the checks that should notice it are run
 * against the copy, and each of them must FAIL. The injected file is put back before the next mutation. The real working tree
 * is never touched (its git state is compared before and after).
 *
 *   node mutate.js              all mutations (about five minutes)
 *   node mutate.js --keep       leave the temp copy in place for inspection
 *
 * Output: a table, and out-mutation/report.md. Exit code 1 if a check did not fail when it had to.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out-mutation');
const keep = process.argv.includes('--keep');
const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'expected.json'), 'utf8'));

// the number is assembled here so that this file never holds it as one string
const digits = expected.phone.parts.join('');
const PHONE = `+${expected.phone.countryCode} ${digits.slice(0, 5)} ${digits.slice(5)}`;

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 26 });
const repoState = () => git(['status', '--porcelain'], REPO) + git(['rev-parse', 'HEAD'], REPO) + git(['diff', 'HEAD', '--stat'], REPO);

const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-mutation-'));
const skipDirs = new Set(['.git', 'node_modules', 'out', 'out-mutation', '.cache']);
fs.cpSync(REPO, TEMP, { recursive: true, filter: (src) => !skipDirs.has(path.basename(src)) });
git(['init', '-q'], TEMP);
git(['-c', 'core.autocrlf=false', 'add', '-A'], TEMP);

const original = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const edit = (rel, fn) => {
  const before = fs.readFileSync(path.join(TEMP, rel), 'utf8');
  const after = fn(before);
  if (after === before) throw new Error(`mutation did not change ${rel}`);
  fs.writeFileSync(path.join(TEMP, rel), after);
};
const coverBlock = (text, slug) => new RegExp(`<!-- cover:${slug} -->[\\s\\S]*?<!-- /cover:${slug} -->`).exec(text)[0];

const MUTATIONS = [
  {
    name: 'phone number written into a page',
    detail: 'a visible number added to /about/',
    files: ['about/index.html'],
    expect: [11],
    apply: () => edit('about/index.html', (t) => t.replace('</main>', `<p>Call ${PHONE}</p></main>`)),
  },
  {
    name: 'duplicate cover',
    detail: 'the Automation Exercise card on the homepage gets the Razorpay cover',
    files: ['index.html'],
    expect: [8],
    apply: () => edit('index.html', (t) => t.replace(coverBlock(t, 'automation-exercise'), () => coverBlock(t, 'razorpay'))),
  },
  {
    name: 'wrong redirect target',
    detail: '/capabilities/ sent to /about/ instead of /',
    files: ['vercel.json'],
    expect: [2],
    apply: () => edit('vercel.json', (t) => t.replace(/("source": "\/capabilities\/",\s*"destination": ")\/"/, '$1/about/"')),
  },
  {
    name: 'redirect declared permanent:true',
    detail: 'the 301 rule for /about.html written the way that gives a 308 on Vercel',
    files: ['vercel.json'],
    expect: [2],
    apply: () => edit('vercel.json', (t) => t.replace(/("source": "\/about\.html",\s*"destination": "\/about\/",\s*)"statusCode": 301/, '$1"permanent": true')),
  },
  {
    name: 'private-folder guard removed',
    detail: 'the /scripts/:path* redirect deleted from vercel.json',
    files: ['vercel.json'],
    expect: [2],
    apply: () => edit('vercel.json', (t) => t.replace(/\s*\{\s*"source": "\/scripts\/:path\*",[^}]*\},?/, '')),
  },
  {
    name: 'missing aria-label on the WhatsApp button',
    detail: 'aria-label="Chat on WhatsApp" removed from the button on /about/',
    files: ['about/index.html'],
    expect: [13, 17],
    apply: () => edit('about/index.html', (t) => t.replace(/(<a\b[^>]*data-whatsapp[^>]*?)\s+aria-label="Chat on WhatsApp"/, '$1')),
  },
  {
    name: 'new TODO comment',
    detail: 'a <!-- TODO --> the owner does not know about, added to /about/',
    files: ['about/index.html'],
    expect: [3],
    apply: () => edit('about/index.html', (t) => t.replace('</main>', '<!-- TODO: something nobody planned --></main>')),
  },
  {
    name: 'README guard removed',
    detail: 'the /README.md redirect deleted from vercel.json, so the root README would be served',
    files: ['vercel.json'],
    expect: [2],
    apply: () => edit('vercel.json', (t) => t.replace(/\s*\{\s*"source": "\/README\.md",[^}]*\},?/, '')),
  },
  {
    name: 'resume source edited, PDF not rebuilt',
    detail: 'one sentence of resume-ats.html changed, the published ATS PDF left as it was',
    files: ['scripts/resume-source/resume-ats.html'],
    expect: [15],
    apply: () => edit('scripts/resume-source/resume-ats.html', (t) => t.replace('fixed with regression tests.', 'fixed with regression tests and a retest.')),
  },
  {
    name: 'wrong number in the /api-testing/ tally',
    detail: 'the authentication row of the tally table says 5 RESTful Booker tests instead of 4',
    files: ['api-testing/index.html'],
    expect: [21],
    apply: () => edit('api-testing/index.html', (t) => t.replace('<th scope="row">authentication</th><td class="num">4</td>', '<th scope="row">authentication</th><td class="num">5</td>')),
  },
  {
    name: 'badge contradicts the tagging on /api-testing/',
    detail: '"Assertion cannot fail" on the three RESTful Booker negative tests changed to "Runs in CI"',
    files: ['api-testing/index.html'],
    expect: [21],
    apply: () => edit('api-testing/index.html', (t) => t.replace('<span class="scenario-tag tag-fail">Assertion cannot fail</span> <span class="repo">RESTful Booker</span>', '<span class="scenario-tag tag-ci">Runs in CI</span> <span class="repo">RESTful Booker</span>')),
  },
  {
    name: 'permalink moved off the pinned commit on /api-testing/',
    detail: 'the link to auth.spec.ts lines 14-20 cites commit 1e7f137 instead of a385240',
    files: ['api-testing/index.html'],
    expect: [21],
    apply: () => edit('api-testing/index.html', (t) => t.replace('blob/a385240/tests/api/auth.spec.ts#L14-L20"', 'blob/1e7f137/tests/api/auth.spec.ts#L14-L20"')),
  },
  {
    name: 'a 401 appears in the RESTful Booker status-code list',
    detail: 'the /ping line of the case study says 401 instead of 201, a code no test asserts',
    files: ['projects/restful-booker-api-automation/index.html'],
    expect: [21],
    apply: () => edit('projects/restful-booker-api-automation/index.html', (t) => t.replace('<li><code>GET /ping</code>: 201 (1 test)</li>', '<li><code>GET /ping</code>: 401 (1 test)</li>')),
  },
  {
    name: 'architecture tree names a file that does not exist',
    detail: 'booking.types.ts in the case study tree changed to booking.ts',
    files: ['projects/restful-booker-api-automation/index.html'],
    expect: [21],
    apply: () => edit('projects/restful-booker-api-automation/index.html', (t) => t.replace('└── booking.types.ts', '└── booking.ts')),
  },
  {
    name: 'the "fixtures" claim comes back',
    detail: 'the Centralized Test Data bullet says "Consistent fixtures shared across all suites" again',
    files: ['projects/restful-booker-api-automation/index.html'],
    expect: [21],
    apply: () => edit('projects/restful-booker-api-automation/index.html', (t) => t.replace('There are no Playwright fixtures: each test creates its own bookings.', 'Consistent fixtures shared across all suites.')),
  },
];

function runChecks(ids, label) {
  const dir = path.join(OUT, label.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
  const res = spawnSync(process.execPath, [path.join(__dirname, 'run.js'), '--only', ids.join(','), '--skip-network', '--out', dir], {
    env: { ...process.env, VERIFY_ROOT: TEMP, WA_PHASES: 'none' }, encoding: 'utf8', maxBuffer: 1 << 26,
  });
  let results;
  try { results = JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8')).results; } catch { throw new Error(`run for "${label}" produced no results: ${res.stdout.slice(-400)} ${res.stderr.slice(-400)}`); }
  return Object.fromEntries(results.map((x) => [x.id, { status: x.status, failing: x.details.filter((l) => l.startsWith('FAIL')).map((l) => l.replace(/^FAIL\s+/, '')) }]));
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const before = repoState();
  const rows = [];
  const allIds = [...new Set(MUTATIONS.flatMap((m) => m.expect))].sort((a, b) => a - b);

  console.log(`temp copy: ${TEMP}`);
  console.log(`control: unchanged copy, checks ${allIds.join(', ')} must all PASS ...`);
  const base = runChecks(allIds, 'control');
  const baseOk = allIds.every((id) => base[id] && base[id].status === 'PASS');
  rows.push({ mutation: 'control (nothing changed)', detail: 'the copy as it is', expect: allIds.map((id) => `${id} PASS`).join(', '), actual: allIds.map((id) => `${id} ${base[id] ? base[id].status : 'missing'}`).join(', '), ok: baseOk, evidence: baseOk ? 'all pass, so a FAIL below is caused by the mutation' : allIds.filter((id) => !base[id] || base[id].status !== 'PASS').map((id) => `${id}: ${(base[id] && base[id].failing[0]) || 'missing'}`).join(' | ') });
  console.log(`  -> ${rows[0].actual}`);

  if (baseOk) {
    for (const m of MUTATIONS) {
      console.log(`mutation: ${m.name} (${m.detail}), checks ${m.expect.join(', ')} must FAIL ...`);
      m.apply();
      let got;
      try { got = runChecks(m.expect, m.name); }
      finally { for (const f of m.files) fs.writeFileSync(path.join(TEMP, f), original(f)); } // put the file back
      const ok = m.expect.every((id) => got[id] && got[id].status === 'FAIL');
      rows.push({ mutation: m.name, detail: m.detail, expect: m.expect.map((id) => `${id} FAIL`).join(', '), actual: m.expect.map((id) => `${id} ${got[id] ? got[id].status : 'missing'}`).join(', '), ok, evidence: m.expect.map((id) => `${id}: ${(got[id] && got[id].failing[0] ? got[id].failing[0] : 'no failing sub-check').slice(0, 170)}`).join(' || ') });
      console.log(`  -> ${rows[rows.length - 1].actual}`);
    }
    // the files are back: the copy must be green again
    const after = runChecks(allIds, 'restored');
    const restoredOk = allIds.every((id) => after[id] && after[id].status === 'PASS');
    rows.push({ mutation: 'restored copy', detail: 'every injected file put back', expect: allIds.map((id) => `${id} PASS`).join(', '), actual: allIds.map((id) => `${id} ${after[id] ? after[id].status : 'missing'}`).join(', '), ok: restoredOk, evidence: restoredOk ? 'green again' : 'still failing after the restore' });
    console.log(`restored: ${rows[rows.length - 1].actual}`);
  }

  const untouched = repoState() === before;
  rows.push({ mutation: 'real working tree', detail: 'git status, HEAD and diff before vs after', expect: 'unchanged', actual: untouched ? 'unchanged' : 'CHANGED', ok: untouched, evidence: untouched ? 'mutations only ever touched the temp copy' : 'the repository changed during the run' });

  const md = ['# Mutation self-test', '', '| Mutation | Injected | Expected | Actual | Result | Evidence |', '|---|---|---|---|---|---|', ...rows.map((r) => `| ${r.mutation} | ${r.detail} | ${r.expect} | ${r.actual} | ${r.ok ? 'OK' : 'NOT OK'} | ${r.evidence.replace(/\|/g, '/')} |`), ''].join('\n');
  fs.writeFileSync(path.join(OUT, 'report.md'), md);
  console.log('\n' + rows.map((r) => `${r.ok ? 'OK    ' : 'NOT OK'}  ${r.mutation.padEnd(46)} expected ${r.expect.padEnd(14)} got ${r.actual}\n        ${r.evidence.slice(0, 230)}`).join('\n'));
  if (!keep) fs.rmSync(TEMP, { recursive: true, force: true });
  process.exit(rows.every((r) => r.ok) ? 0 : 1);
})().catch((e) => { console.error(e); if (!keep) fs.rmSync(TEMP, { recursive: true, force: true }); process.exit(2); });
