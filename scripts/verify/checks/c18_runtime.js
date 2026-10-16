'use strict';
/*
 * 18. Runtime behaviour in a real browser, on every page:
 *   - no horizontal scroll at 390px (and at 1280px), also with the mobile menu open; nothing visible is clipped off the right edge
 *   - no console errors or warnings, uncaught exceptions, failed requests or HTTP 4xx/5xx while loading, scrolling the whole page,
 *     opening the mobile menu and using the WhatsApp button
 *   - no two lines of visible text overlap each other (a grid row used twice, a pinned box over a paragraph)
 *   - layout shift: page CLS stays under 0.1 (the "good" threshold), no layout-shift entry is attributed to the WhatsApp button,
 *     and every other element sits at exactly the same place with the button present and with the button removed
 */
const { result } = require('../lib/report');
const { pool } = require('../lib/pool');

// layout-shift observer, installed before any page script runs
const INIT = `
  window.__cls = { total: 0, entries: [] };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__cls.total += e.value;
        window.__cls.entries.push({ value: e.value, sources: (e.sources || []).map((s) => {
          const n = s.node;
          if (!n) return 'removed node';
          const el = n.nodeType === 1 ? n : n.parentElement;
          if (!el) return 'text';
          if (el.closest && el.closest('[data-whatsapp]')) return 'WHATSAPP';
          return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '');
        }) });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (e) { window.__clsError = String(e); }
`;

