#!/usr/bin/env node
/*
 * Keeps the shared header and footer markup identical on every page.
 *
 * The site is plain static HTML (no build step), so the header and footer are
 * repeated in each file. This script holds the one canonical copy and writes it
 * into every page, setting the "current page" state from the page's URL.
 *
 *   node scripts/sync-site-chrome.js          rewrite header/footer in every page
 *   node scripts/sync-site-chrome.js --check  report pages that differ (exit 1), write nothing
 *
 * Safety: every page is validated first. If any page is unexpected (missing or duplicate
 * header/footer, oversized or content-bearing block, page not listed as STANDALONE) the
 * script prints the problems, exits 2 and writes nothing, in both modes.
 *
 * No dependencies. Not deployed (see .vercelignore).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'scripts', '.backup_before_global_update', 'design-exploration', '.playwright-mcp']);

// ---- primary navigation (single source of truth)
const NAV = [
  { label: 'Home', href: '/', match: (u) => u === '/' },
  { label: 'About', href: '/about/', match: (u) => u === '/about/' },
  { label: 'Projects', href: '/proof-of-work/', match: (u) => u === '/proof-of-work/' || u.startsWith('/projects/') },
  { label: 'Services', href: '/services/', match: (u) => u === '/services/' },
  { label: 'Blog', href: '/blog/', match: (u) => u === '/blog/' || u.startsWith('/blog/') },
  { label: 'Resume', href: '/resume/', match: (u) => u === '/resume/' || u.startsWith('/resume/') },
  { label: 'Contact', href: '/contact/', match: (u) => u === '/contact/' },
];

const FOOTER_NAV = [
  ['Projects', '/proof-of-work/'],
  ['Services', '/services/'],
  ['Blog', '/blog/'],
  ['About', '/about/'],
  ['Payment Testing', '/payments/'],
];

const SOCIAL = [
  ['GitHub', 'https://github.com/Open83', 'fab fa-github'],
  ['LinkedIn', 'https://www.linkedin.com/in/asifsayed83/', 'fab fa-linkedin'],
  ['WhatsApp', 'https://wa.me/919867574386', 'fab fa-whatsapp'],
];

function header(url) {
  const links = NAV.map((item) => {
    const here = item.match(url);
    const exact = item.href === url;
    const attrs = here ? (exact ? ' class="active" aria-current="page"' : ' class="active"') : '';
    return `                <a href="${item.href}"${attrs}>${item.label}</a>`;
  }).join('\n');
  return `    <header class="site-header">
    <nav aria-label="Main navigation">

        <div class="container nav-inner">

            <a href="/" class="logo" aria-label="Sayed Asif home">Sayed<span>Asif</span></a>

            <!-- The button comes BEFORE the links in the DOM so keyboard focus moves into the opened menu. -->
            <button class="hamburger" id="menuButton" type="button" aria-label="Open navigation menu" aria-expanded="false" aria-controls="navLinks">
                <svg class="icon-open" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
                <svg class="icon-close" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>

            <div class="nav-links" id="navLinks">
${links}
            </div>

        </div>

    </nav>
    </header>`;
}

function footer() {
  const nav = FOOTER_NAV.map(([t, h]) => `                    <a href="${h}">${t}</a>`).join('\n');
  const social = SOCIAL.map(([n, h, i]) => `                        <a href="${h}" class="social-icon" aria-label="${n} (opens in a new tab)" target="_blank" rel="noopener noreferrer"><i class="${i}" aria-hidden="true"></i></a>`).join('\n');
  return `    <footer class="site-footer">

        <div class="container">

            <div class="footer-main">

                <div class="footer-brand">
                    <p class="brand-name">Sayed<span>Asif</span></p>
                    <p class="brand-title">Software QA Engineer</p>
                    <p class="brand-tagline">API Testing &bull; Playwright Automation</p>
                </div>

                <nav class="footer-nav" aria-label="Footer navigation">
${nav}
                </nav>

                <div class="footer-contact">
                    <a href="/contact/" class="footer-contact-link">Contact</a>
                    <div class="social-links">
${social}
                    </div>
                </div>

            </div>

            <div class="footer-bottom">
                <p class="copyright">&copy; 2026 Sayed Asif. All rights reserved.</p>
                <a href="/privacy/" class="privacy-link">Privacy Notice</a>
            </div>

        </div>

    </footer>`;
}

// Pages that intentionally have no shared header/footer (standalone documents).
// Any OTHER page without them is treated as an error, not silently skipped.
const STANDALONE = new Set(['resume/sayed-asif-qa-engineer-resume.html']);

// Sanity limits: a real block is ~1-2.5 KB. Anything far larger means the regex
// matched across page content (e.g. an unclosed tag) and must not be overwritten.
const MAX_BLOCK = 6000;

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (e.name.endsWith('.html')) out.push(f);
  }
  return out;
}

/** Locate one block between an exact opening tag and its first closing tag, or explain why not. */
function findBlock(text, open, close, kind) {
  const n = text.split(open).length - 1;
  if (n !== 1) return { error: `${n} ${kind} elements found, expected exactly 1` };
  const start = text.indexOf(open);
  const end = text.indexOf(close, start);
  if (end < 0) return { error: `${kind} has no closing tag` };
  // include the indentation before the opening tag, as before
  const lineStart = text.lastIndexOf('\n', start) + 1;
  const from = /^[ \t]*$/.test(text.slice(lineStart, start)) ? lineStart : start;
  const to = end + close.length;
  const block = text.slice(from, to);
  if (block.length > MAX_BLOCK) return { error: `${kind} block is ${block.length} bytes (limit ${MAX_BLOCK}); refusing to overwrite` };
  if (/<main[\s>]|<\/main>|<h1[\s>]|<script[\s>]/.test(block)) return { error: `${kind} block contains page content (main/h1/script); refusing to overwrite` };
  return { from, to };
}

