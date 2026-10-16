'use strict';
/*
 * 19. Images and Lighthouse.
 *   A. every <img>: alt attribute, width/height attributes that match the file's aspect ratio, loads, not upscaled or wildly
 *      oversized for the size it is shown at (1280px and 390px), not distorted, light enough, not lazy above the fold
 *   B. inline SVG project covers: role="img" with title + desc wired through aria-labelledby, viewBox, no external references or
 *      scripts, unique ids, exactly one of the wide/compact pair visible at each width, small markup
 *   C. no image file in the deployed tree that nothing references (orphans); social images are light
 *   D. Lighthouse per page, only with --lighthouse (lab numbers from the local server, simulated mobile); otherwise a note
 */
const fs = require('fs');
const path = require('path');
const { result } = require('../lib/report');
const { pool } = require('../lib/pool');
const { isText, readText } = require('../lib/site');
const sharp = require('sharp');

const LIMITS = {
  upscale: 0.95,      // file narrower than the box it fills by more than 5%: blurry
  oversize: 4,        // file more than 4x the width it is shown at: wasted bytes
  fileKB: 350,        // one image file
  coverKB: 25,        // markup of one inline SVG cover
  socialKB: 400,      // social share image
  aspect: 0.03,       // allowed distortion
};

// ---- run inside the page ------------------------------------------------------------------------------------------
function imageFacts() {
  return [...document.images].map((img) => {
    const r = img.getBoundingClientRect();
    const cs = getComputedStyle(img);
    return {
      src: img.getAttribute('src') || '', current: img.currentSrc, alt: img.getAttribute('alt'),
      w: img.getAttribute('width'), h: img.getAttribute('height'), loading: img.getAttribute('loading'),
      complete: img.complete, nw: img.naturalWidth, nh: img.naturalHeight,
      shownW: r.width, shownH: r.height, rendered: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0,
      fit: cs.objectFit, top: r.top + scrollY, innerHeight,
    };
  });
}

function coverFacts() {
  const dupes = [];
  const seen = new Set();
  for (const e of document.querySelectorAll('[id]')) { if (seen.has(e.id)) dupes.push(e.id); seen.add(e.id); }
  const svgs = [...document.querySelectorAll('svg.cv')].map((svg) => {
    const ref = (svg.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    const named = ref.map((id) => { const t = document.getElementById(id); return t ? (t.textContent || '').trim().length : 0; });
    const html = svg.outerHTML;
    return {
      cls: svg.getAttribute('class'), role: svg.getAttribute('role'), viewBox: svg.getAttribute('viewBox'), refs: ref.length, named,
      hasTitle: !!svg.querySelector(':scope > title'), hasDesc: !!svg.querySelector(':scope > desc'),
      external: [...html.matchAll(/(?:href|src)="(?!#)[^"]*"|url\(\s*['"]?https?:|@import|<image\b|<foreignObject|<script\b/gi)].map((m) => m[0]).slice(0, 3),
      bytes: new TextEncoder().encode(html).length, shown: getComputedStyle(svg).display !== 'none',
      parent: svg.parentElement ? svg.parentElement.className : '',
    };
  });
  return { svgs, dupes };
}

async function scrollThrough() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let y = 0; y < document.documentElement.scrollHeight; y += Math.round(innerHeight * 0.7)) { scrollTo({ top: y, behavior: 'instant' }); await wait(60); }
  scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
  await wait(400);
  const bottom = scrollY;
  scrollTo({ top: 0, behavior: 'instant' });
  await wait(500);
  return { bottom, max: document.documentElement.scrollHeight - innerHeight };
}
// ------------------------------------------------------------------------------------------------------------------------

const kb = (n) => (n / 1024).toFixed(1) + ' KB';

