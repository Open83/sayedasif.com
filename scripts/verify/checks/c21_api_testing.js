'use strict';
/*
 * 21. /api-testing/ and the RESTful Booker case study: every number, permalink, badge, file name and status code is recomputed from the public
 *     repositories at the pinned commits.
 *
 *   - the API tests are counted again from the spec files and compared with the page, expected.json and api-tagging.json
 *   - every tagged test exists at the tagged line and the tagged range ends before the next test starts
 *   - the tally table equals the tally recomputed from api-tagging.json
 *   - every GitHub file link on the page cites the pinned commit and a range that exists in that file
 *   - every test link on the page is exactly one tagged test, and a badge never contradicts the tagging
 *     ("Runs in CI" on a live-only or cannot-fail test, or "Assertion cannot fail" on any other test, fails the check)
 *   - the statements about negative tests, the three assertions that cannot fail and the delete tests match the code
 *   - the RESTful Booker case study: its Framework Architecture tree equals the files at the pinned commit, its Status Code Validation list
 *     equals the per-operation counts recomputed from the specs (no code that no test asserts), the test-data wording matches booking-data.ts,
 *     and phrases removed for overclaiming have not come back
 *   - title and description limits, banned words, heading order, excerpt length, one inbound link from each named page,
 *     no navigation entry, and code blocks that scroll inside their own box at 375px
 *
 * Excerpt text itself is checked in check 10; the GitHub links returning 200 is checked there too.
 */
const fs = require('fs');
const path = require('path');
const { result } = require('../lib/report');
const { normalizeText, decodeEntities, readText } = require('../lib/site');
const repos = require('../lib/repos');

const WORDS = { 2: 'two', 6: 'six', 8: 'eight' };

