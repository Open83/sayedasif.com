#!/usr/bin/env node
/*
 * Keeps the project cover SVGs identical everywhere they are used, and builds the social images.
 *
 *   node scripts/covers/build.js           write the covers into every page (between the cover markers)
 *   node scripts/covers/build.js --check   report pages whose covers differ from the source (exit 1), write nothing
 *   node scripts/covers/build.js --og      also render image/og/<slug>.png (1200x630) from the covers;
 *                                          needs Playwright and sharp: npm install in scripts/verify
 *   node scripts/covers/build.js --og=api-testing   render only that social image
 *
 * A page opts in with a pair of comments:  <!-- cover:razorpay --> ... <!-- /cover:razorpay -->
 * The design lives in render.js, the content in projects.json (project covers) and pages.json
 * (social images for other pages, drawn without a test count). Not deployed (see .vercelignore).
 */
const fs = require('fs');
const path = require('path');
const { render, renderWide } = require('./render');
const { projects } = require('./projects.json');
const { pages: ogPages } = require('./pages.json');

const ROOT = path.resolve(__dirname, '..', '..');
const SKIP = new Set(['.git', 'node_modules', 'scripts', 'drafts', 'design-exploration', '.backup_before_global_update']);
const MARK = /<!-- cover:([a-z-]+) -->[\s\S]*?<!-- \/cover:\1 -->/g;

function pages(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const f = path.join(dir, e.name);
    // A folder with its own .git is a separate repo (a local clone of a QA repo), not part of the site.
    if (e.isDirectory() && fs.existsSync(path.join(f, '.git'))) continue;
    if (e.isDirectory()) pages(f, out); else if (e.name.endsWith('.html')) out.push(f);
  }
  return out;
}

const bySlug = Object.fromEntries(projects.map((p) => [p.slug, p]));
const check = process.argv.includes('--check');
let differs = 0, updated = 0, placements = 0;

for (const file of pages()) {
  const raw = fs.readFileSync(file, 'utf8');
  if (!raw.includes('<!-- cover:')) continue;
  const crlf = raw.includes('\r\n');
  const text = raw.replace(/\r\n/g, '\n');
  const next = text.replace(MARK, (m, slug) => {
    if (!bySlug[slug]) throw new Error(`${path.relative(ROOT, file)}: unknown cover "${slug}"`);
    placements++;
    return `<!-- cover:${slug} -->${render(bySlug[slug])}<!-- /cover:${slug} -->`;
  });
  if (next !== text) {
    differs++;
    if (check) console.log('DIFFERS: ' + path.relative(ROOT, file));
    else { fs.writeFileSync(file, crlf ? next.replace(/\n/g, '\r\n') : next); updated++; }
  }
}
console.log(check ? `checked ${placements} cover placements: ${differs} page(s) differ` : `covers written: ${placements} placements, ${updated} page(s) updated`);
if (check && differs) process.exitCode = 1;

const ogArg = process.argv.find((a) => a === '--og' || a.startsWith('--og='));
if (ogArg) {
  const only = ogArg.startsWith('--og=') ? ogArg.slice(5) : null;
  const targets = [...projects, ...ogPages].filter((p) => !only || p.slug === only);
  if (only && !targets.length) throw new Error(`--og=${only}: no project or page with that slug`);
  (async () => {
    const { createRequire } = require('module');
    const req = createRequire(path.join(ROOT, 'scripts', 'verify', 'package.json'));
    const { chromium } = req('playwright');
    const sharp = req('sharp');
    const outDir = path.join(ROOT, 'image', 'og');
    fs.mkdirSync(outDir, { recursive: true });
    const browser = await chromium.launch();
    try {
      for (const p of targets) {
        const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
        await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff">${renderWide(p, { standalone: true })}</body>`);
        const png = await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } });
        const file = path.join(outDir, `${p.slug}.png`);
        await sharp(png).png({ palette: true, quality: 90, effort: 10 }).toFile(file);
        console.log(`og: image/og/${p.slug}.png ${(fs.statSync(file).size / 1024).toFixed(1)} KB`);
        await page.close();
      }
    } finally { await browser.close(); }
  })();
}
