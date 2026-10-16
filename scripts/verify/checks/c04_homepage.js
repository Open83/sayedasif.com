'use strict';
/*
 * 4. Homepage structure: the six intended sections, one stat bar, no duplicated counters.
 * 7. Project order on the homepage and on Proof of Work.
 * 8. Every project card and case-study header uses a different image (hash comparison).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { result } = require('../lib/report');

const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex').slice(0, 10);

async function run(ctx) {
  const { expected: ex, baseUrl, browser } = ctx;
  const out = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // ------------------------------------------------------------------ 4
  const r4 = result(4, 'Homepage: 6 sections, one stat bar, no duplicated counters');
  await page.goto(baseUrl + '/', { waitUntil: 'load' });
  const home = await page.evaluate(() => {
    const secs = [...document.querySelectorAll('main > section')].map((s) => ({
      id: s.id, cls: s.className, h: s.querySelector('h1, h2')?.textContent.replace(/\s+/g, ' ').trim() || '',
    }));
    const statNums = [...document.querySelectorAll('.stat-num')].map((e) => e.textContent.trim());
    const statGrids = document.querySelectorAll('.stats-grid').length;
    // elements whose own text is just a number: counters
    const bare = [...document.querySelectorAll('main *')].filter((e) => !e.closest('svg') && e.children.length === 0 && /^\s*(?:116|4|6|1\+|37|47|26)\s*$/.test(e.textContent)).map((e) => ({ cls: e.getAttribute('class') || '', text: e.textContent.trim() }));
    const counterLike = document.querySelectorAll('[data-count], [data-target], .counter, .count-up, .snapshot-number').length;
    return { secs, statNums, statGrids, bare, counterLike };
  });
  const logical = [];
  for (const s of home.secs) {
    if (s.id === 'home' || /\bstats\b/.test(s.cls)) { if (!logical.length || logical[logical.length - 1] !== 'Hero + stat bar') logical.push('Hero + stat bar'); }
    else logical.push(s.h);
  }
  const wantLogical = ['Hero + stat bar', ...ex.homepage.sectionHeadings];
  r4.expect(JSON.stringify(logical) === JSON.stringify(wantLogical) && logical.length === 6, 'exactly six logical sections in order',
    logical.join(' | '));
  r4.expect(home.secs.length === 7 && home.secs[0].id === 'home' && /stats/.test(home.secs[1].cls), 'hero is followed directly by its stat bar (7 DOM sections = 6 logical)', home.secs.map((s) => s.id || s.cls.split(' ')[0]).join(', '));
  r4.expect(home.statGrids === 1, 'one stat bar', `${home.statGrids} .stats-grid`);
  r4.expect(JSON.stringify(home.statNums) === JSON.stringify(ex.homepage.statNumbers), 'stat bar shows 1+, 6, 4, 116 once each', home.statNums.join(', '));
  const dupBare = home.bare.filter((b) => !/stat-num/.test(b.cls));
  r4.expect(dupBare.length === 0, 'no second counter elsewhere on the page (bare numbers outside the stat bar)', dupBare.length ? JSON.stringify(dupBare) : 'none');
  r4.expect(home.counterLike === 0, 'no counter widgets', `${home.counterLike} counter-like elements`);
  out.push(r4.finish());

  // ------------------------------------------------------------------ 7
  const r7 = result(7, 'Project order: Razorpay, RESTful Booker, ERPNext, Automation Exercise');
  const order = async (url, sel) => { await page.goto(baseUrl + url, { waitUntil: 'load' }); return page.$$eval(sel, (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim())); };
  const match = (titles) => ex.projectOrder.map((p) => titles.findIndex((t) => t.includes(p)));
  const homeTitles = await order('/', '#projects .featured-card h3');
  const powTitles = await order('/proof-of-work/', '.project-grid .project-title');
  for (const [label, titles] of [['homepage', homeTitles], ['Proof of Work', powTitles]]) {
    const idx = match(titles);
    r7.expect(titles.length === 4 && idx.join() === '0,1,2,3', `${label} order`, titles.join(' > '));
  }
  out.push(r7.finish());

  // ------------------------------------------------------------------ 8
  const r8 = result(8, 'Every project card and case-study header uses a different image');
  const grab = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].map((c) => ({ title: (c.closest('article, .project-card, section')?.querySelector('h3, h1')?.textContent || '').replace(/\\s+/g, ' ').trim(), imgs: [...c.querySelectorAll('img')].map((i) => i.getAttribute('src')), svg: c.querySelector('svg.cv-wide')?.outerHTML || null, slug: (c.querySelector('svg.cv-wide')?.getAttribute('class') || '').match(/cv-([a-z-]+)(?= cv-wide)/)?.[1] || null }))`;
  const placements = [];
  await page.goto(baseUrl + '/', { waitUntil: 'load' });
  for (const c of await page.evaluate(grab('#projects .featured-card .cover-wrap'))) placements.push({ where: 'home card', ...c });
  await page.goto(baseUrl + '/proof-of-work/', { waitUntil: 'load' });
  for (const c of await page.evaluate(grab('.project-card .project-img-wrapper'))) placements.push({ where: 'proof-of-work card', ...c });
  for (const [slug, p] of Object.entries(ex.projects)) {
    await page.goto(baseUrl + p.page, { waitUntil: 'load' });
    for (const c of await page.evaluate(grab('.project-cover'))) placements.push({ where: 'case-study header', ...c, title: p.name });
  }
  const withHash = placements.map((p) => ({ ...p, hash: p.svg ? sha1(p.svg) : null }));
  r8.expect(withHash.length === 12 && withHash.every((p) => p.svg), '12 placements, each an inline SVG cover (4 home + 4 Proof of Work + 4 case studies)', `${withHash.length} found`);
  r8.expect(withHash.every((p) => p.imgs.length === 0), 'no raster <img> inside any project card or header', withHash.filter((p) => p.imgs.length).map((p) => p.where + ': ' + p.imgs).join(', ') || 'none');
  for (const where of ['home card', 'proof-of-work card']) {
    const hs = withHash.filter((p) => p.where === where).map((p) => p.hash);
    r8.expect(hs.length === 4 && new Set(hs).size === 4, `${where}s: 4 different images`, hs.join(', '));
  }
  const byProject = {};
  for (const p of withHash) (byProject[p.slug] ||= new Set()).add(p.hash);
  const slugs = Object.keys(byProject);
  r8.expect(slugs.length === 4 && slugs.every((s) => byProject[s].size === 1), 'each project uses one consistent cover everywhere it appears', slugs.map((s) => `${s}=${[...byProject[s]][0]}`).join(', '));
  const all = slugs.map((s) => [...byProject[s]][0]);
  r8.expect(new Set(all).size === 4, 'no two projects share a cover', all.join(', '));

  // old shared files are gone, and each case study has its own social image
  const gone = ['image/automation.png', 'image/Erp-next.png'].filter((f) => fs.existsSync(path.join(ctx.root, f)));
  r8.expect(gone.length === 0, 'old shared card images deleted', gone.join(', ') || 'automation.png and Erp-next.png absent');
  const og = [];
  for (const [slug, p] of Object.entries(ex.projects)) {
    await page.goto(baseUrl + p.page, { waitUntil: 'load' });
    const url = await page.$eval('meta[property="og:image"]', (m) => m.content);
    const file = path.join(ctx.root, new URL(url).pathname);
    og.push({ slug, url, hash: fs.existsSync(file) ? sha1(fs.readFileSync(file)) : 'MISSING', own: new URL(url).pathname === `/image/og/${slug}.png` });
  }
  const shareHash = sha1(fs.readFileSync(path.join(ctx.root, 'image/og-share.jpg')));
  r8.expect(og.every((o) => o.own), 'each case study points og:image at its own /image/og/<project>.png', og.map((o) => new URL(o.url).pathname).join(', '));
  r8.expect(new Set([...og.map((o) => o.hash), shareHash]).size === 5 && !og.some((o) => o.hash === 'MISSING'), 'the four social images differ from each other and from og-share.jpg', og.map((o) => o.hash).join(', '));
  out.push(r8.finish());

  await context.close();
  return out;
}

module.exports = { ids: [4, 7, 8], run };
