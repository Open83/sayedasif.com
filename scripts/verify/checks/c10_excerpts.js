'use strict';
/*
 * 10. Code excerpts are copied byte for byte from the repository files they link to, and every GitHub link answers 200.
 *
 * Independent of scripts/excerpts/refresh.js: this re-derives the expected text from the cited commit and compares.
 * "Byte for byte" means: each excerpt line is exactly the repository line, only a common indent is removed, and the
 * only added text is the "// ..." marker between line ranges that are not adjacent.
 */
const path = require('path');
const { result } = require('../lib/report');
const { decodeEntities, readText } = require('../lib/site');
const repos = require('../lib/repos');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function status(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      let res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      if (res.status === 405 || res.status === 403) res = await fetch(url, { method: 'GET', redirect: 'follow' });
      if (res.status === 429) { await sleep(4000 * (attempt + 1)); continue; }
      return res.status;
    } catch (e) { if (attempt === 3) return 'ERR ' + e.message; await sleep(1500); }
  }
  return 429;
}

async function run(ctx) {
  const r = result(10, 'Code excerpts identical to the repo files they link to; every GitHub link returns 200');
  const { expected: ex } = ctx;

  let dirs;
  try { dirs = repos.ensureAll(ex.repos); } catch (e) { r.skip(`could not clone the repositories (${String(e.message).split('\n')[0]})`); return [r.finish()]; }
  const keyOf = (github) => Object.keys(ex.repos).find((k) => ex.repos[k].github === github);

  // ---------------------------------------------------------------- excerpts
  const rows = [];
  const problems = [];
  const pagesWithFigures = {};
  for (const p of ctx.pages) {
    const html = readText(p.file);
    for (const fig of html.match(/<figure class="code-figure">[\s\S]*?<\/figure>/g) || []) {
      pagesWithFigures[p.url] = (pagesWithFigures[p.url] || 0) + 1;
      const code = /<code class="hljs">([\s\S]*?)<\/code>/.exec(fig);
      const link = /<a href="https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([0-9a-f]+)\/([^#"]+)#L(\d+)-L(\d+)"[^>]*>[^<]*?, lines ([^@<]+?) @ ([0-9a-f]+)/.exec(fig);
      if (!code || !link) { problems.push(`${p.url}: figure without a parsable excerpt or caption link`); continue; }
      const shown = decodeEntities(code[1].replace(/<[^>]+>/g, '')).replace(/\n$/, '');
      const [, github, sha, rel, hashFirst, hashLast, label, labelSha] = link;
      const key = keyOf(github);
      if (!key) { problems.push(`${p.url}: repository ${github} is not one of the four project repos`); continue; }
      if (sha !== ex.repos[key].sha || labelSha !== sha) { problems.push(`${p.url}: cites ${sha}/${labelSha}, expected ${ex.repos[key].sha}`); continue; }
      const lines = repos.readRepoFile(dirs[key], rel).split('\n');
      const rs = label.replace(/&ndash;|–/g, '-').split(',').map((s) => s.trim()).map((s) => (s.includes('-') ? s.split('-').map(Number) : [Number(s), Number(s)]));
      if (rs.some(([a, b]) => !(a >= 1 && b >= a && b <= lines.length))) { problems.push(`${p.url}: a cited range is outside ${rel} (${lines.length} lines)`); continue; }
      if (Number(hashFirst) !== rs[0][0] || Number(hashLast) !== rs[rs.length - 1][1]) problems.push(`${p.url}: link anchor #L${hashFirst}-L${hashLast} does not match the cited ranges ${label}`);

      // rebuild the expected text
      const out = [];
      let prev = null;
      for (const [a, b] of rs) {
        if (prev !== null && a > prev + 1) out.push(' '.repeat(lines[a - 1].match(/^ */)[0].length) + '// ...');
        for (let i = a; i <= b; i++) out.push(lines[i - 1]);
        prev = b;
      }
      const indent = Math.min(...out.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
      const want = out.map((l) => l.slice(indent)).join('\n');
      const same = want === shown;
      if (!same) {
        const a = want.split('\n'), b = shown.split('\n');
        const i = a.findIndex((l, n) => l !== b[n]);
        problems.push(`${p.url}: ${rel} lines ${label}: first difference at excerpt line ${i + 1}: repo "${(a[i] ?? '').trim().slice(0, 60)}" vs page "${(b[i] ?? '').trim().slice(0, 60)}"`);
      }
      // gaps are only where lines were skipped
      const bogus = [];
      shown.split('\n').forEach((l, i, arr) => { if (/^\s*\/\/ \.\.\.$/.test(l) && !want.split('\n')[i]?.includes('// ...')) bogus.push(i + 1); });
      if (bogus.length) problems.push(`${p.url}: "// ..." marker where no lines were skipped (excerpt line ${bogus.join(', ')})`);
      rows.push({ url: p.url, rel, label: label.replace(/&ndash;/g, '-'), sha, lines: shown.split('\n').length, same });
    }
  }
  r.expect(rows.length > 0 && problems.length === 0, `${rows.length} excerpts on ${Object.keys(pagesWithFigures).length} pages equal the cited repo lines (dedented, gaps marked)`,
    problems.length ? problems.slice(0, 4).join(' | ') : rows.map((x) => `${x.rel.split('/').pop()}@${x.sha} ${x.label}`).join('; '));
  for (const row of rows) r.note(`${row.same ? 'identical' : 'DIFFERENT'}  ${row.url}  ${row.rel} lines ${row.label} (${row.lines} lines shown)`);

  // the project pages the brief names must each carry at least one excerpt
  for (const slug of ['restful-booker', 'automation-exercise', 'razorpay']) {
    const page = ex.projects[slug].page;
    r.expect(pagesWithFigures[page] >= 1, `${page} has a code excerpt`, `${pagesWithFigures[page] || 0}`);
  }

  // ---------------------------------------------------------------- GitHub links
  if (ctx.args.skipNetwork) {
    r.note('GitHub link status skipped (--skip-network)');
    return [r.finish()];
  }
  const urls = new Set();
  for (const p of ctx.pages) for (const m of readText(p.file).matchAll(/href="(https:\/\/github\.com\/Open83[^"#]*(?:#[^"]*)?)"/g)) urls.add(decodeEntities(m[1]));
  const list = [...urls];
  const bad = [];
  const queue = [...list];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const u = queue.shift();
      const s = await status(u.split('#')[0]);
      if (s !== 200) bad.push(`${u} -> ${s}`);
    }
  }));
  r.expect(bad.length === 0, `${list.length} distinct github.com/Open83 links return 200`, bad.length ? bad.slice(0, 4).join(' | ') : 'all 200 (repos, blob lines, Actions runs, docs)');
  return [r.finish()];
}

module.exports = { ids: [10], run };