async function lighthouse(ctx, pages) {
  let lh;
  try { lh = (await import('lighthouse')).default; } catch (e) { return { error: 'lighthouse is not installed (cd scripts/verify && npm install)' }; }
  const { chromium } = require('playwright');
  const port = 9400 + Math.floor(Math.random() * 400);
  const browser = await chromium.launch({ args: [`--remote-debugging-port=${port}`] });
  const rows = [];
  try {
    for (const p of pages) {
      const res = await lh(ctx.baseUrl + p.url, { port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] });
      const c = res.lhr.categories;
      const a = res.lhr.audits;
      rows.push({
        url: p.url, performance: Math.round(c.performance.score * 100), accessibility: Math.round(c.accessibility.score * 100),
        bestPractices: Math.round(c['best-practices'].score * 100), seo: Math.round(c.seo.score * 100),
        lcp: a['largest-contentful-paint'].displayValue, cls: a['cumulative-layout-shift'].displayValue, tbt: a['total-blocking-time'].displayValue,
        // failed pass/fail audits of the three non-performance categories (performance audits are lab numbers, reported below)
        failed: ['accessibility', 'best-practices', 'seo'].flatMap((cat) => c[cat].auditRefs.filter((ref) => a[ref.id].score === 0 && a[ref.id].scoreDisplayMode === 'binary').map((ref) => ref.id)),
      });
    }
  } finally { await browser.close(); }
  return { rows };
}

