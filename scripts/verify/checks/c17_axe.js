'use strict';
/*
 * 17. axe-core accessibility: zero violations on every page at 1280px and 390px, in light and dark colour-scheme emulation.
 *     (WCAG 2.0/2.1/2.2 A and AA rules plus axe best practices, plus the experimental Label-in-Name rule 2.5.3.)
 *
 * The site has no dark theme (pages declare color-scheme: light and have no prefers-color-scheme styles). The dark runs
 * therefore prove the pages stay readable when the visitor's system asks for dark; this is reported, not hidden.
 * The project covers DO follow the colour scheme (light-dark()), so their palettes are checked in both schemes below.
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

async function run(ctx) {
  const r = result(17, 'axe: zero violations, every page, 1280px and 390px, light and dark');
  const { baseUrl, browser, pages } = ctx;
  const combos = [];
  for (const scheme of ['light', 'dark']) for (const width of [1280, 390]) combos.push({ scheme, width });

  let runs = 0;
  const failures = [];
  const pixel = { checked: 0, svg: 0, other: [], unjudged: [], failures: [], worst: null };
  const darkDiffers = [];
  for (const combo of combos) {
    // reduced motion: the pages' own prefers-reduced-motion rule jumps every animation to its end state, so contrast is judged on the final look
    const context = await browser.newContext({ viewport: { width: combo.width, height: 900 }, colorScheme: combo.scheme, reducedMotion: 'reduce' });
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
    }
    r.note(`${combo.scheme} ${combo.width}px: ${results.length} pages, violations ${results.reduce((n, x) => n + x.violations.length, 0)}, rules passed (sum) ${results.reduce((n, x) => n + x.passes, 0)}, needs-review items ${[...new Set(results.flatMap((x) => x.incomplete))].join(', ') || 'none'}`);
    await context.close();
  }
  r.expect(failures.length === 0, `zero axe violations across ${runs} page runs (${pages.length} pages x 2 widths x 2 colour schemes; ${TAGS.join(', ')})`, failures.slice(0, 4).join(' | ') || `${runs} runs clean`);

  const pixelBad = [...pixel.failures, ...pixel.unjudged.map((u) => `${u} could not be judged`), ...pixel.other.map((o) => `${o} skipped`)];
  r.expect(pixelBad.length === 0, 'text axe marks "needs review" (gradient, image or overlapping backgrounds; form fields): every one is judged and has sufficient contrast (worst pixel / typed and placeholder text)', pixelBad.length ? pixelBad.slice(0, 4).join(' | ') + (pixelBad.length > 4 ? ` (+${pixelBad.length - 4} more)` : '') : `${pixel.checked} elements judged (light scheme, 1280 and 390px), none unjudged, ${pixel.svg} skipped as SVG cover text (judged by the palette check below); worst ${pixel.worst ? pixel.worst.ratio.toFixed(2) + ':1 on ' + pixel.worst.url + ' ' + pixel.worst.target + ' (' + pixel.worst.width + 'px)' : 'n/a'}`);

  // the sampler must be able to fail: controls with known contrast on a gradient, plain text and gradient-clipped text
  const ctl = await browser.newContext({ viewport: { width: 800, height: 600 } });
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

  const lightBg = new Set(darkDiffers.map((d) => d.bg));
  const schemes = new Set(darkDiffers.map((d) => d.scheme));
  r.note(`dark-scheme emulation: the pages render with background ${[...lightBg].join(' / ')} and computed color-scheme "${[...schemes].join(' / ')}": the site has no dark theme, so dark emulation shows the same light design. It is checked, not themed.`);
  const hasDarkCss = pages.filter((p) => /prefers-color-scheme\s*:\s*dark/.test(readText(p.file))).map((p) => p.url);
  r.note(`pages with their own prefers-color-scheme: dark styles: ${hasDarkCss.join(', ') || 'none'} (the covers carry light-dark() palettes and follow the page colour scheme)`);

  // ---------------------------------------------------------------- cover palettes in both schemes
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0">` + ['light', 'dark'].map((scheme) =>
    `<div data-scheme="${scheme}" style="color-scheme:${scheme}">` + projects.map((p) => `<div class="w" style="width:800px;container-type:inline-size">${render(p)}</div><div class="n" style="width:420px;container-type:inline-size">${render(p)}</div>`).join('') + '</div>').join('');
  const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const page = await context.newPage();
  await page.setContent(html);
  const pairs = await page.evaluate(() => {
    const out = [];
    for (const group of document.querySelectorAll('[data-scheme]')) {
      for (const svg of group.querySelectorAll('svg')) {
        if (getComputedStyle(svg).display === 'none') continue;
        const surfaces = [...svg.querySelectorAll('rect')].map((rc) => ({ el: rc, b: rc.getBBox(), fill: getComputedStyle(rc).fill }));
        for (const t of svg.querySelectorAll('text')) {
          const b = t.getBBox();
          const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
          const under = surfaces.filter((s) => cx >= s.b.x && cx <= s.b.x + s.b.width && cy >= s.b.y && cy <= s.b.y + s.b.height).pop();
          const badge = t.classList.contains('num');
          const circle = badge ? [...svg.querySelectorAll('circle')].find((c) => Math.abs(c.cx.baseVal.value - (b.x + b.width / 2)) < 3 && Math.abs(c.cy.baseVal.value - (b.y + b.height / 2)) < 3) : null;
          out.push({ scheme: group.dataset.scheme, slug: svg.getAttribute('class').split(' ')[1], kind: svg.getAttribute('class').includes('narrow') ? 'narrow' : 'wide', text: t.textContent.trim(), fg: getComputedStyle(t).fill, bg: circle ? getComputedStyle(circle).fill : under ? under.fill : null, size: parseFloat(getComputedStyle(t).fontSize) });
        }
        const arrows = [...svg.querySelectorAll('.arrow')].map((a) => getComputedStyle(a).stroke);
        const card = getComputedStyle(svg.querySelector('.panel, .node')).fill;
        out.push({ scheme: group.dataset.scheme, slug: svg.getAttribute('class').split(' ')[1], kind: 'graphic', text: 'arrow', fg: arrows[0], bg: card, size: 99 });
      }
    }
    return out;
  });
  const low = [];
  for (const p of pairs) {
    if (!p.bg || p.bg === 'none') { low.push(`${p.scheme} ${p.slug} "${p.text}": no surface found`); continue; }
    const c = ratio(p.fg, p.bg);
    const need = p.kind === 'graphic' ? 3 : 4.5;
    if (c < need) low.push(`${p.scheme} ${p.slug} ${p.kind} "${p.text}": ${c.toFixed(2)}:1 < ${need}`);
  }
  const slugs = [...new Set(pairs.map((p) => p.slug))];
  r.expect(low.length === 0, `project covers: every text and arrow meets contrast (>= 4.5:1 text, >= 3:1 arrows) in the light AND dark palettes (${pairs.length} pairs, ${slugs.length} covers, wide and phone layouts)`, low.slice(0, 4).join(' | ') || 'all pairs pass');
  const sample = pairs.filter((p) => p.slug === 'cv-razorpay' && p.text === 'HMAC' && p.kind === 'wide');
  r.note('palette sample (Razorpay "HMAC" label): ' + sample.map((s) => `${s.scheme} ${s.fg} on ${s.bg} = ${ratio(s.fg, s.bg).toFixed(1)}:1`).join('; '));
  const flipped = pairs.filter((p) => p.text === 'Razorpay' && p.kind === 'wide');
  r.expect(flipped.length === 2 && flipped[0].bg !== flipped[1].bg, 'covers really switch palette with the colour scheme (light-dark())', flipped.map((f) => `${f.scheme}: ${f.fg} on ${f.bg}`).join(' | '));
  await context.close();
  return [r.finish()];
}

module.exports = { ids: [17], run };
