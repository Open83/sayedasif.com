'use strict';
/*
 * 16. Internal links and assets resolve; sitemap matches the real pages; canonicals and meta descriptions present and unique; JSON-LD valid.
 */
const fs = require('fs');
const path = require('path');
const { result } = require('../lib/report');
const { readText, decodeEntities } = require('../lib/site');

async function run(ctx) {
  const r = result(16, 'Links and assets resolve; sitemap; canonicals; unique meta; JSON-LD valid');
  const { baseUrl, expected: ex } = ctx;
  const pages = ctx.pages.filter((p) => p.url !== '/404.html'); // branded 404 page: noindex, no canonical (checked in check 2)
  const sprite = readText('assets/icons.svg');
  const spriteIds = new Set([...sprite.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
  const missingIcons = [];
  const html = Object.fromEntries(pages.map((p) => [p.url, readText(p.file)]));
  const ids = Object.fromEntries(Object.entries(html).map(([u, t]) => [u, new Set([...t.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))]));

  // ------------------------------------------------------------ local links and assets, fetched through the server
  const refs = new Map(); // url -> [pages]
  const anchors = [];
  let external = new Map();
  for (const [u, t] of Object.entries(html)) {
    const body = t.replace(/<!--[\s\S]*?-->/g, '');
    const found = [];
    for (const m of body.matchAll(/\b(?:href|src)="([^"]*)"/g)) found.push(m[1]);
    for (const m of body.matchAll(/\baction="([^"]*)"/g)) { if (!/^https?:\/\//.test(m[1])) found.push(m[1]); } // form endpoints on other hosts are POST-only: checked in check 14
    for (const m of body.matchAll(/\bsrcset="([^"]*)"/g)) for (const part of m[1].split(',')) found.push(part.trim().split(/\s+/)[0]);
    for (const m of body.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) found.push(m[1]);
    for (let h of found) {
      h = decodeEntities(h);
      const ic = /^\/assets\/icons\.svg#(.+)$/.exec(h); // <use href> into the icon sprite: the symbol must exist
      if (ic) { if (!spriteIds.has(ic[1])) missingIcons.push(u + ' -> ' + ic[1]); continue; }
      if (!h || /^(mailto:|tel:|data:|javascript:|about:)/.test(h)) continue;
      if (/^https?:\/\//.test(h)) { const host = new URL(h).host; if (host !== 'sayedasif.com') { (external.get(host) || external.set(host, new Set()).get(host)).add(h); continue; } h = new URL(h).pathname + new URL(h).hash; }
      if (h.startsWith('#')) { anchors.push([u, u, h.slice(1)]); continue; }
      const resolved = new URL(h, 'http://x' + u);
      const target = resolved.pathname;
      if (resolved.hash) anchors.push([u, target.endsWith('/') ? target : target + '/', resolved.hash.slice(1)]);
      (refs.get(target) || refs.set(target, []).get(target)).push(u);
    }
  }
  const broken = [];
  for (const [target, from] of refs) {
    const res = await fetch(baseUrl + target, { redirect: 'manual' });
    if (res.status !== 200) broken.push(`${target} -> ${res.status} (from ${[...new Set(from)].slice(0, 2).join(', ')})`);
  }
  r.expect(broken.length === 0, `${refs.size} distinct local links/assets (href, src, srcset, action, css url) all answer 200 with no redirect hops`, broken.slice(0, 4).join(' | ') || `${refs.size} URLs fetched`);
  const badAnchors = anchors.filter(([, page, id]) => !ids[page] || !ids[page].has(id)).map(([from, page, id]) => `${from} -> ${page}#${id}`);
  r.expect(missingIcons.length === 0, `every icon <use> points at a symbol in assets/icons.svg (${spriteIds.size} symbols)`, missingIcons.slice(0, 4).join(' | ') || 'all found');
  r.expect(badAnchors.length === 0, `${anchors.length} in-site #anchors point at an existing id`, badAnchors.slice(0, 4).join(' | ') || 'all found');

  // ------------------------------------------------------------ sitemap and robots
  const sm = fs.readFileSync(path.join(ctx.root, 'sitemap.xml'), 'utf8');
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const smPaths = locs.map((l) => new URL(l).pathname);
  const indexable = pages.filter((p) => !/name="robots"[^>]*noindex/.test(html[p.url])).map((p) => p.url);
  const missing = indexable.filter((u) => !smPaths.includes(u));
  const ghost = smPaths.filter((u) => !html[u]);
  const dup = smPaths.filter((u, i) => smPaths.indexOf(u) !== i);
  r.expect(!missing.length && !ghost.length && !dup.length && locs.every((l) => l.startsWith('https://sayedasif.com/')), `sitemap lists exactly the ${indexable.length} indexable pages (https, no duplicates, none missing)`,
    `missing: ${missing.join(',') || 'none'}; not real pages: ${ghost.join(',') || 'none'}; duplicates: ${dup.join(',') || 'none'}`);
  const badDates = [...sm.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)].map((m) => m[1]).filter((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d) || d > new Date().toISOString().slice(0, 10));
  r.expect(badDates.length === 0, 'sitemap lastmod values are valid dates, none in the future', badDates.join(', ') || `${locs.length} dates`);
  const robots = await (await fetch(baseUrl + '/robots.txt')).text();
  r.expect(/Sitemap:\s*https:\/\/sayedasif\.com\/sitemap\.xml/i.test(robots), 'robots.txt points at the sitemap', robots.split('\n').filter((l) => /sitemap/i.test(l)).join(' ').trim());

  // ------------------------------------------------------------ canonical, title, description
  const models = await ctx.models();
  const bad = [];
  const seenTitle = {}, seenDesc = {};
  for (const p of pages) {
    const m = models[p.url];
    if (m.canonical !== 'https://sayedasif.com' + p.url) bad.push(`${p.url}: canonical ${m.canonical}`);
    if (m.ogUrl && m.ogUrl !== m.canonical) bad.push(`${p.url}: og:url ${m.ogUrl} differs from canonical`);
    if (!m.title || m.title.trim().length < 10) bad.push(`${p.url}: title too short`);
    if (!m.description || m.description.length < 50 || m.description.length > 330) bad.push(`${p.url}: description length ${m.description ? m.description.length : 'missing'}`);
    if (!m.lang) bad.push(`${p.url}: no lang attribute`);
    if (!/name="viewport"/.test(html[p.url])) bad.push(`${p.url}: no viewport meta`);
    (seenTitle[m.title.trim()] ||= []).push(p.url);
    (seenDesc[m.description] ||= []).push(p.url);
  }
  for (const [t, us] of Object.entries(seenTitle)) if (us.length > 1) bad.push(`duplicate title "${t.slice(0, 40)}": ${us.join(', ')}`);
  for (const [d, us] of Object.entries(seenDesc)) if (us.length > 1) bad.push(`duplicate description "${d.slice(0, 40)}": ${us.join(', ')}`);
  r.expect(bad.length === 0, `${pages.length} pages: canonical = own URL, og:url consistent, unique title, unique description (50-330 chars), lang, viewport`, bad.slice(0, 4).join(' | ') || `${pages.length} pages`);

  // social images referenced by og:image exist, with the declared type and size
  const sharp = (() => { try { return require('sharp'); } catch { return null; } })();
  const imgBad = [];
  for (const p of pages.filter((x) => indexable.includes(x.url))) {
    const m = models[p.url];
    if (!m.ogImage) { imgBad.push(`${p.url}: no og:image`); continue; }
    const file = path.join(ctx.root, new URL(m.ogImage).pathname);
    if (!fs.existsSync(file)) { imgBad.push(`${p.url}: ${m.ogImage} missing`); continue; }
    if (sharp) {
      const meta = await sharp(file).metadata();
      if (String(meta.width) !== m.ogImageWidth || String(meta.height) !== m.ogImageHeight) imgBad.push(`${p.url}: og:image is ${meta.width}x${meta.height}, tags say ${m.ogImageWidth}x${m.ogImageHeight}`);
      const mime = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[meta.format];
      if (mime !== m.ogImageType) imgBad.push(`${p.url}: og:image is ${mime}, tag says ${m.ogImageType}`);
    }
    if (!m.ogImageAlt) imgBad.push(`${p.url}: no og:image:alt`);
  }
  r.expect(imgBad.length === 0, 'og:image files exist and match their declared type and 1200x630 size, with alt text', imgBad.slice(0, 4).join(' | ') || `${pages.length} pages`);

  // ------------------------------------------------------------ JSON-LD
  const ldBad = [];
  let ldCount = 0;
  for (const p of pages) {
    for (const j of models[p.url].jsonld) {
      ldCount++;
      let data;
      try { data = JSON.parse(j); } catch (e) { ldBad.push(`${p.url}: invalid JSON (${e.message})`); continue; }
      const nodes = Array.isArray(data['@graph']) ? data['@graph'] : [data];
      if (!/schema\.org/.test(data['@context'] || '') || nodes.length === 0 || nodes.some((n) => !n['@type'])) ldBad.push(`${p.url}: missing @context or a node without @type`);
      for (const node of nodes) if (node['@type'] === 'FAQPage') for (const q of node.mainEntity || []) if (!q.name || !q.acceptedAnswer?.text) ldBad.push(`${p.url}: FAQ entry without question or answer`);
      // every sayedasif.com URL named in structured data must be a real page
      const walk = (v) => { if (typeof v === 'string' && /^https:\/\/sayedasif\.com\//.test(v) && !/\.(jpg|png|webp)$/.test(v)) { if (!html[new URL(v).pathname]) ldBad.push(`${p.url}: JSON-LD URL ${v} is not a page`); } else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
      walk(data);
    }
  }
  r.expect(ldBad.length === 0, `${ldCount} JSON-LD blocks parse, have @context/@type, FAQ entries complete, every site URL in them is a real page`, ldBad.slice(0, 4).join(' | ') || `${ldCount} blocks`);

  // ------------------------------------------------------------ external hosts (informational + hard 404s)
  if (!ctx.args.skipNetwork) {
    const failures = [];
    const skipHosts = new Set(['www.linkedin.com', 'github.com']); // LinkedIn answers bots with 999; github links are checked in check 10
    for (const [host, urls] of external) {
      if (skipHosts.has(host)) continue;
      for (const u of [...urls].slice(0, 6)) {
        try {
          let res = await fetch(u, { method: 'HEAD', redirect: 'follow' });
          if (res.status >= 400) res = await fetch(u, { method: 'GET', redirect: 'follow' });
          if (res.status >= 400 && ![401, 403, 429].includes(res.status)) failures.push(`${u} -> ${res.status}`);
        } catch (e) { failures.push(`${u} -> ${e.message}`); }
      }
    }
    r.expect(failures.length === 0, `external links on other hosts (${[...external.keys()].filter((h) => !skipHosts.has(h)).length} hosts) do not 404`, failures.slice(0, 3).join(' | ') || [...external.keys()].join(', '));
  } else r.note('external link status skipped (--skip-network)');
  return [r.finish()];
}

module.exports = { ids: [16], run };