async function run(ctx) {
  const r = result(19, 'Images (alt, size, weight), inline SVG covers, orphaned files, Lighthouse');
  const { baseUrl, browser, pages, args, root, files } = ctx;

  // ------------------------------------------------------------------ collect <img> and cover facts at 1280 and 390
  const jobs = [];
  for (const width of [1280, 390]) for (const p of pages) jobs.push({ url: p.url, width });
  const data = await pool(jobs, 4, async (j) => {
    const context = await browser.newContext({ viewport: { width: j.width, height: 900 } });
    const page = await context.newPage();
    await page.goto(baseUrl + j.url, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    const initial = await page.evaluate(imageFacts);
    const scrolled = await page.evaluate(scrollThrough);
    const final = await page.evaluate(imageFacts);
    const covers = await page.evaluate(coverFacts);
    await context.close();
    return { ...j, initial, final, covers, scrolled };
  });

  const shallow = data.filter((d) => d.scrolled.bottom < d.scrolled.max - 2);
  r.expect(shallow.length === 0, 'the scroll-through reached the very bottom of every page (pages use scroll-behavior: smooth, so scrolling is instant), so lazy images were really requested', shallow.slice(0, 3).map((d) => `${d.url} @${d.width}: ${d.scrolled.bottom} of ${d.scrolled.max}`).join(' | ') || `${data.length} loads`);

  // ------------------------------------------------------------------ A. <img>
  const imgs = data.flatMap((d) => d.final.map((f, i) => ({ ...f, url: d.url, width: d.width, firstTop: d.initial[i] ? d.initial[i].top : f.top, loadingAtStart: d.initial[i] ? d.initial[i].loading : f.loading })));
  const distinct = [...new Set(imgs.map((i) => i.src))];
  const total = imgs.length / 2; // each page was measured at two widths
  const noAlt = imgs.filter((i) => i.alt === null).map((i) => `${i.url} ${i.src}`);
  r.expect(noAlt.length === 0, `every <img> has an alt attribute (${total} images on ${pages.length} pages, ${distinct.length} distinct files)`, [...new Set(noAlt)].slice(0, 3).join(' | ') || `${total} images, ${imgs.filter((i) => i.alt === '').length / 2} decorative with alt=""`);
  const emptyAlt = imgs.filter((i) => i.alt !== null && i.alt.trim() === '' && i.width === 1280);
  r.note(`images with empty alt (decorative): ${emptyAlt.length ? emptyAlt.map((i) => i.src).join(', ') : 'none'}`);

  const noDims = imgs.filter((i) => !/^\d+$/.test(i.w || '') || !/^\d+$/.test(i.h || '')).map((i) => `${i.url} ${i.src}`);
  r.expect(noDims.length === 0, 'every <img> has numeric width and height attributes (reserves space, no layout shift)', [...new Set(noDims)].slice(0, 3).join(' | ') || `${total} images`);

  // file dimensions come from the files themselves, so images the browser never rendered are covered too
  const fileDims = {};
  for (const src of distinct.filter((x) => x && !/^https?:/.test(x))) {
    const file = path.join(root, new URL(src, 'http://x/').pathname);
    try { const m = await sharp(file).metadata(); fileDims[src] = { w: m.width, h: m.height }; } catch { /* reported below */ }
  }
  const broken = imgs.filter((i) => i.rendered && (!i.complete || i.nw === 0)).map((i) => `${i.url} @${i.width} ${i.src}`);
  const undecodable = distinct.filter((x) => x && !/^https?:/.test(x) && !fileDims[x]);
  r.expect(broken.length === 0 && undecodable.length === 0, 'every rendered <img> loads in the browser after scrolling the whole page, and every image file exists and decodes', [...new Set(broken), ...undecodable.map((x) => x + ' (file missing or not an image)')].slice(0, 3).join(' | ') || `${imgs.filter((i) => i.rendered).length} rendered loads, ${Object.keys(fileDims).length} files decoded`);

  const ratioBad = imgs.filter((i) => fileDims[i.src] && /^\d+$/.test(i.w || '') && /^\d+$/.test(i.h || '') && Math.abs(i.w / i.h - fileDims[i.src].w / fileDims[i.src].h) / (fileDims[i.src].w / fileDims[i.src].h) > 0.02).map((i) => `${i.src}: attributes ${i.w}x${i.h}, file ${fileDims[i.src].w}x${fileDims[i.src].h}`);
  r.expect(ratioBad.length === 0, 'width/height attributes keep the aspect ratio of the file (within 2%)', [...new Set(ratioBad)].slice(0, 3).join(' | ') || `${distinct.length} files`);

  const sized = imgs.filter((i) => i.rendered && i.nw > 0 && i.shownW >= 2 && !/\.svg(\?|$)/i.test(i.src));
  const up = sized.filter((i) => i.nw < i.shownW * LIMITS.upscale).map((i) => `${i.url} @${i.width} ${i.src}: file ${i.nw}px shown ${Math.round(i.shownW)}px`);
  const over = sized.filter((i) => i.nw > i.shownW * LIMITS.oversize).map((i) => `${i.url} @${i.width} ${i.src}: file ${i.nw}px shown ${Math.round(i.shownW)}px (${(i.nw / i.shownW).toFixed(1)}x)`);
  const ratios = sized.map((i) => i.nw / i.shownW);
  r.expect(up.length === 0 && over.length === 0, `no image is upscaled (file < ${LIMITS.upscale}x its box) or more than ${LIMITS.oversize}x wider than the box it is shown in, at 1280px and 390px`, [...up, ...over].slice(0, 3).join(' | ') || `${sized.length} rendered images; file-to-box width ratio ${Math.min(...ratios).toFixed(2)}x to ${Math.max(...ratios).toFixed(2)}x`);

  const squash = sized.filter((i) => i.fit === 'fill' && Math.abs(i.shownW / i.shownH - i.nw / i.nh) / (i.nw / i.nh) > LIMITS.aspect).map((i) => `${i.url} @${i.width} ${i.src}: shown ${Math.round(i.shownW)}x${Math.round(i.shownH)}, file ${i.nw}x${i.nh}`);
  r.expect(squash.length === 0, `no image is distorted (shown aspect within ${LIMITS.aspect * 100}% of the file's, unless object-fit is set)`, [...new Set(squash)].slice(0, 3).join(' | ') || `${sized.length} rendered images`);

  const sizes = distinct.filter((s) => s && !/^https?:/.test(s)).map((s) => { const f = path.join(root, new URL(s, 'http://x/').pathname); return { s, bytes: fs.existsSync(f) ? fs.statSync(f).size : -1 }; });
  const heavy = sizes.filter((x) => x.bytes > LIMITS.fileKB * 1024 || x.bytes < 0).map((x) => `${x.s}: ${x.bytes < 0 ? 'missing' : kb(x.bytes)}`);
  const biggest = [...sizes].sort((a, b) => b.bytes - a.bytes)[0];
  r.expect(heavy.length === 0, `every image file is under ${LIMITS.fileKB} KB`, heavy.slice(0, 3).join(' | ') || `${sizes.length} files, ${kb(sizes.reduce((n, x) => n + x.bytes, 0))} in total, largest ${biggest ? biggest.s + ' ' + kb(biggest.bytes) : 'n/a'}`);
  const ext = distinct.filter((s) => /^https?:/.test(s) && !s.startsWith(baseUrl));
  if (ext.length) r.note(`images on other hosts (not measured): ${ext.join(', ')}`);

  const lazyTop = imgs.filter((i) => i.loadingAtStart === 'lazy' && i.firstTop < i.innerHeight && i.rendered).map((i) => `${i.url} @${i.width} ${i.src}`);
  r.expect(lazyTop.length === 0, 'no image inside the first screen is loading="lazy" (it would delay the largest paint)', [...new Set(lazyTop)].slice(0, 3).join(' | ') || `${total} images`);
  const eager = imgs.filter((i) => i.width === 1280 && i.loadingAtStart !== 'lazy' && i.firstTop > i.innerHeight * 1.5 && i.rendered).map((i) => `${i.url} ${i.src}`);
  r.note(`images far below the first screen without loading="lazy" (optional improvement): ${eager.length ? eager.slice(0, 6).join(', ') + (eager.length > 6 ? ` (+${eager.length - 6})` : '') : 'none'}`);

  // ------------------------------------------------------------------ B. inline SVG covers
  const coverRows = data.flatMap((d) => d.covers.svgs.map((s) => ({ ...s, url: d.url, width: d.width })));
  const coverPages = [...new Set(coverRows.map((c) => c.url))];
  const cbad = [];
  for (const c of coverRows.filter((x) => x.width === 1280)) {
    const where = `${c.url} ${c.cls}`;
    if (c.role !== 'img') cbad.push(`${where}: role is ${c.role}`);
    if (!c.hasTitle || !c.hasDesc || c.refs < 2 || c.named.some((n) => n === 0)) cbad.push(`${where}: title/desc not wired through aria-labelledby`);
    if (!/^0 0 \d+ \d+$/.test(c.viewBox || '')) cbad.push(`${where}: viewBox ${c.viewBox}`);
    if (c.external.length) cbad.push(`${where}: external or script content ${c.external.join(', ')}`);
    if (c.bytes > LIMITS.coverKB * 1024) cbad.push(`${where}: ${kb(c.bytes)}`);
  }
  r.expect(coverRows.length > 0 && cbad.length === 0, `inline SVG covers (${coverRows.filter((x) => x.width === 1280).length} on ${coverPages.length} pages): role="img", <title>+<desc> via aria-labelledby, viewBox, no external references or scripts, each under ${LIMITS.coverKB} KB`, cbad.slice(0, 3).join(' | ') || `largest ${kb(Math.max(...coverRows.map((c) => c.bytes)))}, smallest ${kb(Math.min(...coverRows.map((c) => c.bytes)))}`);
  const dupes = data.filter((d) => d.width === 1280 && d.covers.dupes.length).map((d) => `${d.url}: ${[...new Set(d.covers.dupes)].slice(0, 3).join(',')}`);
  r.expect(dupes.length === 0, 'no duplicate element ids on any page (aria-labelledby and marker ids stay unambiguous)', dupes.slice(0, 3).join(' | ') || `${pages.length} pages`);
  const pairBad = [];
  for (const d of data) {
    const groups = {};
    for (const s of d.covers.svgs) (groups[s.cls.split(' ')[1] + '|' + s.parent] ||= []).push(s);
    for (const [k, g] of Object.entries(groups)) {
      const bySlug = {};
      for (const s of g) (bySlug[s.cls.split(' ')[1]] ||= []).push(s);
      for (const [slug, list] of Object.entries(bySlug)) if (list.length === 2 && list.filter((s) => s.shown).length !== 1) pairBad.push(`${d.url} @${d.width} ${slug}: ${list.filter((s) => s.shown).length} of 2 visible`);
    }
  }
  r.expect(pairBad.length === 0, 'exactly one of the wide/compact cover pair is visible at 1280px and at 390px (never both, never neither)', pairBad.slice(0, 3).join(' | ') || `${coverRows.length / 2} pairs checked at two widths`);

  // ------------------------------------------------------------------ C. orphans and social images
  const imageFiles = files.filter((f) => /\.(png|jpe?g|webp|gif|svg|ico|avif)$/i.test(f));
  const corpus = files.filter((f) => isText(f) && !f.startsWith('drafts/')).map((f) => readText(f)).join('\n');
  const implicit = new Set(['favicon.ico']); // browsers ask for it without any markup
  const orphans = imageFiles.filter((f) => !implicit.has(f) && !corpus.includes('/' + f) && !corpus.includes('"' + f) && !corpus.includes("'" + f) && !corpus.includes('(' + f) && !corpus.includes(path.basename(f)));
  r.expect(orphans.length === 0, `no orphaned image files: all ${imageFiles.length} image files in the deployed tree are referenced by a page, stylesheet or script`, orphans.slice(0, 5).join(', ') || imageFiles.length + ' files referenced');
  const models = await ctx.models();
  const social = pages.map((p) => models[p.url].ogImage).filter(Boolean);
  const socialBad = [...new Set(social)].map((u) => { const f = path.join(root, new URL(u).pathname); return { u, bytes: fs.existsSync(f) ? fs.statSync(f).size : -1 }; }).filter((x) => x.bytes < 0 || x.bytes > LIMITS.socialKB * 1024).map((x) => `${x.u}: ${x.bytes < 0 ? 'missing' : kb(x.bytes)}`);
  r.expect(socialBad.length === 0, `social share images are under ${LIMITS.socialKB} KB`, socialBad.join(' | ') || [...new Set(social)].map((u) => path.basename(u) + ' ' + kb(fs.statSync(path.join(root, new URL(u).pathname)).size)).join(', '));

  // ------------------------------------------------------------------ D. Lighthouse
  if (!args.lighthouse) {
    r.note('Lighthouse not run: pass --lighthouse (needs "npm install" in scripts/verify). Not part of the default run because it takes several minutes.');
  } else {
    const lh = await lighthouse(ctx, pages);
    if (lh.error) r.fail('Lighthouse could run', lh.error);
    else {
      const a11y = lh.rows.filter((x) => x.accessibility < 100).map((x) => `${x.url} ${x.accessibility}`);
      r.expect(a11y.length === 0, 'Lighthouse accessibility is 100 on every page (same engine as check 17)', a11y.slice(0, 4).join(' | ') || `${lh.rows.length} pages`);
      const noindex = (url) => /name="robots"[^>]*noindex/.test(readText(pages.find((p) => p.url === url).file));
      const failedAudits = lh.rows.map((x) => ({ url: x.url, ids: x.failed.filter((id) => !(id === 'is-crawlable' && noindex(x.url))) })).filter((x) => x.ids.length);
      r.expect(failedAudits.length === 0, 'Lighthouse: no accessibility, best-practices or SEO audit fails on any page (is-crawlable is exempt on a page that is noindex on purpose)', failedAudits.slice(0, 3).map((x) => `${x.url}: ${x.ids.join(',')}`).join(' | ') || `${lh.rows.length} pages; lowest best-practices ${Math.min(...lh.rows.map((x) => x.bestPractices))}, lowest SEO ${Math.min(...lh.rows.filter((x) => !noindex(x.url)).map((x) => x.seo))} (indexable pages)`);
      r.note(`noindex on purpose, so Lighthouse's crawlable audit is expected to fail there: ${lh.rows.filter((x) => noindex(x.url)).map((x) => `${x.url} (SEO ${x.seo})`).join(', ') || 'none'}`);
      r.note('Lighthouse (lab, simulated mobile, local server with gzip, no CDN; performance is indicative only)');
      r.note('  page | perf | a11y | best-practices | seo | LCP | CLS | TBT');
      for (const x of lh.rows) r.note(`  ${x.url} | ${x.performance} | ${x.accessibility} | ${x.bestPractices} | ${x.seo} | ${x.lcp} | ${x.cls} | ${x.tbt}`);
      fs.writeFileSync(path.join(ctx.outDir, 'lighthouse.json'), JSON.stringify(lh.rows, null, 2));
    }
  }
  return [r.finish()];
}

module.exports = { ids: [19], run };
