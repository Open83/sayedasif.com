'use strict';
/*
 * Contrast for text axe cannot judge ("needs review": text on gradients, images or overlapping decoration, form fields).
 *
 * Text: 1. colour, size and the boxes of every line of text are read for each element axe flagged.
 *       2. ALL text on the page is made transparent (and gradient-clipped text loses its gradient), so a screenshot shows
 *          only what is behind the text. (Hiding just the target is not enough: its line box overlaps neighbouring glyphs.)
 *       3. the pixels inside each line box are compared with the text colour; the worst pixel decides. Gradient-clipped
 *          text is tested with every colour stop of its gradient.
 * Form fields (input, textarea, select): typed-text colour and ::placeholder colour against the field's own background.
 * SVG text is not judged here (the project covers have their own palette check in check 17).
 *
 * Large text (>= 24px, or >= 18.66px bold) needs 3:1, other text 4.5:1.
 */
const sharp = require('sharp');
const { parse, ratio } = require('./contrast');

const HIDE_CHROME = 'html { scroll-behavior: auto !important; } header.site-header, .wa-float, .skip-link { visibility: hidden !important; }';
const HIDE_TEXT = '* { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; } ::placeholder { color: transparent !important; opacity: 1 !important; }';

const isLarge = (size, weight) => size >= 24 || (size >= 18.66 && weight >= 700);
const blend = (fg, bg, a) => [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

// measures the line boxes of an element's own text, in document coordinates
const MEASURE = (e) => {
  const rects = [];
  const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (!n.nodeValue.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.width > 1 && r.height > 1) rects.push({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height });
  }
  return rects;
};

/**
 * @param page    Playwright page (axe has already run on it; the page is left with its text hidden)
 * @param targets CSS selectors axe reported as "incomplete" for color-contrast
 * @returns {{checked:number, skipped:number, skippedBy:Object<string,string[]>, unjudged:string[], failures:string[], worst:{ratio:number,target:string,text:string}|null}}
 */
