'use strict';
/* Site discovery and small helpers shared by the checks. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// VERIFY_ROOT points the whole suite at another copy of the site (mutate.js uses a temp copy)
const ROOT = path.resolve(process.env.VERIFY_ROOT || path.join(__dirname, '..', '..', '..'));

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  mdash: '—', ndash: '–', middot: '·', bull: '•', hellip: '…', rarr: '→', larr: '←', copy: '©', times: '×', check: '✓',
};
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** Typographic quotes and dashes folded to ASCII, whitespace collapsed. For comparing wording, not for display. */
function normalizeText(s) {
  return decodeEntities(s).replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
}

/** Files that make up the site as Vercel would serve it: tracked or new files, minus .vercelignore and tooling. */
function deployedFiles() {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 })
    .split('\n').filter(Boolean);
  const ignore = fs.existsSync(path.join(ROOT, '.vercelignore'))
    ? fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.replace(/^\//, ''))
    : [];
  const skip = [...ignore, '.git/', 'node_modules/', '.gitignore', '.vercelignore', 'vercel.json', 'design-exploration/', '.backup_before_global_update/'];
  return out.filter((f) => fs.existsSync(path.join(ROOT, f)) && !skip.some((s) => (s.endsWith('/') ? f.startsWith(s) : f === s)));
}

const TEXT_EXT = new Set(['.html', '.css', '.js', '.json', '.xml', '.txt', '.svg', '.md']);
const isText = (f) => TEXT_EXT.has(path.extname(f).toLowerCase());

function pagesOf(files) {
  return files.filter((f) => f.endsWith('.html')).map((f) => ({ file: f, url: '/' + f.replace(/index\.html$/, '') }));
}

const readText = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');

/** Each regex match with a little context, for evidence lines. */
function grep(files, re, { ctx = 30, max = 8 } = {}) {
  const hits = [];
  for (const f of files) {
    const t = readText(f);
    const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m;
    while ((m = rx.exec(t))) {
      hits.push({ file: f, text: t.slice(Math.max(0, m.index - ctx), m.index + m[0].length + ctx).replace(/\s+/g, ' ') });
      if (m.index === rx.lastIndex) rx.lastIndex++;
      if (hits.length >= 500) return hits;
    }
  }
  return hits;
}

module.exports = { ROOT, decodeEntities, normalizeText, deployedFiles, isText, pagesOf, readText, grep };
