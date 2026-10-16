'use strict';
/*
 * 1. Build, lint and tests.
 * This is a static site: there is no bundler and no unit-test suite. So:
 *   build  = the generated markup (shared header/footer/WhatsApp button/script tag, project covers) is in sync with its generators
 *   lint   = every JS file parses, every JSON file parses, the HTML validator (W3C Nu) reports no errors
 *   tests  = the other checks in this suite
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { result } = require('../lib/report');
const { ROOT } = require('../lib/site');

const VNU = path.join(__dirname, '..', 'node_modules', 'vnu-jar', 'build', 'dist', 'vnu.jar');

// The Nu validator's CSS checker predates CSS Containment (container-type / @container) and light-dark().
// These messages are validator gaps, not defects: the properties are standard and supported by current browsers.
const KNOWN_FALSE_POSITIVES = [/“container-type”: Property “container-type” doesn't exist/];

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

async function runCheck(ctx) {
  const r = result(1, 'Build, lint and tests');

  const sync = run('node', ['scripts/sync-site-chrome.js', '--check']);
  r.expect(sync.code === 0, 'shared header/footer/WhatsApp button/scripts in sync (sync-site-chrome --check)', sync.out.trim().split('\n').pop());

  const covers = run('node', ['scripts/covers/build.js', '--check']);
  r.expect(covers.code === 0, 'project covers in sync with their source (covers/build --check)', covers.out.trim().split('\n').pop());

  // JS syntax
  const jsFiles = ctx.files.filter((f) => f.endsWith('.js'));
  const scriptJs = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'scripts'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter((f) => f.endsWith('.js') && !f.includes('node_modules'));
  const allJs = [...new Set([...jsFiles, ...scriptJs])].filter((f) => fs.existsSync(path.join(ROOT, f)));
  const jsBad = allJs.filter((f) => run('node', ['--check', f]).code !== 0);
  r.expect(jsBad.length === 0, `JavaScript syntax (node --check) on ${allJs.length} files`, jsBad.length ? 'syntax error in ' + jsBad.join(', ') : `${allJs.length} files parse`);

  // JSON syntax
  const jsonFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter((f) => f.endsWith('.json') && !f.includes('node_modules') && !f.includes('package-lock'));
  const jsonBad = [];
  for (const f of jsonFiles) { try { JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { jsonBad.push(`${f}: ${e.message}`); } }
  r.expect(jsonBad.length === 0, `JSON syntax on ${jsonFiles.length} files`, jsonBad.length ? jsonBad.join('; ') : jsonFiles.join(', '));

  // HTML validator
  if (!fs.existsSync(VNU)) {
    r.note('HTML validator skipped: vnu-jar is not installed (run npm install in scripts/verify)');
  } else if (spawnSync('java', ['-version']).error) {
    r.note('HTML validator skipped: Java is not on PATH');
  } else {
    const pages = ctx.files.filter((f) => f.endsWith('.html'));
    const v = spawnSync('java', ['-jar', VNU, '--errors-only', '--format', 'json', ...pages], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 27 });
    let msgs = [];
    try { msgs = JSON.parse(v.stderr || v.stdout).messages || []; } catch { msgs = [{ type: 'error', message: 'could not parse validator output: ' + (v.stderr || v.stdout).slice(0, 200) }]; }
    const real = msgs.filter((m) => m.type === 'error' && !KNOWN_FALSE_POSITIVES.some((re) => re.test(m.message)));
    const ignored = msgs.filter((m) => m.type === 'error').length - real.length;
    r.expect(real.length === 0, `HTML validator (W3C Nu, errors only) on ${pages.length} pages`,
      real.length ? real.slice(0, 4).map((m) => `${path.basename(path.dirname(m.url || ''))}/${path.basename(m.url || '')}:${m.lastLine} ${m.message}`).join(' | ') : `0 errors (${ignored} known validator gaps ignored: container-type)`);
  }

  r.note('No bundler or unit tests exist in this static site: "build" = generated-markup sync checks, "lint" = JS/JSON syntax + HTML validator, "tests" = checks 2-20.');
  return [r.finish()];
}

module.exports = { ids: [1], run: runCheck };
