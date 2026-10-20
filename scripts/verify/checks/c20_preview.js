'use strict';
/*
 * 20. Checks that only a real deployment can answer. Run with a preview URL:
 *
 *     [VERCEL_PROTECTION_BYPASS=<token> in the environment] node run.js --only 20 --preview https://<deployment>.vercel.app
 *
 * The bypass token is read from the environment by run.js (never from an argument), sent as x-vercel-protection-bypass to the
 * preview's origin only, and redacted from everything printed or written (lib/redact.js; test: selftest-token.js).
 *
 * Without --preview this check is SKIPPED: a local server cannot prove what Vercel itself does with redirects (permanent:true
 * becomes a 308 there), with rule order, with .vercelignore in a Git deployment, or with headers and compression.
 *
 * With a URL it checks, on the real host: every page answers 200; every redirect in vercel.json ends at the right page with
 * 301 (not 302/307) hops; /scripts/ and /drafts/ are not served; both resume PDFs are byte-identical to the repository's;
 * the response headers from vercel.json are present; no phone number in any page's raw HTML or in the WhatsApp script;
 * unknown paths 404; and a browser smoke test of the WhatsApp button and the contact form's endpoint.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { result } = require('../lib/report');

async function run(ctx) {
  const r = result(20, 'Real host (Vercel preview): redirects, pages, headers, PDFs, WhatsApp button');
  const { args, expected: ex, root } = ctx;
  if (!args.preview) {
    r.skip('No preview URL was given, so nothing was checked on the real host. Run: node run.js --only 20 --preview https://<deployment>.vercel.app (if Deployment Protection is on, export VERCEL_PROTECTION_BYPASS first).');
    return [r.finish()];
  }
  const base = args.preview.replace(/\/+$/, '');
  const baseOrigin = new URL(base).origin;
  // The token (from VERCEL_PROTECTION_BYPASS, see run.js) is sent only to the preview's own origin, never to another host a
  // redirect or a page might point at.
  const headersFor = (url) => (ctx.bypass && new URL(url, base).origin === baseOrigin ? { 'x-vercel-protection-bypass': ctx.bypass } : {});
  const headers = headersFor(base + '/');
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(base);
  const get = (p, opt = {}) => fetch(base + p, { redirect: 'manual', headers, ...opt });
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

  // ---------------------------------------------------------------- reachable, not behind a login wall, really Vercel
  const home = await get('/');
  const homeText = await home.text();
  if (home.status === 401 || home.status === 403 || /Authentication Required|vercel\.com\/sso|Vercel Authentication/i.test(homeText.slice(0, 4000))) {
    r.fail('the preview is reachable by the check', ctx.bypass
      ? `GET / answered ${home.status} with a login page although a bypass token was sent: the token is probably not the one for this project, or Deployment Protection is configured differently. Nothing else was checked.`
      : `GET / answered ${home.status} with a login page: Deployment Protection is on and no bypass token is set. Export VERCEL_PROTECTION_BYPASS (do not pass it as an argument) or use a public URL. Nothing else was checked.`);
    return [r.finish()];
  }
  r.expect(home.status === 200, 'GET / answers 200', `${home.status}`);
  const vid = home.headers.get('x-vercel-id');
  if (!isLocal) r.expect(!!vid, 'the answer comes through Vercel (x-vercel-id header present)', vid || 'header missing: is this really a Vercel URL?');
  else r.note('preview URL is a local address: x-vercel-id is not expected.');

  // ---------------------------------------------------------------- every page
  const pageBad = [];
  const htmlByUrl = {};
  for (const url of ex.pages) {
    const res = await get(url);
    const text = await res.text();
    htmlByUrl[url] = text;
    if (res.status !== 200 || !/text\/html/.test(res.headers.get('content-type') || '')) pageBad.push(`${url} -> ${res.status} ${res.headers.get('content-type')}`);
  }
  r.expect(pageBad.length === 0, `${ex.pages.length} pages answer 200 text/html on the real host`, pageBad.slice(0, 4).join(' | ') || ex.pages.join(' '));

  const slash = await get('/about');
  const slashLoc = slash.headers.get('location');
  r.expect([301, 307, 308].includes(slash.status) && slashLoc && new URL(slashLoc, base).pathname === '/about/', 'trailingSlash: GET /about redirects to /about/', `${slash.status} -> ${slashLoc}`);
  const missing = await get('/this-page-does-not-exist-xyz/');
  r.expect(missing.status === 404, 'an unknown path answers 404', `${missing.status}`);

  // ---------------------------------------------------------------- redirects: follow every hop
  async function chain(from) {
    const hops = [];
    let url = base + from;
    for (let i = 0; i < 6; i++) {
      const res = await fetch(url, { redirect: 'manual', headers: headersFor(url) });
      hops.push({ status: res.status, url: new URL(url).pathname + new URL(url).hash });
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) { url = new URL(loc, url).toString(); continue; }
      return { hops, final: new URL(url) };
    }
    return { hops, final: new URL(url), loop: true };
  }
  const redirBad = [];
  const lines = [];
  for (const { from, to } of ex.redirects) {
    const c = await chain(from);
    const statuses = c.hops.map((h) => h.status);
    const want = new URL(to, base);
    const finalOk = c.final.pathname === want.pathname;
    const permanentOnly = statuses.slice(0, -1).every((s) => s === 301 || s === 308) && statuses.slice(0, -1).includes(301);
    if (c.loop || !finalOk || statuses[statuses.length - 1] !== 200 || !permanentOnly) redirBad.push(`${from}: ${statuses.join('>')} ends at ${c.final.pathname}`);
    lines.push(`${from} ${statuses.join('>')}`);
  }
  r.expect(redirBad.length === 0, `${ex.redirects.length} redirects: every hop is permanent (at least one is the declared 301, never 302/307), each ends at the right page with 200`, redirBad.slice(0, 4).join(' | ') || lines.slice(0, 3).join('; ') + '; ...');
  r.note('redirect chains (status per hop): ' + lines.join(' | '));
  // The first hop for a path without a trailing slash is Vercel's own 308 to the slash form, so the anchor is
  // judged on the end of the chain (the URL the visitor lands on), not on the first Location header.
  const fragmentBad = [];
  for (const { from, to } of ex.redirects.filter((x) => x.to.includes('#'))) {
    const c = await chain(from);
    const anchor = to.slice(to.indexOf('#'));
    if (c.final.hash !== anchor) fragmentBad.push(`${from} -> ${c.final.pathname}${c.final.hash || ' (anchor lost)'}`);
  }
  r.expect(fragmentBad.length === 0, 'redirects that target an #anchor keep the anchor in the URL the chain ends at', fragmentBad.join(' | ') || `${ex.redirects.filter((x) => x.to.includes('#')).length} rules`);

  // ---------------------------------------------------------------- private folders
  const leak = [];
  const priv = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'scripts', 'drafts'], { cwd: root, encoding: 'utf8' }).split(String.fromCharCode(10)).filter(Boolean);
  const spellings = [...priv.map((x) => '/' + x.split('/').map(encodeURIComponent).join('/')), '/scripts', '/scripts/', '/drafts', '/drafts/', '/README.md', '/scripts/resume-source/', '/%73cripts/resume-source/resume-ats.html', '/scripts//resume-source/resume-ats.html', '/Scripts/resume-source/resume-ats.html', '/scripts/resume-source/resume-ats.html/', '/drafts/blog/README.md?x=1'];
  for (const p of spellings) {
    // Follow the whole chain: "/scripts" first gets Vercel's 308 to "/scripts/", which the guard rule then sends to "/".
    // The chain must end on the home page (or a 404); landing on any other page, or on a 200 for a private path, is a leak.
    const c = await chain(p);
    const last = c.hops[c.hops.length - 1].status;
    if (c.loop) leak.push(`${p} redirects in a loop`);
    else if (c.final.pathname === '/') { /* guard rule worked */ }
    else if (last === 200) leak.push(`${p} is served (200 at ${c.final.pathname})`);
    else if (last >= 300 && last < 400) leak.push(`${p} redirects without a Location (${last})`);
  }
  r.expect(leak.length === 0, `no file under /scripts/ or /drafts/ is served: ${priv.length} repository files plus ${spellings.length - priv.length} odd spellings (encoded, doubled slash, upper case, trailing slash, directory) never answer 200 and only redirect to /`, leak.slice(0, 4).join(' | ') || `${spellings.length} URLs probed, including every file in scripts/resume-source and drafts/blog`);
  const extra = [];
  for (const p of ['/vercel.json', '/.vercelignore', '/.git/config', '/package.json']) {
    const res = await get(p);
    if (res.status === 200) extra.push(p);
  }
  r.note(extra.length ? `served as files (informational): ${extra.join(', ')}` : 'not served: /vercel.json, /.vercelignore, /.git/config, /package.json');

  // ---------------------------------------------------------------- PDFs
  const pdfBad = [];
  for (const pdf of ex.pdfs) {
    const url = '/' + pdf.file;
    const file = path.join(root, pdf.file);
    const res = await get(url);
    const body = Buffer.from(await res.arrayBuffer());
    const sum = (b) => crypto.createHash('sha256').update(b).digest('hex');
    if (res.status !== 200 || !/application\/pdf/.test(res.headers.get('content-type') || '')) pdfBad.push(`${url}: ${res.status} ${res.headers.get('content-type')}`);
    else if (!fs.existsSync(file) || sum(body) !== sum(fs.readFileSync(file))) pdfBad.push(`${url}: differs from the repository file`);
  }
  r.expect(pdfBad.length === 0, `${ex.pdfs.length} resume PDFs: 200, application/pdf, byte-identical to the repository`, pdfBad.join(' | ') || ex.pdfs.map((p) => p.file).join(', '));

  // ---------------------------------------------------------------- headers from vercel.json
  const wanted = (vercel.headers || []).flatMap((h) => h.headers.map((x) => ({ source: h.source, ...x })));
  const headerBad = [];
  for (const w of wanted.filter((x) => x.source === '/(.*)')) {
    const got = home.headers.get(w.key);
    if (got !== w.value) headerBad.push(`${w.key}: "${got}" instead of "${w.value}"`);
  }
  r.expect(headerBad.length === 0, `response headers set in vercel.json are present on /: ${wanted.filter((x) => x.source === '/(.*)').map((x) => x.key).join(', ')}`, headerBad.join(' | ') || 'all equal');
  const gz = await fetch(base + '/', { headers: { ...headers, 'accept-encoding': 'gzip, br' } });
  r.note(`content-encoding for / when the client accepts gzip/br: ${gz.headers.get('content-encoding') || 'none'}; cache-control: ${home.headers.get('cache-control') || 'none'}`);

  // ---------------------------------------------------------------- phone number must not be in raw HTML or the script
  const digits = ex.phone.digits.split('');
  const phoneRe = new RegExp(digits.join('[\\s\\-.()]*'));
  const withPhone = Object.entries(htmlByUrl).filter(([, t]) => phoneRe.test(t) || /(?:href|src|action)="[^"]*(?:wa\.me|tel:)/i.test(t.replace(/<!--[\s\S]*?-->/g, ''))).map(([u]) => u);
  const js = await (await get('/assets/js/contact-actions.js')).text();
  const jsBad = phoneRe.test(js) || (js.includes(ex.phone.digits));
  r.expect(withPhone.length === 0 && !jsBad, 'the real host serves no phone number or wa.me/tel: link in any page, and the WhatsApp script only holds it in pieces', withPhone.slice(0, 3).join(', ') || (jsBad ? 'the number is contiguous in contact-actions.js' : `${Object.keys(htmlByUrl).length} pages and the script`));

  // ---------------------------------------------------------------- sitemap, robots
  const sm = await get('/sitemap.xml');
  const rb = await get('/robots.txt');
  r.expect(sm.status === 200 && /xml/.test(sm.headers.get('content-type') || '') && rb.status === 200, 'sitemap.xml (xml) and robots.txt answer 200', `sitemap ${sm.status} ${sm.headers.get('content-type')}, robots ${rb.status}`);

  // ---------------------------------------------------------------- browser smoke test on the real host
  const context = await ctx.browser.newContext({ viewport: { width: 390, height: 800 } });
  if (ctx.bypass) {
    // Not extraHTTPHeaders: that would attach the token to every request the page makes, including third-party hosts.
    await context.route('**/*', (route) => {
      const req = route.request();
      return route.continue(headersFor(req.url())['x-vercel-protection-bypass'] ? { headers: { ...req.headers(), ...headersFor(req.url()) } } : {});
    });
  }
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(String(e.message).slice(0, 120)));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text().slice(0, 120)); });
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.evaluate(() => { window.__opened = []; window.open = (...a) => { window.__opened.push(a[0]); return { opener: null }; }; });
  const hasButton = await page.locator('[data-whatsapp]').count();
  let opened = null;
  if (hasButton) { await page.locator('[data-whatsapp]').click({ timeout: 4000 }).catch((e) => problems.push('click: ' + String(e.message).split('\n')[0])); opened = await page.evaluate(() => window.__opened[0] || null); }
  const decoded = opened ? decodeURIComponent(opened.split('?text=')[1] || '') : null;
  r.expect(hasButton === 1 && opened && opened.startsWith(ex.whatsapp.urlPrefix) && decoded === ex.whatsapp.message, 'on the real host the WhatsApp button builds https://wa.me/<number>?text=<message> on click', opened ? `${opened.slice(0, 60)}...; text ok: ${decoded === ex.whatsapp.message}` : `button count ${hasButton}, nothing opened`);
  await page.goto(base + '/contact/', { waitUntil: 'load' });
  const action = await page.evaluate(() => document.querySelector('form') && document.querySelector('form').getAttribute('action'));
  const localAction = await (async () => { const t = fs.readFileSync(path.join(root, 'contact', 'index.html'), 'utf8'); const m = /<form[^>]*\baction="([^"]+)"/.exec(t); return m && m[1]; })();
  r.expect(!!action && action === localAction && /^https:\/\/formspree\.io\/f\/[a-z0-9]+$/i.test(action), 'the contact form posts to the real Formspree endpoint (not a placeholder)', action);
  r.expect(problems.length === 0, 'no console errors or uncaught exceptions on / and /contact/ at 390px', problems.slice(0, 3).join(' | ') || 'clean');
  await context.close();
  r.note('Not checked here, only you can: that a real form submission arrives in your inbox, and that the WhatsApp button opens the WhatsApp app on a phone.');
  return [r.finish()];
}

module.exports = { ids: [20], run };
