#!/usr/bin/env node
/*
 * Builds the payment gateway test case checklist from one source file, so the tables on the page and the CSV
 * download cannot drift apart.
 *
 *   source   scripts/checklist/cases.json                              (the only place the cases are edited)
 *   page     blog/payment-gateway-test-cases/index.html                (tables between <!-- checklist:KEY:start/end --> markers,
 *                                                                       counts between <!--cl:NAME-->...<!--/cl--> markers)
 *   csv      assets/downloads/payment-gateway-test-cases-checklist.csv (same IDs, same wording; backticks removed)
 *
 *   node scripts/checklist/build.js          rewrite the page regions and the CSV
 *   node scripts/checklist/build.js --check  report what differs (exit 1), write nothing
 *
 * It also validates the source: IDs are unique, text is ASCII, no CSV cell can be read as a spreadsheet formula, every
 * Razorpay test ID cited exists in the public repository at the commit the site cites, and "live" coverage is claimed only
 * for the tests tagged @razorpay-live. The repository is read from the local clone in the site folder (git-ignored); when it
 * is absent the test-ID check is skipped, and --require-repo turns that into a failure.
 *
 * Case IDs are positional (PG-<AREA>-<NN>): append new cases to the end of an area. Every PG-... ID written in the page
 * prose is checked against the generated list.
 *
 * No dependencies. Not deployed (see .vercelignore).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE = path.join(__dirname, 'cases.json');
const PAGE = path.join(ROOT, 'blog', 'payment-gateway-test-cases', 'index.html');
const CSV = path.join(ROOT, 'assets', 'downloads', 'payment-gateway-test-cases-checklist.csv');
const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];

const check = process.argv.includes('--check');
const requireRepo = process.argv.includes('--require-repo');

const data = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
const problems = [];

// ---------------------------------------------------------------- flatten and validate
const cases = [];
for (const area of data.areas) {
  area.cases.forEach((c, i) => {
    cases.push({ ...c, id: `PG-${area.key}-${String(i + 1).padStart(2, '0')}`, area });
  });
}
const ids = new Set();
for (const c of cases) {
  if (ids.has(c.id)) problems.push(`duplicate ID ${c.id}`);
  ids.add(c.id);
  if (!data.coverage[c.coverage]) problems.push(`${c.id}: unknown coverage "${c.coverage}"`);
  if (!SEVERITIES.includes(c.severity)) problems.push(`${c.id}: unknown severity "${c.severity}"`);
  for (const f of ['scenario', 'expected', 'why']) if (!c[f] || !c[f].trim()) problems.push(`${c.id}: empty ${f}`);
  if (['rec', 'sbx'].includes(c.coverage) && c.tests.length) problems.push(`${c.id}: coverage "${c.coverage}" must not cite Razorpay tests`);
  if (['ci', 'ci-weak', 'live'].includes(c.coverage) && !c.tests.length) problems.push(`${c.id}: coverage "${c.coverage}" must cite at least one Razorpay test`);
  for (const f of ['scenario', 'expected', 'why', 'note']) {
    const bad = /[^\x20-\x7E]/.exec(c[f] || '');
    if (bad) problems.push(`${c.id}: non-ASCII character U+${bad[0].codePointAt(0).toString(16)} in ${f}`);
    if (/^[=+\-@]/.test((c[f] || '').trim())) problems.push(`${c.id}: ${f} starts with a character a spreadsheet reads as a formula`);
  }
}

// ---------------------------------------------------------------- the cited tests must exist in the public repo at the cited commit
const cited = new Set(cases.flatMap((c) => c.tests));
function readRepoTests() {
  const dirName = fs.readdirSync(ROOT).find((n) => n.startsWith('Razorpay Payment Gateway'));
  if (!dirName) return null;
  const dir = path.join(ROOT, dirName);
  let out;
  try {
    out = execFileSync('git', ['grep', '-h', '-E', '^[[:space:]]*test\\(', data.repo.sha, '--', 'tests'], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 24 });
  } catch (e) { return null; }
  const tests = new Map();
  for (const line of out.split('\n')) {
    const m = /test\(\s*(['"`])([A-Z]+(?:-[A-Z]+)?-\d+):.*?\1/.exec(line);
    if (m) tests.set(m[2], /@razorpay-live/.test(line));
  }
  return tests;
}
const repoTests = readRepoTests();
let repoNote;
if (!repoTests) {
  repoNote = `Razorpay test IDs not verified: no local clone with commit ${data.repo.sha}`;
  if (requireRepo) problems.push(repoNote);
} else {
  if (repoTests.size !== data.repoTests) problems.push(`repoTests is ${data.repoTests} but ${repoTests.size} test definitions exist at ${data.repo.sha}`);
  for (const c of cases) {
    for (const t of c.tests) {
      if (!repoTests.has(t)) { problems.push(`${c.id}: test ${t} does not exist at ${data.repo.sha}`); continue; }
      const live = repoTests.get(t);
      if (c.coverage === 'ci' && live) problems.push(`${c.id}: ${t} is tagged @razorpay-live but the case claims it runs in CI`);
      if (c.coverage === 'live' && !live) problems.push(`${c.id}: ${t} is not tagged @razorpay-live but the case claims live-only`);
    }
  }
  repoNote = `${cited.size} cited Razorpay test IDs all exist at ${data.repo.sha}`;
}

// ---------------------------------------------------------------- counts
const byCoverage = (k) => cases.filter((c) => c.coverage === k).length;
const counts = {
  total: cases.length,
  ci: byCoverage('ci'),
  'ci-weak': byCoverage('ci-weak'),
  live: byCoverage('live'),
  rec: byCoverage('rec'),
  sbx: byCoverage('sbx'),
  'tests-used': cited.size,
  'tests-total': data.repoTests,
  areas: data.areas.length,
};
counts.automated = counts.ci + counts['ci-weak'] + counts.live;
counts.critical = cases.filter((c) => c.severity === 'Critical').length;

// ---------------------------------------------------------------- renderers
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const plain = (s) => String(s).replace(/`/g, '');

function renderTable(area) {
  const rows = cases.filter((c) => c.area === area).map((c) => {
    const cov = data.coverage[c.coverage];
    const tests = c.tests.length ? `\n                                        <p class="cov-tests">Tests: ${c.tests.map((t) => `<code>${t}</code>`).join(', ')}</p>` : '';
    const note = c.note ? `\n                                        <p class="cov-note">${inline(c.note)}</p>` : '';
    return `                            <tr id="${c.id.toLowerCase()}">
                                <th scope="row" data-label="ID">${c.id}</th>
                                <td data-label="Scenario">${inline(c.scenario)}</td>
                                <td data-label="Expected result">${inline(c.expected)}</td>
                                <td data-label="Why it matters">${inline(c.why)}</td>
                                <td data-label="Severity"><span class="sev">${c.severity}</span></td>
                                <td data-label="My coverage">
                                    <span class="status status-${cov.chip}">${esc(cov.label)}</span>${tests}${note}
                                </td>
                            </tr>`;
  });
  return `<div class="table-wrap checklist" role="region" aria-label="${esc(area.title)}: ${rows.length} cases" tabindex="0">
                    <table>
                        <caption class="sr-only">${esc(area.title)}: ${rows.length} cases with expected result, why it matters, severity and my coverage</caption>
                        <thead>
                            <tr>
                                <th scope="col">ID</th>
                                <th scope="col">Scenario</th>
                                <th scope="col">Expected result</th>
                                <th scope="col">Why it matters</th>
                                <th scope="col">Severity</th>
                                <th scope="col">My coverage</th>
                            </tr>
                        </thead>
                        <tbody>
${rows.join('\n')}
                        </tbody>
                    </table>
                </div>`;
}

function renderSummary() {
  const head = ['Area', 'Cases', 'Automated', 'Recommended, not automated', 'Beyond sandbox'];
  const row = (title, list) => {
    const n = (...k) => list.filter((c) => k.includes(c.coverage)).length;
    return `                            <tr>
                                <th scope="row">${esc(title)}</th>
                                <td class="num">${list.length}</td>
                                <td class="num">${n('ci', 'ci-weak', 'live')}</td>
                                <td class="num">${n('rec')}</td>
                                <td class="num">${n('sbx')}</td>
                            </tr>`;
  };
  const rows = data.areas.map((a) => row(a.title, cases.filter((c) => c.area === a)));
  rows.push(row('All areas', cases).replace('<tr>', '<tr class="total-row">'));
  return `<div class="table-wrap summary" role="region" aria-label="Cases per area and coverage" tabindex="0">
                    <table>
                        <caption class="sr-only">Number of cases in each area, split by coverage</caption>
                        <thead>
                            <tr>
${head.map((h, i) => `                                <th scope="col"${i ? ' class="num"' : ''}>${h}</th>`).join('\n')}
                            </tr>
                        </thead>
                        <tbody>
${rows.join('\n')}
                        </tbody>
                    </table>
                </div>`;
}

function renderCsv() {
  const q = (s) => `"${plain(s).replace(/"/g, '""')}"`;
  const header = ['ID', 'Area', 'Scenario', 'Expected result', 'Why it matters', 'Severity', 'My coverage', 'Razorpay test IDs', 'Notes'];
  const lines = [header.map(q).join(',')];
  for (const c of cases) {
    lines.push([c.id, c.area.title, c.scenario, c.expected, c.why, c.severity, data.coverage[c.coverage].csv, c.tests.join('; '), c.note].map(q).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------- page
function renderPage(html) {
  let out = html;
  for (const area of data.areas) {
    const rx = new RegExp(`(<!-- checklist:${area.key}:start -->\\n[ \\t]*)[\\s\\S]*?(\\n[ \\t]*<!-- checklist:${area.key}:end -->)`);
    if (!rx.test(out)) { problems.push(`page: markers for area ${area.key} not found`); continue; }
    out = out.replace(rx, (_, a, b) => a + renderTable(area) + b);
  }
  const sum = /(<!-- checklist:summary:start -->\n[ \t]*)[\s\S]*?(\n[ \t]*<!-- checklist:summary:end -->)/;
  if (!sum.test(out)) problems.push('page: markers for the summary table not found');
  else out = out.replace(sum, (_, a, b) => a + renderSummary() + b);
  out = out.replace(/<!--cl:([a-z-]+)-->[\s\S]*?<!--\/cl-->/g, (m, name) => {
    if (!(name in counts)) { problems.push(`page: unknown count marker "${name}"`); return m; }
    return `<!--cl:${name}-->${counts[name]}<!--/cl-->`;
  });
  // every PG-AREA-NN written in the prose (outside the generated tables) must exist
  const prose = out.replace(/<!-- checklist:[a-z]+:start -->[\s\S]*?<!-- checklist:[a-z]+:end -->/g, '');
  for (const m of prose.matchAll(/\bPG-[A-Z]{3}-\d{2}\b/g)) if (!ids.has(m[0])) problems.push(`page prose mentions ${m[0]}, which is not in cases.json`);
  return out;
}

// ---------------------------------------------------------------- run
const results = [];
function plan(file, next, eol) {
  const exists = fs.existsSync(file);
  const current = exists ? fs.readFileSync(file, 'utf8') : null;
  const body = eol === '\r\n' ? next.replace(/\r?\n/g, '\r\n') : next;
  results.push({ file, same: current === body, body });
}

if (!fs.existsSync(PAGE)) problems.push(`page not found: ${path.relative(ROOT, PAGE)}`);
else {
  const raw = fs.readFileSync(PAGE, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  plan(PAGE, renderPage(raw.replace(/\r\n/g, '\n')), eol);
}
plan(CSV, renderCsv(), '\r\n');

if (problems.length) {
  console.error('checklist: problems found, nothing written:\n  - ' + problems.join('\n  - '));
  process.exit(2);
}
const stale = results.filter((r) => !r.same);
if (check) {
  if (stale.length) {
    console.error('checklist: out of sync with scripts/checklist/cases.json: ' + stale.map((r) => path.relative(ROOT, r.file)).join(', '));
    process.exit(1);
  }
  console.log(`checklist: page tables and CSV in sync with cases.json (${counts.total} cases in ${counts.areas} areas; ${repoNote})`);
} else {
  for (const r of stale) {
    fs.mkdirSync(path.dirname(r.file), { recursive: true });
    fs.writeFileSync(r.file, r.body);
    console.log('wrote ' + path.relative(ROOT, r.file));
  }
  console.log(`checklist: ${counts.total} cases in ${counts.areas} areas (${counts.automated} automated, ${counts.rec} recommended, ${counts.sbx} beyond sandbox); ${repoNote}`);
}
