'use strict';
/*
 * 13. The floating WhatsApp button.
 *   - present once on every page, no number in its markup, plain link to /contact/ without JavaScript
 *   - 44px+ tap target, fixed bottom-right, accessible name, visible focus ring, keyboard operable, contrast, z-order, reduced motion
 *   - click opens https://wa.me/<number>?text=<message> in a new tab (intercepted, never sent), the page stays where it is;
 *     if the popup is blocked the same URL opens in the current tab
 *   - never visibly overlaps footer text, form controls or the open mobile menu, at 1280px and 390px, at every scroll position sampled
 */
const fs = require('fs');
const path = require('path');
const { result } = require('../lib/report');
const { ratio, parse, over } = require('../lib/contrast');
const { readText } = require('../lib/site');

// ---- runs inside the page ------------------------------------------------------------------------------------------
function scan() {
  const btn = document.querySelector('[data-whatsapp]');
  const b = btn.getBoundingClientRect();
  const cs = getComputedStyle(btn);
  const visible = cs.visibility === 'visible' && Number(cs.opacity) > 0.5 && b.width > 0;
  const rects = [];
  const add = (label, r) => { if (r.width > 0.5 && r.height > 0.5) rects.push({ label, left: r.left, right: r.right, top: r.top, bottom: r.bottom }); };
  // text in the footer, measured per text node
  const walker = document.createTreeWalker(document.querySelector('footer.site-footer'), NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (!n.nodeValue.trim() || n.parentElement.closest('[data-whatsapp]')) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) add('footer text "' + n.nodeValue.trim().slice(0, 24) + '"', r);
  }
  document.querySelectorAll('footer.site-footer a:not([data-whatsapp]) i, footer.site-footer .social-icon').forEach((e) => add('footer icon', e.getBoundingClientRect()));
  document.querySelectorAll('form button, form [type=submit]').forEach((e) => add('form button ' + (e.textContent.trim().slice(0, 20) || e.type), e.getBoundingClientRect()));
  document.querySelectorAll('.nav-links a, #menuButton, header .logo').forEach((e) => add('nav ' + (e.textContent.trim().slice(0, 16) || e.id), e.getBoundingClientRect()));
  const hits = rects.filter((r) => r.left < b.right - 1 && r.right > b.left + 1 && r.top < b.bottom - 1 && r.bottom > b.top + 1).map((r) => r.label);
  return { visible, hits, box: { left: b.left, top: b.top, right: b.right, bottom: b.bottom }, scrollY: Math.round(scrollY), max: document.documentElement.scrollHeight - innerHeight };
}

const settle = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(res, 230))));
// ------------------------------------------------------------------------------------------------------------------------