const check = process.argv.includes('--check');
const errors = [];
const plan = [];        // { file, rel, out, raw }
let same = 0, standalone = 0;

for (const file of walk(ROOT, []).sort()) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let t = raw.replace(/\r\n/g, '\n');
  const hasHeader = t.includes('<header class="site-header">');
  const hasFooter = t.includes('<footer class="site-footer">');

  if (!hasHeader && !hasFooter) {
    if (STANDALONE.has(rel)) { standalone++; continue; }
    errors.push(`${rel}: has no shared header/footer and is not listed in STANDALONE`);
    continue;
  }
  if (hasHeader !== hasFooter) { errors.push(`${rel}: has a ${hasHeader ? 'header but no footer' : 'footer but no header'}`); continue; }

  const h = findBlock(t, '<header class="site-header">', '</header>', 'header');
  const f = findBlock(t, '<footer class="site-footer">', '</footer>', 'footer');
  if (h.error || f.error) { errors.push(`${rel}: ${h.error || f.error}`); continue; }
  if (h.to > f.from) { errors.push(`${rel}: footer appears before the header`); continue; }

  const url = '/' + rel.replace(/index\.html$/, '');
  // replace the later block first so earlier offsets stay valid
  t = t.slice(0, f.from) + footer() + t.slice(f.to);
  t = t.slice(0, h.from) + header(url) + t.slice(h.to);
  const out = crlf ? t.replace(/\n/g, '\r\n') : t;
  if (out === raw) same++;
  else plan.push({ file, rel, out });
}

if (errors.length) {
  console.error('ERROR: nothing was written.\n  ' + errors.join('\n  '));
  process.exit(2);
}

if (check) {
  for (const p of plan) console.log('DIFFERS: ' + p.rel);
  console.log(`checked: ${plan.length} differ, ${same} already identical, ${standalone} standalone (intentionally skipped)`);
  process.exit(plan.length ? 1 : 0);
}

// Write phase happens only after EVERY page validated. Temp file + rename, so a
// crash cannot leave a half-written page.
for (const p of plan) {
  const tmp = p.file + '.sync-tmp';
  fs.writeFileSync(tmp, p.out);
  fs.renameSync(tmp, p.file);
}
console.log(`synced: ${plan.length} updated, ${same} already identical, ${standalone} standalone (intentionally skipped)`);
