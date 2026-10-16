/*
 * Renders one project cover as two self-contained inline SVGs:
 *   - a wide layout (viewBox 1200x630), shown by default and used for the social image
 *   - a compact layout (viewBox 640x600) with larger labels, shown instead when the cover's container
 *     is narrower than 560px (CSS container query; the wrapper needs container-type:inline-size)
 *
 *  Both: role="img" with <title> and <desc>, no external fonts or assets, one accent colour per project.
 *  Colours come from CSS custom properties (--cv-*). The light palette is the default and light-dark()
 *  switches to the dark palette when the surrounding page uses a dark colour scheme.
 */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const WIDE = { w: 1200, h: 630 };
const NARROW = { w: 640, h: 604 };
const NODE = { w: 180, h: 108, gap: 43, x0: 64, y: 372 };
const NN = { w: 168, h: 72, gap: 34, x0: 40, y1: 414, y2: 508 };

function css(p, kind) {
  const c = p.colors;
  const cls = `cv-${p.slug}`;
  const k = `.${cls}.cv-${kind}`;
  const common = `
:where(.cv){font-family:Inter,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;--cv-bg:#f5f9fc;--cv-card:#fff;--cv-line:#9fb4c7;--cv-fg:#314259;--cv-mute:#5f6b79;--cv-on:#fff}
:where(.${cls}){--cv-accent:${c.accent};--cv-soft:${c.soft}}
@supports (color:light-dark(#000,#fff)){:where(.cv){--cv-bg:light-dark(#f5f9fc,#0f1b2d);--cv-card:light-dark(#fff,#17263b);--cv-line:light-dark(#9fb4c7,#5a7596);--cv-fg:light-dark(#314259,#e8eef5);--cv-mute:light-dark(#5f6b79,#a9b8c9);--cv-on:light-dark(#fff,#0f1b2d)}:where(.${cls}){--cv-accent:light-dark(${c.accent},${c.accentDark});--cv-soft:light-dark(${c.soft},${c.softDark})}}
${k}{display:block;width:100%;height:auto}
${k} .bg{fill:var(--cv-bg)}${k} .stripe{fill:var(--cv-accent)}${k} .panel{fill:var(--cv-card);stroke:var(--cv-line);stroke-width:2}
${k} .node{fill:var(--cv-card);stroke:var(--cv-line);stroke-width:2}${k} .hot{fill:var(--cv-soft);stroke:var(--cv-accent);stroke-width:3}
${k} .badge{fill:var(--cv-accent)}${k} .arrow{stroke:var(--cv-accent);stroke-width:3;fill:none}${k} .head{fill:var(--cv-accent)}
${k} text{fill:var(--cv-fg);font-weight:600}
${k} .mute{fill:var(--cv-mute);font-weight:500}${k} .num{fill:var(--cv-on);font-size:18px;font-weight:800}`;
  if (kind === 'wide') {
    return (common + `
${k} .eyebrow{fill:var(--cv-accent);font-size:24px;font-weight:700;letter-spacing:2.4px}
${k} .title{font-size:58px;font-weight:800}${k} .count{fill:var(--cv-accent);font-size:150px;font-weight:800}
${k} .countl{font-size:32px}${k} .sub{font-size:26px}${k} .stack{font-size:28px}${k} .cap{font-size:26px}${k} .dom{font-size:22px}
${k} .nl{font-size:32px;font-weight:700}${k} .ns{font-size:21px}
@container (max-width:559px){${k}{display:none}}`).trim();
  }
  return (common + `
${k} .title{font-size:54px;font-weight:800}${k} .count{fill:var(--cv-accent);font-size:100px;font-weight:800}
${k} .countl{font-size:32px}${k} .sub{font-size:24px}${k} .stack{font-size:22px}${k} .nl{font-size:30px;font-weight:700}
${k}{display:none}
@container (max-width:559px){${k}{display:block}}`).trim();
}

function defs(id, kind) {
  return `<defs><marker id="${id}-${kind}-a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto"><path class="head" d="M0 0L10 5L0 10z"/></marker></defs>`;
}

function head(p, kind, size, standalone) {
  const id = `cv-${p.slug}`;
  const title = `${p.name}: project cover`;
  const desc = `Cover for ${p.name}: ${p.count} test definitions (${p.countSub}). ${p.desc} Built with ${p.stack.replace(/ · /g, ', ')}.`;
  const dims = standalone ? ` width="${size.w}" height="${size.h}"` : '';
  return `<svg class="cv cv-${p.slug} cv-${kind}" viewBox="0 0 ${size.w} ${size.h}"${dims} role="img" aria-labelledby="${id}-${kind}-t ${id}-${kind}-d" xmlns="http://www.w3.org/2000/svg" focusable="false">` +
    `<title id="${id}-${kind}-t">${esc(title)}</title><desc id="${id}-${kind}-d">${esc(desc)}</desc>` +
    `<style>${css(p, kind)}</style>` + defs(id, kind);
}