async function sampleTargets(page, targets) {
  const out = { checked: 0, skipped: 0, skippedBy: {}, unjudged: [], failures: [], worst: null };
  const skip = (reason, target) => { out.skipped++; (out.skippedBy[reason] ||= []).push(target); };
  const list = [...new Set(targets)];
  if (!list.length) return out;

  // 1. read what is needed before anything is hidden; tag the elements so they can be found again.
  // (A classic scrollbar would scale screenshots against the measured boxes; headless Chromium has none, headed has.)
  await page.addStyleTag({ content: 'html { scrollbar-width: none; }' });
  await page.addScriptTag({ content: 'window.__pxMeasure = ' + MEASURE.toString() });
  const infos = await page.evaluate((sels) => sels.map((sel, i) => {
    let e = null;
    try { e = document.querySelector(sel); } catch { /* selector from a frame: not judged here */ }
    if (!e) return { skip: 'unresolved' };
    if (e.closest('svg')) return { skip: 'svg' };
    e.setAttribute('data-pxid', String(i));
    const cs = getComputedStyle(e);
    let opacity = 1;
    for (let n = e; n && n.nodeType === 1; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
    const base = { size: parseFloat(cs.fontSize), weight: parseInt(cs.fontWeight, 10) || 400, opacity, text: (e.textContent || e.getAttribute('placeholder') || e.id || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 28) };
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName)) {
      const layers = [];
      for (let n = e; n && n.nodeType === 1; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        layers.push(c);
        if (/^rgb\(/.test(c)) break; // opaque: nothing behind it matters
      }
      const ph = e.getAttribute('placeholder') ? getComputedStyle(e, '::placeholder') : null;
      return { ...base, control: true, color: cs.color, placeholder: ph ? { color: ph.color, opacity: Number(ph.opacity) } : null, layers, ownImage: cs.backgroundImage !== 'none' };
    }
    const gradientText = /text/.test(cs.webkitBackgroundClip || cs.backgroundClip || '') && /gradient/.test(cs.backgroundImage || '');
    return { ...base, color: cs.color, fill: cs.webkitTextFillColor, bgImage: cs.backgroundImage, gradientText, rects: window.__pxMeasure(e) };
  }), list);

  const state = new Array(list.length).fill(null);
  const items = [];
  infos.forEach((info, ti) => {
    if (info.skip) { skip(info.skip, list[ti]); return; }
    if (info.control) {
      if (info.ownImage) { skip('field with a background image', list[ti]); return; }
      let bg = [255, 255, 255, 1];
      for (const l of [...info.layers].reverse()) { const c = parse(l); bg = blend(c, bg, c[3] ?? 1); }
      const need = isLarge(info.size, info.weight) ? 3 : 4.5;
      const parts = [['typed text', parse(info.color), 1]];
      if (info.placeholder) parts.push(['placeholder', parse(info.placeholder.color), info.placeholder.opacity]);
      let min = Infinity, which = '';
      for (const [name, tc, op] of parts) {
        const fg = blend(tc, bg, (tc[3] ?? 1) * op * info.opacity);
        const c = ratio(fg, bg);
        if (c < min) { min = c; which = `${name} rgb(${fg.slice(0, 3).map(Math.round)}) on rgb(${bg.slice(0, 3).map(Math.round)})`; }
      }
      out.checked++;
      if (!out.worst || min < out.worst.ratio) out.worst = { ratio: min, target: list[ti], text: info.text };
      if (min < need) out.failures.push(`${list[ti]} (form field): ${min.toFixed(2)}:1 < ${need}:1 for ${which}`);
      return;
    }
    if (!info.rects.length) { skip('no text of its own', list[ti]); return; }
    const stops = info.gradientText
      ? [...info.bgImage.matchAll(/rgba?\([^)]*\)/g)].map((m) => parse(m[0]))
      : [parse(info.fill && info.fill !== 'rgba(0, 0, 0, 0)' && info.fill !== info.color ? info.fill : info.color)];
    state[ti] = { stops, need: isLarge(info.size, info.weight) ? 3 : 4.5, min: Infinity, at: null, seen: 0 };
    for (const r of info.rects) items.push({ ti, ...r });
  });
  if (!items.length) return out;

  // 2. hide all text, and any gradient that is painted through text
  await page.addStyleTag({ content: HIDE_CHROME + HIDE_TEXT });
  await page.evaluate(() => {
    for (const n of document.querySelectorAll('*')) {
      const cs = getComputedStyle(n);
      if (/text/.test(cs.webkitBackgroundClip || cs.backgroundClip || '') && /gradient/.test(cs.backgroundImage || '')) n.style.setProperty('background-image', 'none', 'important');
    }
  });
  await frames(page);

  // 3. judge the line boxes from viewport screenshots (one screenshot serves every box visible in it)
  const vp = page.viewportSize();
  const judge = (shot, it, left, top) => {
    const { data, img } = shot;
    const s = state[it.ti], info = infos[it.ti];
    const k = img.width / vp.width;
    const x0 = Math.max(0, Math.floor((it.x - left) * k)), x1 = Math.min(img.width - 1, Math.ceil((it.x - left + it.w) * k));
    const y0 = Math.max(0, Math.floor((it.y - top) * k)), y1 = Math.min(img.height - 1, Math.ceil((it.y - top + it.h) * k));
    let sampled = 0;
    for (let y = y0; y <= y1; y += 2) {
      for (let x = x0; x <= x1; x += 2) {
        const p = (y * img.width + x) * 3;
        const bg = [data[p], data[p + 1], data[p + 2], 1];
        sampled++;
        for (const tc of s.stops) {
          const fg = blend(tc, bg, (tc[3] ?? 1) * info.opacity);
          const c = ratio(fg, bg);
          if (c < s.min) { s.min = c; s.at = { x: Math.round(x / k + left), y: Math.round(y / k + top), bg: bg.slice(0, 3), fg: fg.slice(0, 3).map(Math.round) }; }
        }
      }
    }
    if (sampled) s.seen++;
    return sampled > 0;
  };
  const capture = async () => {
    const buf = await page.screenshot({ animations: 'disabled' });
    const { data, info: img } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, img };
  };
  const leftover = [];
  items.sort((a, b) => a.y - b.y);
  while (items.length) {
    const first = items[0];
    await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, Math.floor(first.y) - 120));
    await frames(page);
    const { sx, sy } = await page.evaluate(() => ({ sx: window.scrollX, sy: window.scrollY }));
    const shot = await capture();
    const visible = (it) => it.y >= sy && it.y + it.h <= sy + vp.height && it.x + it.w > sx + 1 && it.x < sx + vp.width - 1;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it !== first && !visible(it)) continue;
      items.splice(i--, 1);
      if (!visible(it) || !judge(shot, it, sx, sy)) leftover.push(it);
    }
  }
  // boxes that were off screen (inside a horizontally scrolling table or code block): scroll their element into view and measure again
  for (const ti of [...new Set(leftover.map((it) => it.ti))]) {
    const rects = await page.evaluate((id) => {
      const e = document.querySelector(`[data-pxid="${id}"]`);
      e.scrollIntoView({ block: 'center', inline: 'center' });
      return window.__pxMeasure(e);
    }, ti);
    await frames(page);
    const { sx, sy } = await page.evaluate(() => ({ sx: window.scrollX, sy: window.scrollY }));
    const shot = await capture();
    let any = false;
    for (const r of rects) {
      const it = { ti, ...r };
      if (it.y >= sy && it.y + it.h <= sy + vp.height && it.x + it.w > sx + 1 && it.x < sx + vp.width - 1) any = judge(shot, it, sx, sy) || any;
    }
    if (!any) out.unjudged.push(list[ti]);
  }

  state.forEach((s, ti) => {
    if (!s) return;
    if (!s.seen) { if (!out.unjudged.includes(list[ti])) out.unjudged.push(list[ti]); return; }
    out.checked++;
    if (!out.worst || s.min < out.worst.ratio) out.worst = { ratio: s.min, target: list[ti], text: infos[ti].text };
    if (s.min < s.need) out.failures.push(`${list[ti]} "${infos[ti].text}": ${s.min.toFixed(2)}:1 < ${s.need}:1 (${infos[ti].size}px) at ${JSON.stringify(s.at)}`);
  });
  return out;
}

module.exports = { sampleTargets };
