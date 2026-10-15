#!/usr/bin/env node
/*
 * Re-renders every code excerpt on the site from the public repositories, so an excerpt can never drift from its source.
 *
 *   node scripts/excerpts/refresh.js           rewrite the excerpts that differ
 *   node scripts/excerpts/refresh.js --check   report excerpts that differ (exit 1), write nothing
 *
 * An excerpt is a <figure class="code-figure"> whose caption link is the specification:
 *   <a href=".../blob/<sha>/<file>#L<first>-L<last>">file, lines 61-69, 77-79 @ <sha></a>
 * The listed line ranges are copied verbatim, a "// ..." line marks each gap between ranges, and the common indent is removed.
 * Highlighting is done here with highlight.js, so the pages need no script.
 *
 * Needs `npm install` in scripts/verify (highlight.js) and network on the first run (clones the repositories at the cited commits).
 */
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..', '..');
const req = createRequire(path.join(ROOT, 'scripts', 'verify', 'package.json'));
const hljs = req('highlight.js');
const repos = require(path.join(ROOT, 'scripts', 'verify', 'lib', 'repos.js'));
const expected = require(path.join(ROOT, 'scripts', 'verify', 'expected.json'));

const SKIP = new Set(['.git', 'node_modules', 'scripts', 'drafts', 'design-exploration', '.backup_before_global_update']);
const LANG = { '.js': 'javascript', '.ts': 'typescript', '.yml': 'yaml', '.yaml': 'yaml', '.json': 'json' };
const check = process.argv.includes('--check');

function pages(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) pages(f, out); else if (e.name.endsWith('.html')) out.push(f);
  }
  return out;
}

const dirs = repos.ensureAll(expected.repos);
const keyOf = (github) => Object.keys(expected.repos).find((k) => expected.repos[k].github === github);

/** "61&ndash;69, 77&ndash;79" or "288, 295&ndash;296" -> [[61,69],[77,79]] */
function ranges(label) {
  return label.replace(/&ndash;/g, '-').split(',').map((s) => s.trim()).map((s) => (s.includes('-') ? s.split('-').map(Number) : [Number(s), Number(s)]));
}

function excerpt(lines, rs) {
  const out = [];
  let prevEnd = null;
  for (const [a, b] of rs) {
    if (prevEnd !== null && a > prevEnd + 1) out.push(' '.repeat(lines[a - 1].match(/^ */)[0].length) + '// ...');
    out.push(...lines.slice(a - 1, b));
    prevEnd = b;
  }
  const indent = Math.min(...out.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return out.map((l) => l.slice(indent)).join('\n');
}

let differs = 0, figures = 0;
for (const file of pages()) {
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  const text = raw.replace(/\r\n/g, '\n');
  const next = text.replace(/<figure class="code-figure">[\s\S]*?<\/figure>/g, (fig) => {
    figures++;
    const cap = /<figcaption>([\s\S]*?) <a href="https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([0-9a-f]+)\/([^#"]+)#L\d+-L\d+"[^>]*>[^<]*?, lines ([^@<]+?) @ ([0-9a-f]+)/.exec(fig);
    if (!cap) throw new Error(`${path.relative(ROOT, file)}: a code figure has no parsable caption link`);
    const [, caption, github, sha, rel, label] = cap;
    const key = keyOf(github);
    if (!key) throw new Error(`${path.relative(ROOT, file)}: unknown repository ${github}`);
    if (sha !== expected.repos[key].sha) throw new Error(`${path.relative(ROOT, file)}: ${key} excerpt cites ${sha}, expected ${expected.repos[key].sha}`);
    const lines = repos.readRepoFile(dirs[key], rel).split('\n');
    const rs = ranges(label);
    for (const [a, b] of rs) if (!(a >= 1 && b >= a && b <= lines.length)) throw new Error(`${path.relative(ROOT, file)}: lines ${a}-${b} are outside ${rel}`);
    const code = excerpt(lines, rs);
    const html = hljs.highlight(code, { language: LANG[path.extname(rel)] || 'javascript' }).value;
    const first = rs[0][0], last = rs[rs.length - 1][1];
    const link = `https://github.com/${github}/blob/${sha}/${rel}#L${first}-L${last}`;
    return `<figure class="code-figure">
                        <pre class="code-block" tabindex="0"><code class="hljs">${html}</code></pre>
                        <figcaption>${caption} <a href="${link}" target="_blank" rel="noopener noreferrer">${rel}, lines ${label} @ ${sha}<span class="sr-only"> (opens in a new tab)</span></a></figcaption>
                    </figure>`;
  });
  if (next !== text) {
    differs++;
    if (check) console.log('DIFFERS: ' + path.relative(ROOT, file));
    else fs.writeFileSync(file, crlf ? next.replace(/\n/g, '\r\n') : next);
  }
}
console.log(check ? `checked ${figures} excerpts: ${differs} page(s) differ` : `excerpts refreshed: ${figures} excerpts, ${differs} page(s) updated`);
if (check && differs) process.exitCode = 1;