function renderWide(p, opts = {}) {
  const id = `cv-${p.slug}`;
  const o = [head(p, 'wide', WIDE, opts.standalone)];
  o.push(`<rect class="bg" width="${WIDE.w}" height="${WIDE.h}"/><rect class="stripe" width="16" height="${WIDE.h}"/>`);
  o.push(`<text class="eyebrow" x="64" y="76">${esc(p.eyebrow)}</text>`);
  p.title.forEach((t, i) => o.push(`<text class="title" x="64" y="${150 + i * 64}">${esc(t)}</text>`));
  o.push(`<text class="stack mute" x="64" y="${150 + (p.title.length - 1) * 64 + 56}">${esc(p.stack)}</text>`);
  o.push(`<text class="count" x="1136" y="200" text-anchor="end">${p.count}</text>`);
  o.push(`<text class="countl" x="1136" y="246" text-anchor="end">test definitions</text>`);
  o.push(`<text class="sub mute" x="1136" y="286" text-anchor="end">${esc(p.countSub)}</text>`);
  o.push(`<rect class="panel" x="40" y="348" width="1120" height="206" rx="20"/>`);
  p.flow.forEach(([label, sec, hot], i) => {
    const x = NODE.x0 + i * (NODE.w + NODE.gap), cx = x + NODE.w / 2;
    o.push(`<rect class="node${hot ? ' hot' : ''}" x="${x}" y="${NODE.y}" width="${NODE.w}" height="${NODE.h}" rx="12"/>`);
    o.push(`<circle class="badge" cx="${x + 24}" cy="${NODE.y + 24}" r="14"/><text class="num" x="${x + 24}" y="${NODE.y + 24}" text-anchor="middle" dominant-baseline="central">${i + 1}</text>`);
    o.push(`<text class="nl" x="${cx}" y="${NODE.y + 70}" text-anchor="middle">${esc(label)}</text>`);
    o.push(`<text class="ns mute" x="${cx}" y="${NODE.y + 96}" text-anchor="middle">${esc(sec)}</text>`);
    if (i < p.flow.length - 1) o.push(`<path class="arrow" d="M${x + NODE.w + 6} ${NODE.y + 54}H${x + NODE.w + NODE.gap - 10}" marker-end="url(#${id}-wide-a)"/>`);
  });
  o.push(`<text class="cap mute" x="64" y="528">${esc(p.caption)}</text>`);
  o.push(`<text class="dom mute" x="1136" y="598" text-anchor="end">sayedasif.com</text></svg>`);
  return o.join('');
}

function renderNarrow(p, opts = {}) {
  const id = `cv-${p.slug}`;
  const o = [head(p, 'narrow', NARROW, opts.standalone)];
  o.push(`<rect class="bg" width="${NARROW.w}" height="${NARROW.h}"/><rect class="stripe" width="14" height="${NARROW.h}"/>`);
  p.title.forEach((t, i) => o.push(`<text class="title" x="40" y="${88 + i * 58}">${esc(t)}</text>`));
  const countY = 304;
  const digits = String(p.count).length;
  o.push(`<text class="count" x="40" y="${countY}">${p.count}</text>`);
  o.push(`<text class="countl" x="${40 + digits * 58 + 18}" y="${countY}">test definitions</text>`);
  o.push(`<text class="sub mute" x="40" y="${countY + 40}">${esc(p.countSub)}</text>`);
  o.push(`<text class="stack mute" x="40" y="${countY + 80}">${esc(p.stack)}</text>`);
  const pos = (i) => (i < 3 ? { x: NN.x0 + i * (NN.w + NN.gap), y: NN.y1 } : { x: NN.x0 + (i - 3) * (NN.w + NN.gap), y: NN.y2 });
  p.flow.forEach(([label, , hot], i) => {
    const { x, y } = pos(i);
    o.push(`<rect class="node${hot ? ' hot' : ''}" x="${x}" y="${y}" width="${NN.w}" height="${NN.h}" rx="12"/>`);
    o.push(`<text class="nl" x="${x + NN.w / 2}" y="${y + 47}" text-anchor="middle">${esc(label)}</text>`);
    if (i !== 2 && i !== 4) o.push(`<path class="arrow" d="M${x + NN.w + 3} ${y + NN.h / 2}H${x + NN.w + NN.gap - 4}" marker-end="url(#${id}-narrow-a)"/>`);
  });
  // elbow from node 3 (end of row 1) to node 4 (start of row 2)
  const n3 = pos(2), n4 = pos(3);
  o.push(`<path class="arrow" d="M${n3.x + NN.w / 2} ${n3.y + NN.h + 2}V${NN.y1 + NN.h + 12}H${n4.x + NN.w / 2}V${n4.y - 2}" marker-end="url(#${id}-narrow-a)"/></svg>`);
  return o.join('');
}

function render(p, opts = {}) {
  return renderWide(p, opts) + renderNarrow(p, opts);
}

module.exports = { render, renderWide, renderNarrow, WIDE, NARROW };
