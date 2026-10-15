'use strict';
/*
 * 2. Pages exist as expected; deleted pages return 301 to the right target.
 * Expectations come from expected.json (not from vercel.json), then vercel.json is compared with them in both directions.
 */
const fs = require('fs');
const path = require('path');
const { result } = require('../lib/report');
const { redirectStatus, start } = require('../lib/server');
const { execFileSync } = require('child_process');

async function run(ctx) {
  const r = result(2, 'Pages exist; deleted pages 301 to the right place');
  const { expected: ex, baseUrl, root } = ctx;
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

  // every expected page answers 200 HTML
  const bad = [];
  for (const url of ex.pages) {
    const res = await fetch(baseUrl + url, { redirect: 'manual' });
    if (res.status !== 200 || !/text\/html/.test(res.headers.get('content-type') || '')) bad.push(`${url} -> ${res.status}`);
  }
  r.expect(bad.length === 0, `${ex.pages.length} expected pages return 200 text/html`, bad.length ? bad.join(', ') : ex.pages.length + ' pages');

  // no page exists that is not expected (a stray page would be indexable)
  const extra = ctx.pages.map((p) => p.url).filter((u) => !ex.pages.includes(u));
  r.expect(extra.length === 0, 'no unexpected pages in the deployed tree', extra.length ? extra.join(', ') : 'none');

  // deleted pages are gone from disk
  const stillThere = ex.deletedPageFiles.filter((f) => fs.existsSync(path.join(root, f)));
  r.expect(stillThere.length === 0, 'deleted page files are absent from the repository', stillThere.length ? stillThere.join(', ') : ex.deletedPageFiles.length + ' files absent');

  // each expected redirect: status 301 and destination, then the destination itself resolves
  const redirectBad = [];
  for (const { from, to } of ex.redirects) {
    const res = await fetch(baseUrl + from, { redirect: 'manual' });
    const loc = res.headers.get('location');
    const abs = loc && new URL(loc, baseUrl).toString();
    if (res.status !== 301 || abs !== new URL(to, baseUrl).toString()) { redirectBad.push(`${from}: ${res.status} -> ${loc}`); continue; }
    const dest = await fetch(new URL(to, baseUrl).toString().split('#')[0], { redirect: 'manual' });
    if (dest.status !== 200) redirectBad.push(`${from}: destination ${to} answers ${dest.status}`);
  }
  r.expect(redirectBad.length === 0, `${ex.redirects.length} redirects answer 301 with the expected Location, destinations return 200`,
    redirectBad.length ? redirectBad.join(' | ') : ex.redirects.map((x) => x.from).join(', '));

  // vercel.json and the expectations agree in both directions
  const configured = (vercel.redirects || []).filter((x) => !/:path\*/.test(x.source));
  const missing = ex.redirects.filter((e) => !configured.some((c) => c.source === e.from && c.destination === e.to && c.statusCode === 301 && c.permanent === undefined));
  const unexpected = configured.filter((c) => !ex.redirects.some((e) => e.from === c.source));
  r.expect(missing.length === 0 && unexpected.length === 0, 'vercel.json redirects equal the expected list, each declaring "statusCode": 301',
    missing.length || unexpected.length ? `missing or not statusCode 301: ${missing.map((m) => m.from)}; unexpected: ${unexpected.map((u) => u.source)}` : `${configured.length} rules`);

  // why the rule must say statusCode: Vercel turns permanent:true into 308, and the emulator above does the same
  r.expect(redirectStatus({ permanent: true }) === 308 && redirectStatus({ permanent: false }) === 307 && redirectStatus({ statusCode: 301 }) === 301, "emulator follows Vercel's documented status codes (permanent:true alone is 308, so only an explicit statusCode gives the 301 asked for)", 'permanent:true -> 308, permanent:false -> 307, statusCode:301 -> 301');

  // the repository's private-ish folders are not reachable even if .vercelignore were not honoured
  const guardBad = [];
  for (const { from, to } of ex.guardRedirects) {
    const res = await fetch(baseUrl + from, { redirect: 'manual' });
    const loc = res.headers.get('location');
    if (![301, 302, 307, 308].includes(res.status) || !loc || new URL(loc, baseUrl).toString() !== new URL(to, baseUrl).toString()) guardBad.push(`${from}: ${res.status} -> ${loc}`);
  }
  r.expect(guardBad.length === 0, '/scripts/ and /drafts/ redirect to / (safety net next to .vercelignore)', guardBad.length ? guardBad.join(' | ') : ex.guardRedirects.map((g) => g.from).join(', '));
  // every file the repository holds under scripts/ and drafts/ (what a Git deployment would contain) must not be served.
  // Run twice: as an upload that honours .vercelignore, and as one that ignores it (only the redirect rules protect then).
  const priv = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'scripts', 'drafts'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  const urlOf = (file) => '/' + file.split('/').map(encodeURIComponent).join('/');
  const probe = async (base, file) => { const res = await fetch(base + urlOf(file), { redirect: 'manual' }); return { status: res.status, loc: res.headers.get('location') }; };
  const guarded = (x) => [301, 302, 307, 308].includes(x.status) && x.loc === '/';
  const guardSource = /^\/(scripts|drafts)\//;
  const guards = (vercel.redirects || []).filter((x) => guardSource.test(x.source));
  const listed = priv.filter((x) => x.startsWith('scripts/resume-source/') || x.startsWith('drafts/blog/'));
  const noIgnore = await start({ root });
  const noIgnoreServer = await start({ root, honourVercelIgnore: false });
  const noGuards = await start({ root, honourVercelIgnore: false, config: { ...vercel, redirects: (vercel.redirects || []).filter((x) => !guardSource.test(x.source)) } });
  try {
    const seen = {};
    for (const [mode, base] of [['.vercelignore honoured', baseUrl], ['.vercelignore ignored (Git upload of everything)', noIgnoreServer.url]]) {
      const bad = [];
      for (const file of priv) { const x = await probe(base, file); if (x.status === 200 || !guarded(x)) bad.push(`${file} -> ${x.status} ${x.loc || ''}`); seen[mode + file] = x; }
      r.expect(bad.length === 0, `${mode}: none of the ${priv.length} files under scripts/ and drafts/ is served (each answers a redirect to /, never 200)`, bad.slice(0, 3).join(' | ') || `${priv.length} files, e.g. ${listed.map((l) => l + ' -> ' + seen[mode + l].status).join('; ')}`);
    }
    const variants = ['/Scripts/resume-source/resume-ats.html', '/scripts', '/scripts/', '/drafts', '/drafts/', '/scripts/resume-source/', '/scripts//resume-source/resume-ats.html'];
    const vbad = [];
    for (const v of variants) { const res = await fetch(noIgnoreServer.url + v, { redirect: 'manual' }); if (res.status === 200) vbad.push(v); }
    r.expect(vbad.length === 0, 'directory and odd spellings of the private paths are not served either (.vercelignore ignored)', vbad.join(', ') || variants.join(' '));
    // control: without the guard rules and without .vercelignore the probe sees the file, so "not 200" above means something
    const ctl = await probe(noGuards.url, 'scripts/resume-source/resume-ats.html');
    const ctl2 = await probe(noGuards.url, listed.find((l) => l.startsWith('drafts/blog/')) || 'drafts/blog/README.md');
    r.expect(ctl.status === 200 && ctl2.status === 200, 'control: with the guard rules removed and .vercelignore ignored, the same probe DOES get 200 for scripts/resume-source/resume-ats.html and a drafts/blog file', `${ctl.status} and ${ctl2.status}`);
    // with .vercelignore honoured and no guards the file is hidden by the ignore file alone (404)
    const only = await start({ root, config: { ...vercel, redirects: [] } });
    const c3 = await probe(only.url, 'scripts/resume-source/resume-ats.html');
    await only.close();
    r.expect(c3.status === 404, 'control: .vercelignore alone (no guard rules) hides the file with a 404', `${c3.status}`);
  } finally { await noIgnore.close(); await noIgnoreServer.close(); await noGuards.close(); }
  const ignoreText = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8').split(/\r?\n/).filter(Boolean).join(' | ');
  r.note(`.vercelignore lines: ${ignoreText}`);
  r.note(`guard rules in vercel.json: ${guards.map((g) => `source ${g.source} -> ${g.destination} (permanent:${g.permanent})`).join('; ')}`);
  r.note(`files probed: ${priv.length} (${priv.filter((x) => x.startsWith('scripts/resume-source/')).length} in scripts/resume-source, ${priv.filter((x) => x.startsWith('drafts/blog/')).length} in drafts/blog)`);
  r.note('Local server follows vercel.json rule by rule; Vercel\'s own rule order and whether a Git deployment honours .vercelignore (its docs only speak of uploads) are only verified by check 20 with a preview URL.');
  return [r.finish()];
}

module.exports = { ids: [2], run };