async function run(ctx) {
  const r = result(21, '/api-testing/ and the RESTful Booker case study: counts, layout, status codes, badges recomputed from the pinned repos');
  const { expected: ex, baseUrl, browser } = ctx;
  const cfg = ex.apiTesting;
  const page = ctx.pages.find((p) => p.url === cfg.page);
  if (!page) { r.fail('the page exists in the deployed tree', cfg.page + ' not found'); return [r.finish()]; }

  let dirs;
  try { dirs = repos.ensureAll(ex.repos); } catch (e) { r.skip(`could not clone the repositories (${String(e.message).split('\n')[0]}); needs network on the first run`); return [r.finish()]; }

  const html = readText(page.file);
  const tagging = JSON.parse(fs.readFileSync(path.join(__dirname, '..', cfg.tagging), 'utf8')).rows;

  // ------------------------------------------------------------------ count the API tests again, from the repos
  const all = {};   // every test in the repo (UI included), to find where each test ends
  const api = {};   // the API tests
  for (const [key, rc] of Object.entries(ex.repos)) {
    if (!cfg.counts[key]) continue;
    const c = repos.countTests(dirs[key], { ...rc, specPattern: new RegExp(rc.specPattern) });
    all[key] = c.tests;
    api[key] = c.tests.filter((t) => (key === 'razorpay' ? !/^tests\/ui\//.test(t.file) : key === 'automation-exercise' ? /^tests\/api\//.test(t.file) : true));
  }
  const counted = Object.fromEntries(Object.entries(api).map(([k, v]) => [k, v.length]));
  r.expect(Object.keys(cfg.counts).every((k) => counted[k] === cfg.counts[k]) && Object.keys(counted).length === Object.keys(cfg.counts).length && Object.values(counted).reduce((a, b) => a + b, 0) === cfg.total,
    'API test counts from the spec files equal expected.json', `${JSON.stringify(counted)} = ${cfg.total}`);

  // ------------------------------------------------------------------ tagging file against the repos
  const problems = [];
  for (const key of Object.keys(api)) {
    const rows = tagging.filter((t) => t.repo === key);
    const have = new Map(api[key].map((t) => [`${t.file}:${t.line}`, t]));
    const tagged = new Set();
    for (const row of rows) {
      const id = `tests/${row.file}:${row.line}`;
      const t = have.get(id);
      if (!t) { problems.push(`${key} ${id}: tagged, but no API test starts there`); continue; }
      if (tagged.has(id)) problems.push(`${key} ${id}: tagged twice`);
      tagged.add(id);
      if (t.title !== row.title) problems.push(`${key} ${id}: title differs ("${t.title.slice(0, 40)}" vs "${row.title.slice(0, 40)}")`);
      const lines = repos.readRepoFile(dirs[key], 'tests/' + row.file).split('\n');
      const next = all[key].filter((x) => x.file === t.file && x.line > t.line).map((x) => x.line).sort((a, b) => a - b)[0];
      if (!(row.end >= row.line && row.end <= lines.length && /^[})]/.test(lines[row.end - 1].trim()) && (next === undefined || row.end < next))) problems.push(`${key} ${id}: end line ${row.end} does not close the test`);
    }
    for (const id of have.keys()) if (!tagged.has(id)) problems.push(`${key} ${id}: an API test with no tag`);
  }
  r.expect(problems.length === 0, `api-tagging.json has exactly one row per API test (${tagging.length}), each at its real line, with its real title and a closing line`, problems.slice(0, 3).join(' | ') || `${tagging.length} rows`);

  // ------------------------------------------------------------------ tally table and the sentence with the counts
  const tbody = /<table id="tally">[\s\S]*?<tbody>([\s\S]*?)<\/tbody>[\s\S]*?<tfoot>([\s\S]*?)<\/tfoot>/.exec(html);
  const cols = ['restful-booker', 'razorpay', 'automation-exercise'];
  const pageRows = {};
  if (tbody) {
    for (const m of tbody[1].matchAll(/<th scope="row">([^<]*)<\/th>((?:<td class="num">\d+<\/td>)+)<\/tr>/g)) pageRows[decodeEntities(m[1]).replace(/​/g, '')] = [...m[2].matchAll(/>(\d+)</g)].map((x) => Number(x[1]));
  }
  const cats = [...new Set(tagging.map((t) => t.category))];
  const tallyBad = [];
  for (const cat of cats) {
    const want = cols.map((k) => tagging.filter((t) => t.repo === k && t.category === cat).length);
    want.push(want.reduce((a, b) => a + b, 0));
    if (JSON.stringify(pageRows[cat]) !== JSON.stringify(want)) tallyBad.push(`${cat}: page ${JSON.stringify(pageRows[cat])}, recomputed ${JSON.stringify(want)}`);
  }
  for (const cat of Object.keys(pageRows)) if (!cats.includes(cat)) tallyBad.push(`${cat}: row on the page but no such category`);
  const foot = tbody ? [...tbody[2].matchAll(/<td class="num">(\d+)<\/td>/g)].map((m) => Number(m[1])) : [];
  const wantFoot = [...cols.map((k) => counted[k]), cfg.total];
  if (JSON.stringify(foot) !== JSON.stringify(wantFoot)) tallyBad.push(`footer ${JSON.stringify(foot)} vs ${JSON.stringify(wantFoot)}`);
  r.expect(tbody && tallyBad.length === 0, 'the tally table equals the tally recomputed from api-tagging.json, and its totals equal the repo counts', tallyBad.slice(0, 3).join(' | ') || `${cats.length} risks, totals ${wantFoot.join('/')}`);

  const text = normalizeText(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' '));
  const rzAll = all.razorpay.length, aeAll = all['automation-exercise'].length;
  const sentence = /all (\d+) tests in RESTful Booker, (\d+) of the (\d+) in Razorpay .*? and (\d+) of the (\d+) in Automation Exercise/.exec(text);
  const wantSentence = [counted['restful-booker'], counted.razorpay, rzAll, counted['automation-exercise'], aeAll];
  r.expect(sentence && JSON.stringify(sentence.slice(1).map(Number)) === JSON.stringify(wantSentence), 'the sentence with the per-repo counts matches the repos (all / API of total)', sentence ? `${sentence.slice(1).join('/')} vs ${wantSentence.join('/')}` : 'sentence not found');

  // ------------------------------------------------------------------ every GitHub file link: pinned commit, real file, real range
  const repoKey = (name) => Object.keys(ex.repos).find((k) => ex.repos[k].github.endsWith('/' + name));
  const links = [];
  for (const m of html.matchAll(/href="https:\/\/github\.com\/Open83\/([^/"]+)\/blob\/([0-9a-f]+)\/([^"#]+)(?:#L(\d+)(?:-L(\d+))?)?"/g)) links.push({ name: m[1], sha: m[2], file: m[3], a: m[4] ? Number(m[4]) : null, b: m[5] ? Number(m[5]) : null, index: m.index });
  const linkBad = [];
  for (const l of links) {
    const key = repoKey(l.name);
    if (!key) { linkBad.push(`${l.name}: not one of the project repositories`); continue; }
    if (l.sha !== ex.repos[key].sha) { linkBad.push(`${l.name}/${l.file}: cites ${l.sha}, expected ${ex.repos[key].sha}`); continue; }
    let lines;
    try { lines = repos.readRepoFile(dirs[key], l.file).split('\n'); } catch { linkBad.push(`${l.name}/${l.file}: no such file at ${l.sha}`); continue; }
    if (l.a !== null && !(l.a >= 1 && (l.b ?? l.a) >= l.a && (l.b ?? l.a) <= lines.length)) linkBad.push(`${l.name}/${l.file}: range ${l.a}-${l.b} is outside the file (${lines.length} lines)`);
  }
  r.expect(links.length > 0 && linkBad.length === 0, `all ${links.length} GitHub file links cite the pinned commit of their repository, an existing file and an existing line range`, linkBad.slice(0, 3).join(' | ') || `${links.length} links`);

  // ------------------------------------------------------------------ test links and badges against the tagging
  const mapStart = html.indexOf('id="evidence-map"');
  const mapEnd = html.indexOf('</section>', mapStart);
  const mapHtml = html.slice(mapStart, mapEnd);
  const lis = [...mapHtml.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  const badgeBad = [];
  const linkedBy = { fail: new Set(), live: new Set() };
  let testLinks = 0, liWithBadge = 0;
  for (const li of lis) {
    const first = /class="scenario-tag (tag-\w+)">([^<]*)</.exec(li);
    if (!first) continue;
    liWithBadge++;
    const rowsHere = [];
    // a test link is one whose text is "file:first-last" (the generated form); other links into tests/ are ordinary file links
    for (const m of li.matchAll(/<a href="https:\/\/github\.com\/Open83\/([^/"]+)\/blob\/[0-9a-f]+\/tests\/([^"#]+)#L(\d+)-L(\d+)"[^>]*>([^<]*)</g)) {
      if (!new RegExp(`:${m[3]}(?:&ndash;|–)${m[4]}\\)?$`).test(m[5].trim())) continue;
      testLinks++;
      const key = repoKey(m[1]);
      const row = tagging.find((t) => t.repo === key && t.file === m[2] && t.line === Number(m[3]));
      if (!row || row.end !== Number(m[4])) { badgeBad.push(`${m[2]}#L${m[3]}-L${m[4]} is not exactly one tagged test`); continue; }
      rowsHere.push(row);
    }
    const label = first[2].trim();
    for (const row of rowsHere) {
      const where = `${row.file}:${row.line} (${first[1]})`;
      if (first[1] === 'tag-ci' && (row.run === 'live' || row.flags.includes('cannot-fail') || row.flags.includes('weak'))) badgeBad.push(`${where} is badged "${label}" but the tagging says ${row.run}${row.flags.length ? ' / ' + row.flags.join(',') : ''}`);
      if (first[1] === 'tag-fail') { if (!row.flags.includes('cannot-fail')) badgeBad.push(`${where} is badged "${label}" but is not tagged cannot-fail`); linkedBy.fail.add(`${row.repo}/${row.file}:${row.line}`); }
      if (first[1] === 'tag-live') { if (row.run !== 'live') badgeBad.push(`${where} is badged "${label}" but is not live-only`); linkedBy.live.add(`${row.repo}/${row.file}:${row.line}`); }
    }
  }
  for (const row of tagging) {
    const id = `${row.repo}/${row.file}:${row.line}`;
    if (row.flags.includes('cannot-fail') && !linkedBy.fail.has(id)) badgeBad.push(`${id} is tagged cannot-fail but no "Assertion cannot fail" item links it`);
    if (row.run === 'live' && !linkedBy.live.has(id)) badgeBad.push(`${id} is live-only but no "Live gateway only" item links it`);
  }
  r.expect(badgeBad.length === 0, `${testLinks} test links in ${liWithBadge} badged items each point at one whole tagged test, and no badge contradicts the tagging`, badgeBad.slice(0, 3).join(' | ') || `${testLinks} links`);

  // ------------------------------------------------------------------ statements that the code must support
  const negRows = all['restful-booker'].filter((t) => t.file === 'tests/api/negative-testing.spec.ts');
  const negLines = repos.readRepoFile(dirs['restful-booker'], 'tests/api/negative-testing.spec.ts').split('\n');
  const bodyOf = (key, t) => { const row = tagging.find((x) => x.repo === key && 'tests/' + x.file === t.file && x.line === t.line); return row ? repos.readRepoFile(dirs[key], t.file).split('\n').slice(row.line - 1, row.end).join('\n') : ''; };
  const rejecting = negRows.filter((t) => /status\(\)\)\.toBe\([45]\d\d\)/.test(bodyOf('restful-booker', t))).length;
  r.expect(negRows.length === cfg.negativeTests.total && rejecting === cfg.negativeTests.assertRejection, `negative-testing.spec.ts has ${cfg.negativeTests.total} tests, ${cfg.negativeTests.assertRejection} of which assert a 4xx/5xx status`, `${negRows.length} tests, ${rejecting} assert a rejection`);
  r.expect(text.includes(`Only these ${WORDS[rejecting]} of the ${WORDS[negRows.length]} tests`), 'the page says exactly that', `"Only these ${WORDS[rejecting]} of the ${WORDS[negRows.length]} tests" ${text.includes(`Only these ${WORDS[rejecting]} of the ${WORDS[negRows.length]} tests`) ? 'found' : 'NOT found'}`);

  const cf = cfg.cannotFail[0];
  const cfLines = repos.readRepoFile(dirs[cf.repo], cf.file).split('\n');
  const cfBad = cf.lines.filter((n) => cfLines[n - 1].trim() !== cf.text);
  r.expect(cfBad.length === 0, `lines ${cf.lines.join(', ')} of ${path.basename(cf.file)} are all "${cf.text}"`, cfBad.length ? 'differs at ' + cfBad.join(', ') : 'identical');
  const cfSentence = `(lines ${cf.lines.slice(0, -1).join(', ')} and ${cf.lines[cf.lines.length - 1]})`;
  r.expect(text.includes(cfSentence), 'the page names those same line numbers', cfSentence);

  const deleting = tagging.filter((t) => t.repo === 'restful-booker').filter((t) => /\bdeleteBooking\(/.test(bodyOf('restful-booker', { file: 'tests/' + t.file, line: t.line }))).length;
  const sixPhrase = `${WORDS[deleting]} of the ${counted['restful-booker']}`;
  const sixCount = (text.match(new RegExp(sixPhrase, 'g')) || []).length;
  r.expect(deleting === cfg.bookingDeleteTests && sixCount >= 2, `${deleting} RESTful Booker tests call deleteBooking, and the page says "${sixPhrase}" where it should`, `${deleting} tests; phrase found ${sixCount} times`);

  // ------------------------------------------------------------------ the RESTful Booker case study: layout, status codes, test data
  const rb = ex.restfulBookerCaseStudy;
  const rbPage = ctx.pages.find((p) => p.url === rb.page);
  if (!rbPage) r.fail('the RESTful Booker case study exists', rb.page);
  else {
    const rbHtml = readText(rbPage.file);
    const rbText = normalizeText(rbHtml.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' '));
    const rbTests = tagging.filter((t) => t.repo === 'restful-booker');
    const rbBody = (id) => { const [file, line] = id.split(':'); const row = rbTests.find((t) => t.file === file && t.line === Number(line)); return row ? repos.readRepoFile(dirs['restful-booker'], 'tests/' + file).split('\n').slice(row.line - 1, row.end).join('\n') : null; };
    const codesOf = (body) => [...body.matchAll(/status\(\)\)\.toBe\((\d{3})\)/g)].map((m) => m[1]);

    // layout: the tree on the page equals the repository at the pinned commit
    const treeCode = /<div class="architecture-box">\s*<code>([\s\S]*?)<\/code>/.exec(rbHtml);
    const listed = new Set();
    const stack = [];
    for (const line of (treeCode ? decodeEntities(treeCode[1]) : '').split('\n')) {
      const m = /^((?:│ {3}| {4})*)(?:├── |└── )(\S+)/.exec(line);
      if (m) { const idx = m[1].length / 4 + 1; stack.length = idx; const name = m[2]; if (name.endsWith('/')) stack[idx] = name; else listed.add(stack.join('') + name); }
      else if (line.trim()) { const name = line.trim().split(/\s+/)[0]; stack.length = 0; if (name.endsWith('/')) stack[0] = name; else listed.add(name); }
    }
    const dirRb = dirs['restful-booker'];
    const onDisk = [];
    const walk = (rel) => { for (const e of fs.readdirSync(path.join(dirRb, rel), { withFileTypes: true })) { const p = rel + '/' + e.name; if (e.isDirectory()) walk(p); else onDisk.push(p); } };
    for (const folder of rb.treeFolders) walk(folder);
    const treeBad = [];
    for (const f of listed) if (!fs.existsSync(path.join(dirRb, f))) treeBad.push(`${f}: on the page, not in the repo`);
    for (const f of onDisk) if (!listed.has(f)) treeBad.push(`${f}: in the repo, not on the page`);
    for (const f of rb.treeTopLevelFiles) if (!listed.has(f)) treeBad.push(`${f}: expected top-level file missing from the page`);
    r.expect(treeCode && treeBad.length === 0, `the case study's Framework Architecture tree lists exactly the files under ${rb.treeFolders.join(' and ')} at ${ex.repos['restful-booker'].sha}, and nothing that does not exist`, treeBad.slice(0, 3).join(' | ') || `${listed.size} files`);

    // status codes: per operation, recounted from the specs
    const derived = {};
    const claimedTests = [];
    for (const o of rb.operations) {
      derived[o.op] = {};
      for (const id of o.tests) {
        const body = rbBody(id);
        if (body === null) { treeBad.push(`${id}: not a tagged RESTful Booker test`); continue; }
        claimedTests.push(id);
        for (const c of new Set(codesOf(body))) derived[o.op][c] = (derived[o.op][c] || 0) + 1;
      }
    }
    const asserting = rbTests.map((t) => `${t.file}:${t.line}`).filter((id) => codesOf(rbBody(id)).length > 0);
    const missingOps = asserting.filter((id) => !claimedTests.includes(id));
    const extraOps = claimedTests.filter((id) => !asserting.includes(id));
    r.expect(asserting.length === rb.statusAssertingTests && !missingOps.length && !extraOps.length && new Set(claimedTests).size === claimedTests.length,
      `${asserting.length} RESTful Booker tests assert a status code, and every one belongs to exactly one operation in expected.json`, `${asserting.length} tests; unassigned: ${missingOps.join(',') || 'none'}; not asserting: ${extraOps.join(',') || 'none'}`);
    const block = /<div class="strategy-item" id="status-codes"[\s\S]*?<\/div>/.exec(rbHtml);
    const pageOps = {};
    if (block) for (const li of block[0].matchAll(/<li><code>([^<]+)<\/code>:([^<]*)<\/li>/g)) { pageOps[li[1]] = {}; for (const c of li[2].matchAll(/(\d{3}) \((\d+) tests?\)/g)) pageOps[li[1]][c[1]] = Number(c[2]); }
    const opBad = [];
    for (const o of rb.operations) if (JSON.stringify(Object.entries(pageOps[o.op] || {}).sort()) !== JSON.stringify(Object.entries(derived[o.op]).sort())) opBad.push(`${o.op}: page ${JSON.stringify(pageOps[o.op] || null)}, repo ${JSON.stringify(derived[o.op])}`);
    for (const op of Object.keys(pageOps)) if (!rb.operations.some((o) => o.op === op)) opBad.push(`${op}: on the page, not an operation the specs assert on`);
    r.expect(block && opBad.length === 0, 'the Status Code Validation list equals the per-operation counts recomputed from the specs', opBad.slice(0, 2).join(' | ') || Object.entries(derived).map(([op, c]) => `${op} ${Object.keys(c).join('/')}`).join('; '));
    const allCodes = new Set(Object.values(derived).flatMap((c) => Object.keys(c)));
    const inBlock = new Set(block ? [...block[0].matchAll(/(?<![\d])([1-5]\d\d)(?![\d])/g)].map((m) => m[1]) : []);
    const noUnreferenced = [...inBlock].filter((c) => !allCodes.has(c));
    const no401 = !allCodes.has('401');
    r.expect(noUnreferenced.length === 0 || (noUnreferenced.length === 1 && noUnreferenced[0] === '401' && /No test asserts a 401/.test(rbText) && no401),
      'the status-code block names no code that no test asserts (a 401 only inside "No test asserts a 401", which the repo confirms)', noUnreferenced.join(', ') || `${[...allCodes].sort().join(', ')} only`);
    const claim = `${asserting.length} of the ${counted['restful-booker']} tests assert a status code`;
    r.expect(rbText.includes(claim) && rbText.includes(`Status codes (${asserting.length} of the ${counted['restful-booker']} tests)`), `the page says "${claim}" and repeats it under Assertions`, rbText.includes(claim) ? 'found' : 'NOT found');

    // test data and raw requests
    const dataFile = repos.readRepoFile(dirRb, 'src/api/test-data/booking-data.ts');
    const exported = [...dataFile.matchAll(/export const (\w+)/g)].map((m) => m[1]);
    const specText = onDisk.filter((f) => f.startsWith('tests/')).map((f) => repos.readRepoFile(dirRb, f)).join('\n');
    const unused = exported.filter((n) => !new RegExp(`\\b${n}\\b`).test(specText));
    const used = exported.filter((n) => !unused.includes(n));
    const dataBad = [];
    if (JSON.stringify(exported) !== JSON.stringify(rb.sampleBookings.exported) || JSON.stringify(unused) !== JSON.stringify(rb.sampleBookings.unused)) dataBad.push(`repo exports ${exported.join(',')}, unused ${unused.join(',') || 'none'}`);
    for (const n of used) if (!rbText.includes(n)) dataBad.push(`${n} is used by the specs but not named on the page`);
    for (const n of unused) if (!new RegExp(`${n} is not used`).test(rbText)) dataBad.push(`${n} is unused but the page does not say so`);
    if (/fixtures/i.test(rbText) && !/no Playwright fixtures/.test(rbText)) dataBad.push('the page mentions fixtures without saying there are none');
    r.expect(dataBad.length === 0 && !fs.existsSync(path.join(dirRb, 'tests/fixtures.ts')), `the Centralized Test Data bullet matches booking-data.ts (${exported.length} exports, ${unused.length} unused) and the repo has no fixtures`, dataBad.join(' | ') || `${used.join(', ')} used; ${unused.join(', ')} unused`);
    const raw = (specText.match(/request\.(?:get|post|put|patch|delete)\(/g) || []).length;
    r.expect(raw === rb.rawRequestTests && rbText.includes('Four tests send a raw request'), `${raw} tests send a raw request instead of a client method, and the page says so`, `${raw} raw calls`);
    const forbidden = rb.forbiddenPhrases.filter((p) => rbText.toLowerCase().includes(p.toLowerCase()));
    r.expect(forbidden.length === 0, 'the case study contains none of the phrases removed for overclaiming', forbidden.join(', ') || 'clean');
  }

  // ------------------------------------------------------------------ page rules
  const models = await ctx.models();
  const m = models[cfg.page];
  r.expect(m.title.length <= cfg.titleMax && m.description.length <= cfg.descriptionMax && m.canonical === 'https://sayedasif.com' + cfg.page,
    `title <= ${cfg.titleMax} characters, meta description <= ${cfg.descriptionMax}, canonical is its own URL`, `title ${m.title.length}, description ${m.description.length}, ${m.canonical}`);
  const og = m.ogImage && new URL(m.ogImage).pathname;
  r.expect(og === '/image/og/api-testing.png' && m.twitterImage === m.ogImage, 'its social image is /image/og/api-testing.png, in Open Graph and Twitter tags', `${og} / ${m.twitterImage}`);
  const banned = new RegExp(cfg.bannedWords, 'i').exec(text);
  r.expect(!banned, 'none of the banned words appears on the page', banned ? `"${banned[0]}"` : 'clean');

  const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((x) => Number(x[1]));
  const skips = levels.filter((l, i) => i > 0 && l > levels[i - 1] + 1);
  r.expect(levels.filter((l) => l === 1).length === 1 && levels[0] === 1 && skips.length === 0, 'one h1, and heading levels never skip (h1 > h2 > h3)', `${levels.length} headings, ${skips.length} skips`);

  const figs = html.match(/<figure class="code-figure">[\s\S]*?<\/figure>/g) || [];
  const long = figs.map((f, i) => ({ i: i + 1, n: decodeEntities(/<code class="hljs">([\s\S]*?)<\/code>/.exec(f)[1].replace(/<[^>]+>/g, '')).replace(/\n$/, '').split('\n').length })).filter((x) => x.n > cfg.excerptMaxLines);
  r.expect(figs.length > 0 && long.length === 0, `${figs.length} excerpts, none longer than ${cfg.excerptMaxLines} lines`, long.map((x) => `#${x.i}: ${x.n} lines`).join(', ') || 'all within the limit');

  const inbound = cfg.linksTo.map((u) => { const p = ctx.pages.find((x) => x.url === u); return [u, p ? (readText(p.file).match(/href="\/api-testing\/"/g) || []).length : -1]; });
  r.expect(inbound.every(([, n]) => n === 1), 'each of Services, the RESTful Booker case study, the API article and Proof of Work links to /api-testing/ exactly once', inbound.map(([u, n]) => `${u} ${n}`).join(', '));
  const inNav = ctx.pages.filter((p) => { const t = readText(p.file); const header = /<header class="site-header">[\s\S]*?<\/header>/.exec(t); const footer = /<nav class="footer-nav"[\s\S]*?<\/nav>/.exec(t); return /href="\/api-testing\/"/.test((header ? header[0] : '') + (footer ? footer[0] : '')); }).map((p) => p.url);
  r.expect(inNav.length === 0, 'no navigation or footer entry was added for /api-testing/', inNav.join(', ') || 'none');

  // ------------------------------------------------------------------ code blocks and tables scroll inside their own box
  for (const width of [375, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const p = await context.newPage();
    await p.goto(baseUrl + cfg.page, { waitUntil: 'load' });
    const facts = await p.evaluate(() => {
      const box = (el) => { const cs = getComputedStyle(el); return { x: cs.overflowX, over: el.scrollWidth > el.clientWidth }; };
      const blocks = [...document.querySelectorAll('pre.code-block')].map(box);
      const tables = [...document.querySelectorAll('.table-wrap')].map(box);
      return { page: document.documentElement.scrollWidth, view: document.documentElement.clientWidth, blocks, tables, nBlocks: blocks.length };
    });
    const bad = [];
    if (facts.page > facts.view) bad.push(`page is ${facts.page}px wide in a ${facts.view}px viewport`);
    for (const b of facts.blocks) if (!/auto|scroll/.test(b.x)) bad.push('a code block does not scroll on its own');
    for (const t of facts.tables) if (!/auto|scroll/.test(t.x)) bad.push('a table wrapper does not scroll on its own');
    const scrolling = facts.blocks.filter((b) => b.over).length;
    r.expect(bad.length === 0, `at ${width}px: no sideways page scroll; ${facts.nBlocks} code blocks and the table scroll inside their own boxes`, bad.slice(0, 2).join(' | ') || `${scrolling} of ${facts.nBlocks} code blocks are wider than their box and scroll`);
    await context.close();
  }
  return [r.finish()];
}

module.exports = { ids: [21], run };
