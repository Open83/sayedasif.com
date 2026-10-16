'use strict';
/*
 * 11. The phone number is not in any page's HTML, inline JSON-LD, static href/data attribute, or as a plain literal in the shipped JS.
 * 12. Click-to-reveal phone works on Resume and Contact.
 *
 * Every deployed text file is searched as written, with HTML entities decoded and with %-escapes decoded,
 * allowing spaces, dashes, dots and brackets between digits, with and without the country code.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { result } = require('../lib/report');
const { isText, readText, decodeEntities, ROOT } = require('../lib/site');

async function run(ctx) {
  const { expected: ex, baseUrl, browser } = ctx;
  const digits = ex.phone.digits;
  const SEP = '[\\s\\-.()]*';
  const PHONE = new RegExp('(?:\\+?\\s*' + ex.phone.countryCode + SEP + ')?' + digits.split('').join(SEP));
  const LINKS = new RegExp('(?:tel:|wa\\.me/|phone=|sms:)\\+?' + ex.phone.countryCode + '?\\d', 'i');

  // ---------------------------------------------------------------- 11
  const r11 = result(11, 'Phone number absent from raw HTML, JSON-LD, attributes and shipped JS');

  // the detector must catch every common way of writing the number, otherwise "found nothing" would mean little
  const d = digits, cc = ex.phone.countryCode;
  const known = [d, `+${cc} ${d}`, `+${cc}-${d.slice(0, 5)}-${d.slice(5)}`, `${d.slice(0, 5)} ${d.slice(5)}`, `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`, `tel:+${cc}${d}`, `https://wa.me/${cc}${d}`, `(${cc}) ${d}`];
  const missed = known.filter((s) => !(PHONE.test(s) || LINKS.test(s)));
  r11.expect(missed.length === 0, `detector self-test: ${known.length} known spellings of the number are all caught`, missed.length ? 'missed: ' + missed.join(' | ') : known.join(' | '));
  const text = ctx.files.filter(isText);
  let bytes = 0;
  const hits = [];
  const variants = (s) => {
    let pct = s;
    try { pct = decodeURIComponent(s.replace(/%(?![0-9a-f]{2})/gi, '%25')); } catch { /* keep as is */ }
    return [['as written', s], ['entities decoded', decodeEntities(s)], ['%-decoded', pct]];
  };
  for (const f of text) {
    const t = readText(f);
    bytes += t.length;
    for (const [how, v] of variants(t)) {
      if (PHONE.test(v)) hits.push(`${f} (${how}): number`);
      if (LINKS.test(v)) hits.push(`${f} (${how}): tel:/wa.me/phone= link with digits`);
    }
  }
  r11.expect(hits.length === 0, `no number in ${text.length} deployed text files (${(bytes / 1024).toFixed(0)} KB; html, js, css, json, xml, svg), 3 decodings`, hits.length ? hits.slice(0, 5).join(' | ') : 'regex ' + PHONE.source.slice(0, 40) + '… found nothing');

  const actions = readText('assets/js/contact-actions.js');
  r11.expect(/var PARTS = \[("\d+",?\s*)+\];/.test(actions) && !actions.includes(digits) && !actions.includes(ex.phone.countryCode + digits), 'contact-actions.js holds the number only as separate string parts', (actions.match(/var PARTS = (\[[^\]]*\])/) || [])[1]);

  // the number must also not appear once scripts have run (nothing injects it on load)
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const dom = [];
  for (const p of ctx.pages) {
    const page = await ctxB.newPage();
    await page.goto(baseUrl + p.url, { waitUntil: 'load' });
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    if (PHONE.test(html) || LINKS.test(html)) dom.push(p.url);
    await page.close();
  }
  r11.expect(dom.length === 0, `no number in the live DOM of ${ctx.pages.length} pages after load (before any click)`, dom.join(', ') || 'none');
  await ctxB.close();

  // where the number does live in the repository (the PDFs carry it on purpose)
  const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((f) => f && isText(f) && !f.includes('node_modules') && !ctx.files.includes(f));
  const elsewhere = tracked.filter((f) => { try { return PHONE.test(readText(f)); } catch { return false; } });
  r11.note(`also present in repository files that are NOT deployed (listed in .vercelignore, which Vercel documents for uploads only, and redirected to / by vercel.json: check 2 proves the redirect locally, check 20 on a preview proves it on Vercel): ${elsewhere.join(', ') || 'none'}`);
  r11.note('the two resume PDFs contain the number on purpose (check 15). The GitHub repository is public, so the number is also in the repository and its history.');

  // ---------------------------------------------------------------- 12
  const r12 = result(12, 'Click-to-reveal phone works on Resume and Contact');
  const ctxC = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  for (const url of ['/resume/', '/contact/']) {
    const page = await ctxC.newPage();
    await page.goto(baseUrl + url, { waitUntil: 'load' });
    const btn = page.getByRole('button', { name: 'Show phone number' });
    r12.expect((await btn.count()) === 1, `${url}: one "Show phone number" button`, `${await btn.count()}`);
    const before = await page.evaluate(() => document.body.innerText + document.documentElement.innerHTML);
    r12.expect(!PHONE.test(before), `${url}: number not in the page before the click`, 'absent');
    await btn.click();
    const link = page.locator('a[href^="tel:"]');
    await link.waitFor({ timeout: 3000 }).catch(() => {});
    const shown = (await link.count()) ? (await link.first().textContent()).trim() : null;
    const href = (await link.count()) ? await link.first().getAttribute('href') : null;
    r12.expect(shown === ex.phone.display && href === 'tel:+' + ex.phone.countryCode + digits, `${url}: click shows ${ex.phone.display} as a tel: link`, `${shown} -> ${href}`);
    r12.expect(await link.first().evaluate((a) => a === document.activeElement).catch(() => false), `${url}: focus moves to the revealed number`, 'focused');
    r12.expect((await btn.count()) === 0, `${url}: the button is replaced, not duplicated`, 'button gone');
    await page.close();
  }
  await ctxC.close();
  return [r11.finish(), r12.finish()];
}

module.exports = { ids: [11, 12], run };