async function run(ctx) {
  const { expected: ex, baseUrl, browser, pages } = ctx;
  const r = result(13, 'WhatsApp button: every page, no number in markup, click URL/text, 44px, no overlap at 1280/390');
  const URL_PREFIX = ex.whatsapp.urlPrefix;
  const MESSAGE = ex.whatsapp.message;
  const PHONE_DIGITS = ex.phone.digits;

  // ------------------------------------------------------------------ A. static markup on every page
  const bad = [];
  for (const p of pages) {
    const html = readText(p.file);
    const links = html.match(/<a\b[^>]*data-whatsapp[^>]*>[\s\S]*?<\/a>/g) || [];
    if (links.length !== 1) { bad.push(`${p.url}: ${links.length} buttons`); continue; }
    const el = links[0];
    if (!/href="\/contact\/"/.test(el)) bad.push(`${p.url}: href is not /contact/`);
    if (!/aria-label="Chat on WhatsApp"/.test(el)) bad.push(`${p.url}: no aria-label`);
    if (!/<svg[^>]*aria-hidden="true"/.test(el)) bad.push(`${p.url}: icon not aria-hidden`);
    if (new RegExp(PHONE_DIGITS.split('').join('[\\s\\-.()]*')).test(el) || /wa\.me|tel:/.test(el)) bad.push(`${p.url}: number or wa.me in the button markup`);
    if (!/<script src="\/assets\/js\/contact-actions\.js" defer><\/script>/.test(html)) bad.push(`${p.url}: contact-actions.js not loaded`);
  }
  r.expect(bad.length === 0, `exactly one button on each of ${pages.length} pages; href=/contact/, aria-label, aria-hidden icon, no number/wa.me in its markup, script loaded`, bad.join(' | ') || `${pages.length} pages`);
  r.note('There is no 404.html in this project (Vercel serves its own), so there is no custom 404 page to add the button to.');

  const VIEWPORTS = [{ name: '1280px', width: 1280, height: 800 }, { name: '390px', width: 390, height: 844 }];

  const phase = (name) => !process.env.WA_PHASES || process.env.WA_PHASES.split(',').includes(name);

  // one page: geometry, styling and the overlap invariant at many scroll positions
  async function inspectPage(context, vp, p) {
    const page = await context.newPage();
    const out = { geometry: null, problems: [], samples: 0, yielded: 0, note: null };
    await page.goto(baseUrl + p.url, { waitUntil: 'load' });
    await page.waitForTimeout(600); // entrance animation

    const info = await page.evaluate(() => {
      const btn = document.querySelector('[data-whatsapp]');
      const b = btn.getBoundingClientRect();
      const cs = getComputedStyle(btn);
      const nav = document.querySelector('header.site-header nav');
      return {
        w: b.width, h: b.height, right: innerWidth - b.right, bottom: innerHeight - b.bottom, position: cs.position,
        bg: cs.backgroundColor, fg: cs.color, z: Number(cs.zIndex), navZ: Number(getComputedStyle(nav).zIndex), tag: btn.tagName,
      };
    });
    const g = [];
    if (info.w < 44 || info.h < 44) g.push(`size ${info.w}x${info.h}`);
    if (info.position !== 'fixed') g.push('not fixed');
    if (info.right < 12 || info.right > 40 || info.bottom < 12 || info.bottom > 40) g.push(`inset right ${info.right} bottom ${info.bottom}`);
    if (!(info.z < info.navZ)) g.push(`z-index ${info.z} not below header ${info.navZ}`);
    const iconRatio = ratio(info.fg, info.bg);
    const bgRatio = ratio(info.bg, 'rgb(255, 255, 255)');
    if (iconRatio < 3) g.push(`icon contrast ${iconRatio.toFixed(2)}`);
    if (bgRatio < 3) g.push(`circle vs white ${bgRatio.toFixed(2)}`);
    if (info.tag !== 'A') g.push('not a link');
    out.geometry = g.length ? `${p.url}: ${g.join(', ')}` : null;
    out.note = `${info.w}x${info.h}px, ${info.right}px from the right and ${info.bottom}px from the bottom, z-index ${info.z} (header ${info.navZ}), white icon on ${info.bg} = ${iconRatio.toFixed(2)}:1, circle on white = ${bgRatio.toFixed(2)}:1`;

    const record = (s, label) => {
      out.samples++;
      if (!s.visible) out.yielded++;
      if (s.visible && s.hits.length) out.problems.push(`${p.url} y=${s.scrollY}${label}: ${s.hits.slice(0, 2).join(', ')}`);
    };
    // every form control, near the bottom, middle and top of the viewport
    const controls = await page.$$('form button, form [type=submit]');
    for (const el of controls) {
      for (const block of ['end', 'center', 'start']) {
        await el.evaluate((e, b) => e.scrollIntoView({ block: b, behavior: 'instant' }), block);
        await page.evaluate(settle);
        record(await page.evaluate(scan), ` (form control, block ${block})`);
      }
    }
    // the whole page, top to bottom
    const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const step = vp.width < 600 ? 300 : 360;
    const ys = new Set([0, total]);
    for (let y = 0; y < total; y += step) ys.add(y);
    for (const y of [...ys].sort((a, b) => a - b)) {
      await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y); // 'instant': pages set scroll-behavior: smooth
      await page.evaluate(settle);
      const s = await page.evaluate(scan);
      record(s, '');
      if (Math.abs(s.scrollY - y) > 2) out.problems.push(`${p.url}: asked for scroll position ${y}, page is at ${s.scrollY}`);
      if (y === total && !s.visible) out.problems.push(`${p.url}: button hidden at the end of the page (the footer should leave room for it)`);
      if (y === 0 && !s.visible) out.problems.push(`${p.url}: button hidden at the top of the page`);
    }
    await page.close();
    return out;
  }

  const pool = async (items, size, fn) => {
    const results = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: size }, async () => {
      while (next < items.length) { const i = next++; results[i] = await fn(items[i]); }
    }));
    return results;
  };

  for (const vp of VIEWPORTS) {
    if (!phase('overlap')) break;
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    await context.route('https://wa.me/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>wa.me (mocked)</title>' }));
    const results = await pool(pages, 4, (p) => inspectPage(context, vp, p));
    const geometry = results.map((x) => x.geometry).filter(Boolean);
    const problems = results.flatMap((x) => x.problems);
    const samples = results.reduce((n, x) => n + x.samples, 0);
    const yielded = results.reduce((n, x) => n + x.yielded, 0);
    r.note(`${vp.name}: ${results[0].note}`);
    r.expect(geometry.length === 0, `${vp.name}: 44px+ tap target, fixed bottom-right, contrast >= 3:1, below the header in z-order, link element (${pages.length} pages)`, geometry.join(' | ') || `${pages.length} pages`);
    r.expect(problems.length === 0, `${vp.name}: never visibly overlaps footer text, form controls or nav (${samples} scroll positions; it steps aside in ${yielded})`, problems.slice(0, 4).join(' | ') || `${samples} samples, 0 visible overlaps`);

    // mobile menu open: links are not covered by the button
    if (vp.width < 600) {
      const covered = [];
      await pool(pages, 4, async (p) => {
        const page = await context.newPage();
        await page.goto(baseUrl + p.url, { waitUntil: 'load' });
        await page.click('#menuButton');
        await page.waitForTimeout(350);
        const res = await page.evaluate(() => [...document.querySelectorAll('#navLinks a')].map((a) => {
          const rc = a.getBoundingClientRect();
          const top = document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2);
          return { text: a.textContent.trim(), ok: top === a || a.contains(top), covered: top ? (top.closest('[data-whatsapp]') ? 'whatsapp button' : top.tagName) : 'nothing' };
        }));
        for (const x of res) if (!x.ok) covered.push(`${p.url}: "${x.text}" under ${x.covered}`);
        const s = await page.evaluate(scan);
        if (s.visible && s.hits.length) covered.push(`${p.url}: open menu overlaps visible button: ${s.hits.join(', ')}`);
        await page.close();
      });
      r.expect(covered.length === 0, `390px: with the mobile menu open every link is reachable and the button never sits on one (${pages.length} pages)`, covered.slice(0, 3).join(' | ') || `${pages.length} pages x 7 links`);
    }
    await context.close();
  }

  // ------------------------------------------------------------------ B. behaviour
  for (const vp of VIEWPORTS) {
    if (!phase('behavior')) break;
    const url = '/about/';
    const mock = (c) => c.route('https://wa.me/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>wa.me (mocked)</title>' }));

    // click opens a new tab with the exact URL; the current tab does not move
    let context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    await mock(context);
    let page = await context.newPage();
    await page.goto(baseUrl + url, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const before = context.pages().length;
    const [popup] = await Promise.all([context.waitForEvent('page'), page.click('[data-whatsapp]')]);
    await popup.waitForURL((u) => u.toString().startsWith(URL_PREFIX), { timeout: 5000 }).catch(() => {});
    const opened = popup.url();
    const text = (() => { try { return new URL(opened).searchParams.get('text'); } catch { return null; } })();
    r.expect(opened === URL_PREFIX + encodeURIComponent(MESSAGE), `${vp.name}: click opens exactly ${URL_PREFIX}<encodeURIComponent(message)>`, opened.replace(/%20/g, ' ').slice(0, 110));
    r.expect(text === MESSAGE, `${vp.name}: decoded text equals the agreed message`, text);
    r.expect(page.url() === baseUrl + url && context.pages().length === before + 1, `${vp.name}: current tab stays on the page; exactly one new tab`, `${page.url().replace(baseUrl, '')}, tabs ${before} -> ${context.pages().length}`);
    r.expect(await popup.evaluate(() => window.opener === null), `${vp.name}: new tab has no opener (noopener behaviour kept)`, 'window.opener === null');
    await popup.close();

    // keyboard: Tab to modality, focus, Enter
    await page.keyboard.press('Tab');
    await page.locator('[data-whatsapp]').focus();
    const ring = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector('[data-whatsapp]')); return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), color: cs.outlineColor, offset: parseFloat(cs.outlineOffset), matches: document.querySelector('[data-whatsapp]').matches(':focus-visible') }; });
    r.expect(ring.matches && ring.style !== 'none' && ring.width >= 2 && ratio(ring.color, 'rgb(255,255,255)') >= 3, `${vp.name}: visible focus ring (${ring.width}px ${ring.style}, ${ring.color}, ${ratio(ring.color, 'rgb(255,255,255)').toFixed(1)}:1 on white)`, JSON.stringify(ring));
    const [popup2] = await Promise.all([context.waitForEvent('page'), page.keyboard.press('Enter')]);
    await popup2.waitForURL((u) => u.toString().startsWith(URL_PREFIX), { timeout: 5000 }).catch(() => {});
    r.expect(popup2.url() === URL_PREFIX + encodeURIComponent(MESSAGE), `${vp.name}: Enter on the focused button does the same`, popup2.url().slice(0, 60) + '…');
    await context.close();

    // popup blocked: the same URL opens in the current tab
    context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    await mock(context);
    await context.addInitScript(() => { window.open = () => null; });
    page = await context.newPage();
    await page.goto(baseUrl + url, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    await page.click('[data-whatsapp]');
    await page.waitForURL((u) => u.toString().startsWith(URL_PREFIX), { timeout: 5000 }).catch(() => {});
    r.expect(page.url() === URL_PREFIX + encodeURIComponent(MESSAGE), `${vp.name}: popup blocked (window.open returns null) -> same URL in the current tab`, page.url().slice(0, 60) + '…');
    await context.close();
  }

  // typing in a form: the button steps aside, then comes back
  if (phase('behavior')) {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await page.goto(baseUrl + '/contact/', { waitUntil: 'load' });
      await page.waitForTimeout(600);
      const atTop = await page.evaluate(scan);
      await page.focus('#name');
      await page.evaluate(settle);
      const whileTyping = await page.evaluate(scan);
      await page.evaluate(() => document.activeElement.blur());
      await page.evaluate(settle);
      const after = await page.evaluate(scan);
      r.expect(atTop.visible && !whileTyping.visible && after.visible, `${vp.name}: on /contact/ the button is visible on arrival, steps aside while a form field has focus, and returns afterwards`, `arrival ${atTop.visible}, typing ${whileTyping.visible}, after ${after.visible}`);
      await context.close();
    }
  }

  // no JavaScript: a plain link to /contact/
  if (phase('behavior')) {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(baseUrl + '/about/', { waitUntil: 'load' });
    await page.waitForTimeout(800); // let the entrance animation finish: Playwright cannot judge stability while it runs with scripts disabled
    await page.click('[data-whatsapp]');
    await page.waitForURL('**/contact/', { timeout: 5000 }).catch(() => {});
    r.expect(page.url() === baseUrl + '/contact/', 'without JavaScript the button is a plain link to /contact/', page.url().replace(baseUrl, ''));
    await context.close();
  }

  // reduced motion
  if (phase('behavior')) {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(baseUrl + '/', { waitUntil: 'load' });
    const m = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector('[data-whatsapp]')); return { anim: cs.animationName, trans: cs.transitionDuration }; });
    // the pages also carry a global reduced-motion rule that shortens every transition to 0.01ms (!important), which is what 1e-05s is
    const longest = Math.max(...m.trans.split(',').map((x) => parseFloat(x) * (/ms\s*$/.test(x) ? 0.001 : 1)));
    r.expect(m.anim === 'none' && longest <= 0.001, 'prefers-reduced-motion: no animation, transitions shortened to <= 1ms (effectively none)', JSON.stringify(m));
    await context.close();
  }

  // why the click handler does not pass "noopener" to window.open (evidence in Chromium)
  if (phase('behavior')) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(baseUrl + '/about/', { waitUntil: 'load' });
    const [tab1] = await Promise.all([context.waitForEvent('page'), page.evaluate(() => { window.__noopener = window.open('about:blank', '_blank', 'noopener,noreferrer'); })]);
    const nullWithNoopener = await page.evaluate(() => window.__noopener === null);
    const [tab2] = await Promise.all([context.waitForEvent('page'), page.evaluate(() => { window.__plain = window.open('about:blank', '_blank'); })]);
    const objectWithout = await page.evaluate(() => window.__plain !== null && typeof window.__plain === 'object');
    r.expect(nullWithNoopener && objectWithout, 'design note: window.open(url, "_blank", "noopener,noreferrer") returns null even though the tab opened, so it cannot detect a blocked popup; the script opens without it and clears opener itself',
      `with noopener: tab opened=${!!tab1}, return value null=${nullWithNoopener}; without: tab opened=${!!tab2}, return value object=${objectWithout}`);
    await context.close();
  }
  return [r.finish()];
}

module.exports = { ids: [13], run };
