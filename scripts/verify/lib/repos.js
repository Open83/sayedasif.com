'use strict';
/* Clones the four public project repositories at the commits the site cites, and counts their tests from the spec files. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CACHE = path.resolve(__dirname, '..', '.cache', 'repos');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 }).trim();
}

function ensure(key, repo) {
  const dir = path.join(CACHE, key);
  if (fs.existsSync(path.join(dir, '.git'))) {
    let head = '';
    try { head = git(['rev-parse', '--short=7', 'HEAD'], dir); } catch { /* re-clone below */ }
    if (head === repo.sha) return dir;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(CACHE, { recursive: true });
  git(['clone', '--quiet', `https://github.com/${repo.github}.git`, dir]);
  git(['checkout', '--quiet', repo.sha], dir);
  return dir;
}

function ensureAll(repos) {
  const dirs = {};
  for (const [key, repo] of Object.entries(repos)) dirs[key] = ensure(key, repo);
  return dirs;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out); else out.push(f);
  }
  return out;
}

/**
 * Counts test definitions from the source files: lines that open test('...'), it('...') or setup('...').
 * test.describe(...) and commented-out lines are not counted. This matches `playwright test --list` for these repos,
 * which have no parametrised or looped tests (checked when this was written: 37 / 47 / 6 / 26).
 */
function countTests(dir, repo) {
  // test( / it( / setup( at the start of a line, with the title string on the same line or the next
  const rx = /^[ \t]*(?:test|it|setup)(?:\.(?:only|skip|fixme))?\s*\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/gm;
  const files = walk(path.join(dir, repo.testDir)).filter((f) => repo.specPattern.test(f.split(path.sep).join('/')));
  const tests = [];
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
    let m;
    while ((m = rx.exec(text))) {
      const line = text.slice(0, m.index).split('\n').length;
      tests.push({ file: path.relative(dir, f).split(path.sep).join('/'), line, title: m[2], live: /@razorpay-live/.test(m[2]) });
    }
  }
  return { files: files.length, tests };
}

const readRepoFile = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8').replace(/\r\n/g, '\n');

module.exports = { CACHE, ensureAll, countTests, readRepoFile };
