'use strict';
/*
 * 17. axe-core accessibility: zero violations on every page at 1280px and 390px, in light and dark colour-scheme emulation.
 *     (WCAG 2.0/2.1/2.2 A and AA rules plus axe best practices, plus the experimental Label-in-Name rule 2.5.3.)
 *
 * The site has no dark theme (pages declare color-scheme: light and have no prefers-color-scheme styles). The dark runs
 * therefore prove the pages stay readable when the visitor's system asks for dark; this is reported, not hidden.
 * The project covers DO follow the colour scheme (light-dark()), so their palettes are checked in both schemes below.
 *
 * The contexts use bypassCSP because the check injects axe-core as an inline script, which the site's own
 * Content-Security-Policy (script-src 'self') blocks. Only the test harness bypasses it; check 18 loads the pages
 * without the bypass and fails on any CSP violation or console error.
 */
const fs = require('fs');
const path = require('path');
const { result } = require('../lib/report');
const { ratio, parse } = require('../lib/contrast');
const { render } = require('../../covers/render');
const { projects } = require('../../covers/projects.json');
const { readText } = require('../lib/site');
const { sampleTargets } = require('../lib/pixelcontrast');
const { pool } = require('../lib/pool');

const AXE = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

// ---- run inside the page ------------------------------------------------------------------------------------------
// one hash of every colour the page paints (text, backgrounds, borders, outlines, SVG fill/stroke, shadows) plus the root color-scheme
function colourFingerprint() {
  const props = ['color', 'backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'outlineColor', 'fill', 'stroke', 'boxShadow', 'textDecorationColor'];
  let h = 5381, n = 0;
  const add = (str) => { for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0; };
  add(getComputedStyle(document.documentElement).colorScheme);
  for (const el of document.querySelectorAll('*')) { const cs = getComputedStyle(el); for (const p of props) add(cs[p]); n++; }
  return { hash: h.toString(16), elements: n };
}

// text/arrow colour against the surface behind it for every cover SVG in the document, with the document forced into one colour scheme
function coverPairs(scheme) {
  document.documentElement.style.colorScheme = scheme;
  const st = document.createElement('style');
  st.textContent = '.cv{display:block!important}'; // both layouts (wide and compact) at once
  document.head.appendChild(st);
  const out = [];
  for (const svg of document.querySelectorAll('svg.cv')) {
    const surfaces = [...svg.querySelectorAll('rect')].map((rc) => ({ b: rc.getBBox(), fill: getComputedStyle(rc).fill }));
    const slug = svg.getAttribute('class').split(' ')[1];
    const kind = svg.getAttribute('class').includes('narrow') ? 'narrow' : 'wide';
    for (const t of svg.querySelectorAll('text')) {
      const b = t.getBBox();
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      const under = surfaces.filter((q) => cx >= q.b.x && cx <= q.b.x + q.b.width && cy >= q.b.y && cy <= q.b.y + q.b.height).pop();
      const circle = t.classList.contains('num') ? [...svg.querySelectorAll('circle')].find((c) => Math.abs(c.cx.baseVal.value - cx) < 3 && Math.abs(c.cy.baseVal.value - cy) < 3) : null;
      out.push({ scheme, slug, kind, text: t.textContent.trim(), fg: getComputedStyle(t).fill, bg: circle ? getComputedStyle(circle).fill : under ? under.fill : null });
    }
    const arrows = [...svg.querySelectorAll('.arrow')].map((a) => getComputedStyle(a).stroke);
    out.push({ scheme, slug, kind: 'graphic', text: 'arrow', fg: arrows[0], bg: getComputedStyle(svg.querySelector('.panel, .node')).fill });
  }
  st.remove();
  document.documentElement.style.colorScheme = '';
  return out;
}
// ------------------------------------------------------------------------------------------------------------------------

async function run(ctx) {
  const r = result(17, 'axe: zero violations, every page, 1280px and 390px, light and dark');
  const { baseUrl, browser, pages } = ctx;
  const combos = [];
  for (const scheme of ['light', 'dark']) for (const width of [1280, 390]) combos.push({ scheme, width });

  let runs = 0;
  const failures = [];
  const pixel = { checked: 0, svg: 0, other: [], unjudged: [], failures: [], worst: null };
  const darkDiffers = [];
  const fingerprints = {};
  for (const combo of combos) {
    // reduced motion: the pages' own prefers-reduced-motion rule jumps every animation to its end state, so contrast is judged on the final look
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: combo.width, height: 900 }, colorScheme: combo.scheme, reducedMotion: 'reduce' });
    const results = await pool(pages, 4, async (p) => {
      const page = await context.newPage();
      await page.goto(baseUrl + p.url, { waitUntil: 'load' });
      await page.addStyleTag({ content: '.section{opacity:1!important;transform:none!important}' });
      await page.waitForTimeout(300);
      await page.addScriptTag({ content: AXE });
      const res = await page.evaluate(async (tags) => {
        const out = await axe.run(document, { runOnly: { type: 'tag', values: tags }, rules: { 'label-content-name-mismatch': { enabled: true } } }); // WCAG 2.5.3 Label in Name: experimental in axe, so off unless asked for
        return { violations: out.violations.map((v) => ({ id: v.id, impact: v.impact, count: v.nodes.length, target: v.nodes[0].target.join(' '), help: v.help })), passes: out.passes.length, incomplete: out.incomplete.map((i) => i.id), contrastTargets: (out.incomplete.find((i) => i.id === 'color-contrast')?.nodes || []).map((n) => n.target.join(' ')), scheme: getComputedStyle(document.documentElement).colorScheme, bg: getComputedStyle(document.body).backgroundColor, fg: getComputedStyle(document.body).color };
      }, TAGS);
      res.fingerprint = await page.evaluate(colourFingerprint);
      const sampled = combo.scheme === 'light' ? await sampleTargets(page, res.contrastTargets) : null;
      await page.close();
      return { url: p.url, sampled, ...res };
    });
    for (const x of results) {
      runs++;
      if (x.sampled) {
        const sm = x.sampled, at = `${x.url} @${combo.width}`;
        pixel.checked += sm.checked;
        for (const [reason, sels] of Object.entries(sm.skippedBy)) { if (reason === 'svg') pixel.svg += sels.length; else pixel.other.push(...sels.map((t) => `${at}: ${t} (${reason})`)); }
        pixel.unjudged.push(...sm.unjudged.map((t) => `${at}: ${t}`));
        pixel.failures.push(...sm.failures.map((f) => `${at}: ${f}`));
        if (sm.worst && (!pixel.worst || sm.worst.ratio < pixel.worst.ratio)) pixel.worst = { ...sm.worst, url: x.url, width: combo.width };
      }
      for (const v of x.violations) failures.push(`${x.url} @${combo.width} ${combo.scheme}: ${v.id} (${v.impact}) x${v.count} ${v.target}`);
      if (combo.scheme === 'dark') darkDiffers.push({ url: x.url, width: combo.width, scheme: x.scheme, bg: x.bg });
      (fingerprints[`${x.url} @${combo.width}`] ||= {})[combo.scheme] = x.fingerprint;
    }
    r.note(`${combo.scheme} ${combo.width}px: ${results.length} pages, violations ${results.reduce((n, x) => n + x.violations.length, 0)}, rules passed (sum) ${results.reduce((n, x) => n + x.passes, 0)}, needs-review items ${[...new Set(results.flatMap((x) => x.incomplete))].join(', ') || 'none'}`);
    await context.close();
  }
  r.expect(failures.length === 0, `zero axe violations across ${runs} page runs (${pages.length} pages x 2 widths x 2 colour schemes; ${TAGS.join(', ')})`, failures.slice(0, 4).join(' | ') || `${runs} runs clean`);

  const pixelBad = [...pixel.failures, ...pixel.unjudged.map((u) => `${u} could not be judged`), ...pixel.other.map((o) => `${o} skipped`)];
  r.expect(pixelBad.length === 0, 'text axe marks "needs review" (gradient, image or overlapping backgrounds; form fields): every one is judged and has sufficient contrast (worst pixel / typed and placeholder text)', pixelBad.length ? pixelBad.slice(0, 4).join(' | ') + (pixelBad.length > 4 ? ` (+${pixelBad.length - 4} more)` : '') : `${pixel.checked} elements judged (light scheme, 1280 and 390px), none unjudged, ${pixel.svg} skipped as SVG cover text (judged by the palette check below); worst ${pixel.worst ? pixel.worst.ratio.toFixed(2) + ':1 on ' + pixel.worst.url + ' ' + pixel.worst.target + ' (' + pixel.worst.width + 'px)' : 'n/a'}`);

  // the sampler must be able to fail: controls with known contrast on a gradient, plain text and gradient-clipped text
  const ctl = await browser.newContext({ bypassCSP: true, viewport: { width: 800, height: 600 } });
  const cp = await ctl.newPage();
  await cp.setContent('<!doctype html><body style="margin:0;font:700 20px sans-serif"><div style="background:linear-gradient(90deg,#fff,#ddd);padding:20px">'
    + '<p id="low" style="margin:0;color:#aaa">low contrast control</p>'
    + '<p id="ok" style="margin:0;color:#334155">good contrast control</p>'
    + '<p id="gradlow" style="margin:0;font-size:40px;background:linear-gradient(90deg,#9ad,#bde);-webkit-background-clip:text;background-clip:text;color:transparent">gradient low</p>'
    + '<p id="gradok" style="margin:0;font-size:40px;background:linear-gradient(90deg,#00789c,#004a63);-webkit-background-clip:text;background-clip:text;color:transparent">gradient ok</p></div>'
    + '<style>#fieldlow::placeholder{color:#bbb}</style><input id="fieldlow" placeholder="low" style="color:#334155;background:#fff"><input id="fieldok" placeholder="ok" style="color:#334155;background:#fff">');
  const control = await sampleTargets(cp, ['#low', '#ok', '#gradlow', '#gradok', '#fieldlow', '#fieldok']);
  const flagged = control.failures.map((f) => f.split(' ')[0]).sort().join(',');
  r.expect(flagged === '#fieldlow,#gradlow,#low' && control.checked === 6, 'contrast sampler self-test: flags exactly the three known low-contrast controls (plain text, gradient-clipped text, a form field placeholder) and passes the three good ones', `flagged: ${flagged || 'none'}; checked ${control.checked}; worst ${control.worst ? control.worst.ratio.toFixed(2) + ':1 ' + control.worst.target : 'n/a'}`);
  await ctl.close();

  // does asking for dark change anything a visitor sees? Compare every computed colour of every element, light run vs dark run.
  const keys = Object.keys(fingerprints);
  const changed = keys.filter((k) => fingerprints[k].light.hash !== fingerprints[k].dark.hash);
  const lightBg = new Set(darkDiffers.map((d) => d.bg));
  r.note(`dark emulation vs light, same page and width: ${keys.length - changed.length} of ${keys.length} identical in every computed colour of every element (${keys.reduce((n, k) => n + fingerprints[k].light.elements, 0)} elements hashed); root background ${[...lightBg].join(' / ')}; differing: ${changed.join(', ') || 'none'}. So no dark styling reaches a visitor: half of the 60 axe runs repeat the light ones.`);
  const hasDarkCss = pages.filter((p) => /prefers-color-scheme\s*:\s*dark|data-theme|color-scheme\s*:\s*[^;"]*dark/.test(readText(p.file))).map((p) => p.url);
  r.expect(changed.length === 0 && hasDarkCss.length === 0, 'there is no dark styling: no page has prefers-color-scheme: dark, data-theme or color-scheme: dark rules, and dark emulation changes no computed colour on any page at 1280 or 390px (if this ever fails, dark styling was added and the dark axe runs become meaningful)', `${keys.length - changed.length}/${keys.length} page+width combinations identical; pages with dark rules: ${hasDarkCss.join(', ') || 'none'}`);

  // the fingerprint must be able to see dark styling: a synthetic page that does restyle itself for dark must hash differently
  const hashes = {};
  for (const scheme of ['light', 'dark']) {
    const c = await browser.newContext({ bypassCSP: true, colorScheme: scheme });
    const pg = await c.newPage();
    await pg.setContent('<!doctype html><style>body{background:#fff;color:#111}@media (prefers-color-scheme: dark){body{background:#000;color:#eee}}</style><p>control</p>');
    hashes[scheme] = (await pg.evaluate(colourFingerprint)).hash;
    await c.close();
  }
  r.expect(hashes.light !== hashes.dark, 'colour fingerprint self-test: a synthetic page with a prefers-color-scheme: dark rule hashes differently in dark emulation, so "30/30 identical" really means no dark styling', `light ${hashes.light}, dark ${hashes.dark}`);

  // ---------------------------------------------------------------- cover palettes in both schemes
  // the one dark palette that exists: light-dark() in the covers. It only shows if something sets color-scheme: dark, so force it.
  const harness = '<!doctype html><meta charset="utf-8"><body style="margin:0">' + projects.map((p) => '<div style="width:800px">' + render(p) + '</div>').join('');
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1000, height: 900 } });
  const page = await context.newPage();
  await page.setContent(harness);
  const pairs = [...(await page.evaluate(coverPairs, 'light')), ...(await page.evaluate(coverPairs, 'dark'))];
  // the same on the covers as shipped, in situ on every page that has them
  const live = [];
  for (const p of pages.filter((x) => /<svg class="cv /.test(readText(x.file)))) {
    await page.goto(baseUrl + p.url, { waitUntil: 'load' });
    for (const scheme of ['light', 'dark']) live.push(...(await page.evaluate(coverPairs, scheme)).map((q) => ({ ...q, slug: q.slug + ' on ' + p.url })));
  }
  const judge = (list) => {
    const low = [];
    for (const p of list) {
      if (!p.bg || p.bg === 'none') { low.push(`${p.scheme} ${p.slug} "${p.text}": no surface found`); continue; }
      const need = p.kind === 'graphic' ? 3 : 4.5;
      const c = ratio(p.fg, p.bg);
      if (c < need) low.push(`${p.scheme} ${p.slug} ${p.kind} "${p.text}": ${c.toFixed(2)}:1 < ${need}`);
    }
    return low;
  };
  const low = judge(pairs);
  const slugs = [...new Set(pairs.map((p) => p.slug))];
  r.expect(low.length === 0, `project covers (generator output): every text and arrow meets contrast (>= 4.5:1 text, >= 3:1 arrows) in the light AND the dark palette (${pairs.length} pairs, ${slugs.length} covers, wide and phone layouts)`, low.slice(0, 4).join(' | ') || 'all pairs pass');
  const liveLow = judge(live);
  r.expect(live.length > 0 && liveLow.length === 0, `project covers as shipped, in situ on their pages with the colour scheme forced to light and to dark: every pair passes (${live.length} pairs)`, liveLow.slice(0, 4).join(' | ') || `${live.length} pairs on ${new Set(live.map((q) => q.slug.split(' on ')[1])).size} pages`);
  const sample = pairs.filter((p) => p.slug === 'cv-razorpay' && p.text === 'HMAC' && p.kind === 'wide');
  r.note('palette sample (Razorpay "HMAC" label): ' + sample.map((x) => `${x.scheme} ${x.fg} on ${x.bg} = ${ratio(x.fg, x.bg).toFixed(1)}:1`).join('; '));
  const flipped = pairs.filter((p) => p.text === 'Razorpay' && p.kind === 'wide');
  r.expect(flipped.length === 2 && flipped[0].bg !== flipped[1].bg, 'covers really switch palette with the colour scheme (light-dark())', flipped.map((x) => `${x.scheme}: ${x.fg} on ${x.bg}`).join(' | '));
  await context.close();
  return [r.finish()];
}

module.exports = { ids: [17], run };