// ---- run inside the page -----------------------------------------------------------------------------------------------
function horizontal() {
  const de = document.documentElement;
  scrollTo(300, 0);
  const moved = scrollX;
  scrollTo(0, 0);
  const cw = de.clientWidth;
  const clips = (e) => { for (let n = e; n && n !== document.body && n !== de; n = n.parentElement) if (getComputedStyle(n).overflowX !== 'visible') return true; return false; };
  const cut = [];
  const label = (e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''}`;
  for (const e of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0 || cs.position === 'fixed' || clips(e)) continue;
    if (/^(IMG|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(e.tagName)) {
      const r = e.getBoundingClientRect();
      if (r.width >= 1 && r.right > cw + 1) cut.push(`${label(e)} right=${Math.round(r.right)}`);
    }
    for (const n of e.childNodes) {
      if (n.nodeType !== 3 || !n.nodeValue.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const hit = [...range.getClientRects()].find((r) => r.width >= 1 && r.right > cw + 1);
      if (hit) cut.push(`${label(e)} "${n.nodeValue.trim().slice(0, 24)}" right=${Math.round(hit.right)}`);
    }
  }
  return { scrollWidth: de.scrollWidth, bodyScrollWidth: document.body.scrollWidth, clientWidth: cw, innerWidth, moved, cut: cut.slice(0, 4), cutCount: cut.length };
}

// two lines of text drawn on top of each other: boxes from different text runs that share more than 30% of the smaller one.
// Text that is clipped away (visually-hidden labels, collapsed accordion answers) is not visible, so it is left out.
function textOverlaps() {
  const items = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const clippers = new Map();
  const clipChain = (el) => {
    if (!clippers.has(el)) {
      const own = getComputedStyle(el);
      const up = el.parentElement && el.parentElement !== document.body ? clipChain(el.parentElement) : [];
      clippers.set(el, own.overflowX !== 'visible' || own.overflowY !== 'visible' ? [el, ...up] : up);
    }
    return clippers.get(el);
  };
  const pinned = (el) => { for (let n = el; n && n !== document.body; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest('svg, script, style, noscript, [aria-hidden="true"]') || pinned(el)) continue;
    if (el.closest('details:not([open]) > :not(summary)')) continue; // answers of a closed accordion: not drawn, geometry is hypothetical
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      if (r.width < 4 || r.height < 4) continue;
      let vx0 = r.left, vy0 = r.top, vx1 = r.right, vy1 = r.bottom;
      for (const c of clipChain(el)) { const b = c.getBoundingClientRect(); vx0 = Math.max(vx0, b.left); vy0 = Math.max(vy0, b.top); vx1 = Math.min(vx1, b.right); vy1 = Math.min(vy1, b.bottom); }
      if (Math.max(0, vx1 - vx0) * Math.max(0, vy1 - vy0) < 0.5 * r.width * r.height) continue; // mostly clipped away
      items.push({ el, x0: r.left + scrollX, x1: r.right + scrollX, y0: r.top + scrollY, y1: r.bottom + scrollY, text: n.nodeValue.trim().slice(0, 26) });
    }
  }
  items.sort((a, b) => a.y0 - b.y0);
  const hits = [];
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    for (let j = i + 1; j < items.length && items[j].y0 < a.y1; j++) {
      const b = items[j];
      const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ix <= 0 || iy <= 0) continue;
      const small = Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0));
      if ((ix * iy) / small > 0.3) hits.push(`"${a.text}" over "${b.text}" at y=${Math.round(a.y0)}`);
    }
  }
  return { runs: items.length, hits: hits.slice(0, 4), count: hits.length };
}

function layoutWithAndWithoutButton() {
  const rects = () => [...document.querySelectorAll('body *')].filter((e) => !e.closest('[data-whatsapp]')).map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y + scrollY, r.width, r.height].map((v) => Math.round(v * 10)).join(':'); });
  const btn = document.querySelector('[data-whatsapp]');
  const a = rects();
  const h1 = document.documentElement.scrollHeight;
  btn.style.setProperty('display', 'none', 'important');
  const b = rects();
  const h2 = document.documentElement.scrollHeight;
  btn.style.removeProperty('display');
  let moved = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) moved++;
  return { elements: a.length, moved, h1, h2 };
}

async function scrollThrough() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let y = 0; y < document.documentElement.scrollHeight; y += Math.round(innerHeight * 0.7)) { scrollTo({ top: y, behavior: 'instant' }); await wait(80); }
  scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
  await wait(250);
  const bottom = scrollY;
  scrollTo({ top: 0, behavior: 'instant' });
  await wait(250);
  return { bottom, max: document.documentElement.scrollHeight - innerHeight };
}
// ------------------------------------------------------------------------------------------------------------------------

async function inspect(browser, baseUrl, url, width, skipNetwork) {
  const host = new URL(baseUrl).host;
  const isLocal = (u) => { try { return new URL(u).host === host || u.startsWith('data:') || u.startsWith('blob:'); } catch { return true; } };
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.addInitScript(INIT);
  if (skipNetwork) await context.route((u) => !isLocal(u.toString()), (route) => route.abort());
  const page = await context.newPage();
  const problems = [];
  const relevant = (u) => !skipNetwork || isLocal(u);
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && relevant(m.location().url || baseUrl)) problems.push(`console.${m.type()}: ${m.text().slice(0, 140)}`); });
  page.on('pageerror', (e) => problems.push(`uncaught exception: ${String(e.message).slice(0, 140)}`));
  page.on('requestfailed', (rq) => { if (relevant(rq.url())) problems.push(`request failed: ${rq.url().slice(0, 100)} (${rq.failure() && rq.failure().errorText})`); });
  page.on('response', (rs) => { if (rs.status() >= 400 && relevant(rs.url())) problems.push(`HTTP ${rs.status()}: ${rs.url().slice(0, 100)}`); });

  await page.goto(baseUrl + url, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  const scrolled = await page.evaluate(scrollThrough);
  const out = { url, width, problems, scrolled, horizontal: await page.evaluate(horizontal) };
  out.overlap = await page.evaluate(textOverlaps);
  out.clsLoad = await page.evaluate(() => window.__cls.total);

  if (width < 700) {
    const menu = page.locator('#menuButton');
    if (await menu.isVisible()) {
      await menu.click();
      await page.waitForTimeout(400);
      out.menu = { expanded: await menu.getAttribute('aria-expanded'), horizontal: await page.evaluate(horizontal) };
      await menu.click();
      await page.waitForTimeout(300);
    } else out.menu = { expanded: 'no visible menu button' };
  }

  out.layout = await page.evaluate(layoutWithAndWithoutButton);
  await page.evaluate(() => { window.__opened = []; window.open = (...a) => { window.__opened.push(a); return { opener: null }; }; });
  try {
    await page.locator('[data-whatsapp]').click({ timeout: 4000 });
    out.waOpened = await page.evaluate(() => window.__opened.length);
  } catch (e) { out.waOpened = 'click failed: ' + String(e.message).split('\n')[0].slice(0, 100); }
  await page.waitForTimeout(300);
  out.cls = await page.evaluate(() => ({ total: window.__cls.total, entries: window.__cls.entries, error: window.__clsError || null }));
  await context.close();
  return out;
}

// the probes above must be able to fail: synthetic pages with a known defect each
async function selfTest(browser) {
  const pagesHtml = {
    wide: '<body style="margin:0"><div style="width:600px;height:20px;background:#ccc">wide</div>',
    cut: '<body style="margin:0;overflow-x:hidden"><p style="margin:0 0 0 380px">text pushed off the right edge</p>',
    overlap: '<body style="margin:0"><p style="margin:0">first line of text</p><p style="margin:-12px 0 0 20px">second line pulled up over it</p><p style="margin:30px 0 0">a clean line below</p>',
    shift: '<body style="margin:0"><div id="box"><p id="t" style="margin:0">moves</p></div><script>console.error("control error");setTimeout(function(){document.getElementById("box").style.paddingTop="300px"},100)</script>',
  };
  const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
  await context.addInitScript(INIT);
  await context.route('http://selftest.invalid/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: pagesHtml[new URL(route.request().url()).pathname.slice(1)] }));
  const errors = [];
  const open = async (name) => { const page = await context.newPage(); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); await page.goto('http://selftest.invalid/' + name); return page; };
  const w = await (await open('wide')).evaluate(horizontal);
  const c = await (await open('cut')).evaluate(horizontal);
  const ov = await (await open('overlap')).evaluate(textOverlaps);
  const clean = await (await open('wide')).evaluate(textOverlaps);
  const shift = await open('shift');
  await shift.waitForTimeout(600);
  const cls = await shift.evaluate(() => window.__cls);
  await context.close();
  return { wide: w.scrollWidth > w.clientWidth || w.moved > 0, cut: c.cutCount > 0, overlap: ov.count === 1 && clean.count === 0, error: errors.some((e) => /control error/.test(e)), shift: cls.total > 0.01 && cls.entries.some((e) => e.sources.some((x) => x.startsWith('p#t'))), detail: `scrollWidth ${w.scrollWidth}/${w.clientWidth}, cut-off elements ${c.cutCount}, overlapping text pairs ${ov.count} (clean page ${clean.count}), console errors ${errors.length}, CLS ${cls.total.toFixed(3)} from ${JSON.stringify(cls.entries.map((e) => e.sources))}` };
}

async function run(ctx) {
  const r = result(18, 'Runtime: no horizontal scroll, no console errors/warnings, no layout shift from the WhatsApp button');
  const { baseUrl, browser, pages, args } = ctx;
  const jobs = [];
  for (const width of [390, 1280]) for (const p of pages) jobs.push({ url: p.url, width });
  const rows = await pool(jobs, 4, (j) => inspect(browser, baseUrl, j.url, j.width, args.skipNetwork));

  // ------------------------------------------------------------ horizontal scroll
  for (const width of [390, 1280]) {
    const set = rows.filter((x) => x.width === width);
    const bad = [];
    for (const x of set) {
      for (const [label, h] of [['', x.horizontal], [' (menu open)', x.menu && x.menu.horizontal]]) {
        if (!h) continue;
        if (h.scrollWidth > h.clientWidth || h.bodyScrollWidth > h.innerWidth || h.moved > 0) bad.push(`${x.url}${label}: scrollWidth ${h.scrollWidth} > ${h.clientWidth}, scrolled sideways ${h.moved}px`);
        else if (h.cutCount) bad.push(`${x.url}${label}: ${h.cutCount} visible element(s) cut off at the right edge, e.g. ${h.cut[0]}`);
      }
    }
    const widest = Math.max(...set.map((x) => x.horizontal.scrollWidth));
    r.expect(bad.length === 0, `${width}px: no horizontal scroll and nothing visible cut off at the right edge, on all ${set.length} pages${width < 700 ? ', also with the mobile menu open' : ''}`, bad.slice(0, 4).join(' | ') || `widest document ${widest}px in a ${width}px viewport; sideways scroll probe moved 0px on every page`);
  }
  const menus = rows.filter((x) => x.menu);
  r.expect(menus.every((x) => x.menu.expanded === 'true'), 'the mobile menu button really opens the menu on every page at 390px (aria-expanded becomes true)', `${menus.length} pages`);

  const short = rows.filter((x) => x.scrolled.bottom < x.scrolled.max - 2);
  r.expect(short.length === 0, 'the scroll-through really reached the very bottom of every page (pages use scroll-behavior: smooth, so the checks scroll instantly)', short.slice(0, 3).map((x) => `${x.url} @${x.width}: reached ${x.scrolled.bottom} of ${x.scrolled.max}`).join(' | ') || `${rows.length} loads, deepest ${Math.max(...rows.map((x) => x.scrolled.max))}px`);

  const overlapping = rows.filter((x) => x.overlap.count > 0);
  r.expect(overlapping.length === 0, 'no two lines of visible text overlap each other on any page, at 390px or 1280px', overlapping.slice(0, 3).map((x) => `${x.url} @${x.width}: ${x.overlap.count} pair(s), e.g. ${x.overlap.hits[0]}`).join(' | ') || `${rows.reduce((n, x) => n + x.overlap.runs, 0)} text runs compared on ${rows.length} loads`);

  // ------------------------------------------------------------ console, exceptions, requests
  const problems = rows.flatMap((x) => x.problems.map((p) => `${x.url} @${x.width}: ${p}`));
  r.expect(problems.length === 0, `no console errors or warnings, uncaught exceptions, failed requests or HTTP 4xx/5xx on ${rows.length} page loads (load, scroll through the page, open the menu, press the WhatsApp button)${args.skipNetwork ? '; other hosts blocked and ignored (--skip-network)' : ''}`, problems.slice(0, 4).join(' | ') || `${rows.length} loads clean`);
  const waBad = rows.filter((x) => x.waOpened !== 1);
  r.expect(waBad.length === 0, 'pressing the WhatsApp button at the top of every page opens exactly one new window (window.open stubbed, wa.me is never contacted)', waBad.slice(0, 3).map((x) => `${x.url} @${x.width}: ${x.waOpened}`).join(' | ') || `${rows.length} presses`);

  // ------------------------------------------------------------ layout shift
  const noObserver = rows.filter((x) => x.cls.error);
  const worst = rows.reduce((a, x) => (x.cls.total > a.cls.total ? x : a), rows[0]);
  const high = rows.filter((x) => x.cls.total > 0.1);
  r.expect(noObserver.length === 0 && high.length === 0, 'cumulative layout shift is under 0.1 on every page (load, scroll, menu, button)', high.slice(0, 3).map((x) => `${x.url} @${x.width}: ${x.cls.total.toFixed(3)} ${JSON.stringify(x.cls.entries[0] && x.cls.entries[0].sources)}`).join(' | ') || `worst ${worst.cls.total.toFixed(4)} on ${worst.url} @${worst.width}px; sum over ${rows.length} loads ${rows.reduce((s, x) => s + x.cls.total, 0).toFixed(4)}`);
  const waShift = rows.flatMap((x) => x.cls.entries.filter((e) => e.sources.includes('WHATSAPP')).map(() => x.url));
  r.expect(waShift.length === 0, 'no layout-shift entry is attributed to the WhatsApp button', waShift.slice(0, 3).join(', ') || `0 of ${rows.reduce((s, x) => s + x.cls.entries.length, 0)} recorded shifts`);
  const moved = rows.filter((x) => x.layout.moved > 0 || x.layout.h1 !== x.layout.h2);
  r.expect(moved.length === 0, 'the button takes no space: every other element has the same position and size, and the page the same height, with the button present and with it removed', moved.slice(0, 3).map((x) => `${x.url} @${x.width}: ${x.layout.moved} of ${x.layout.elements} moved, height ${x.layout.h1} vs ${x.layout.h2}`).join(' | ') || `${rows.reduce((s, x) => s + x.layout.elements, 0)} element positions compared over ${rows.length} loads, 0 differences`);
  const st = await selfTest(browser);
  r.expect(st.wide && st.cut && st.overlap && st.error && st.shift, 'probe self-test: catches a 600px element in a 390px viewport, text cut off by overflow-x:hidden, two overlapping lines of text, a console.error and a 300px layout shift', st.detail);
  r.note('CLS per page (390px / 1280px): ' + pages.map((p) => { const a = rows.find((x) => x.url === p.url && x.width === 390), b = rows.find((x) => x.url === p.url && x.width === 1280); return `${p.url} ${a.cls.total.toFixed(3)}/${b.cls.total.toFixed(3)}`; }).join(', '));
  return [r.finish()];
}

module.exports = { ids: [18], run };
