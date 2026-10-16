'use strict';
/*
 * 14. Contact and Services forms.
 *   - success / error messages are not in the initial DOM or HTML; they appear only after a submission (endpoint mocked)
 *   - messages are announced (empty aria-live region, role=status / role=alert)
 *   - the submit endpoint is a real Formspree URL, not a placeholder; it is printed
 *   - optional (--probe-formspree): ONE honeypot-flagged POST proves the form id exists on Formspree without delivering a message
 */
const { result } = require('../lib/report');
const { readText, decodeEntities } = require('../lib/site');

const FORMS = [
  { url: '/contact/', form: '#contactForm', fill: async (p) => { await p.fill('#name', 'Verify Bot'); await p.fill('#email', 'verify@example.com'); await p.selectOption('#subject', 'Freelance Project'); await p.fill('#message', 'Automated verification run. Please ignore.'); } },
  { url: '/services/', form: '#serviceForm', fill: async (p) => { await p.fill('#svc-name', 'Verify Bot'); await p.fill('#svc-email', 'verify@example.com'); await p.selectOption('#svc-service', 'API testing'); await p.fill('#svc-message', 'Automated verification run, please ignore this message.'); } },
];
const SUCCESS = /Thanks/;
const FAILURE = /Something went wrong|could not be sent/;
const PLACEHOLDER = /your|xxxx|example|form[_-]?id|todo|replace|placeholder|test123|abcdef/i;

async function run(ctx) {
  const r = result(14, 'Forms: status messages absent until submit, aria-live, real endpoint');
  const { baseUrl, browser } = ctx;
  const endpoints = {};

  for (const f of FORMS) {
    // ---- static HTML
    const raw = decodeEntities(readText(f.url === '/contact/' ? 'contact/index.html' : 'services/index.html'));
    r.expect(!SUCCESS.test(raw.replace(/<script[\s\S]*?<\/script>/g, '')) && !FAILURE.test(raw), `${f.url}: success and error wording is not in the page HTML`, 'absent from the markup (kept in assets/js/form-submit.js)');
    const action = /<form\b[^>]*\bid="[^"]+"[^>]*\baction="([^"]+)"|<form\b[^>]*\baction="([^"]+)"/.exec(raw);
    const endpoint = action && (action[1] || action[2]);
    endpoints[f.url] = endpoint;
    r.expect(!!endpoint && /^https:\/\/formspree\.io\/f\/[a-z0-9]{8,12}$/.test(endpoint) && !PLACEHOLDER.test(endpoint.split('/').pop()), `${f.url}: submit endpoint is a well-formed Formspree URL, not a placeholder`, endpoint || 'no action attribute');
    r.expect(/<form\b[^>]*\bmethod="POST"/i.test(raw), `${f.url}: form has method=POST so it still works without JavaScript`, 'method="POST"');

    // ---- runtime
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const requests = [];
    let mode = 'ok';
    await context.route('https://formspree.io/**', (route) => {
      requests.push(`${route.request().method()} ${route.request().url()}`);
      if (mode === 'ok') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      if (mode === 'http500') return route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' });
      return route.abort('failed');
    });
    const page = await context.newPage();
    await page.goto(baseUrl + f.url, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    const initial = await page.evaluate(() => ({ body: document.body.innerText + document.documentElement.outerHTML, status: document.getElementById('formStatus')?.outerHTML, hasOld: !!document.querySelector('#successMessage, #errorMessage, .success-message, .error-message') }));
    r.expect(!SUCCESS.test(initial.body.replace(/<script[\s\S]*?<\/script>/g, '')) && !FAILURE.test(initial.body) && !initial.hasOld, `${f.url}: no success/error message in the initial DOM (after load)`, 'none in innerText, outerHTML or as elements');
    r.expect(/^<div id="formStatus" aria-live="polite"><\/div>$/.test(initial.status || ''), `${f.url}: empty polite live region waiting for messages`, initial.status);

    // empty submit: field errors, nothing sent
    const submit = page.locator(`${f.form} [type=submit]`);
    await submit.click();
    const errCount = await page.locator(`${f.form} .field-error:not(:empty)`).count();
    r.expect(errCount >= 3 && requests.length === 0, `${f.url}: empty submit shows inline field errors and sends nothing`, `${errCount} field errors, ${requests.length} requests`);
    r.expect((await page.locator('#formStatus').innerHTML()) === '', `${f.url}: no status message for a validation failure`, 'region still empty');

    // success
    await f.fill(page);
    await submit.click();
    await page.locator('#formStatus .success-message').waitFor({ timeout: 4000 }).catch(() => {});
    const ok = await page.evaluate(() => { const m = document.querySelector('#formStatus .success-message'); return m && { role: m.getAttribute('role'), text: m.textContent, parentLive: m.parentElement.getAttribute('aria-live') }; });
    r.expect(ok && ok.role === 'status' && ok.parentLive === 'polite' && SUCCESS.test(ok.text), `${f.url}: after a successful submit the message appears (role=status inside the aria-live region)`, ok ? `"${ok.text.slice(0, 50)}"` : 'no message');
    r.expect(requests.length === 1 && requests[0] === `POST ${endpoint}`, `${f.url}: exactly one POST to the endpoint`, requests.join(' | '));
    r.expect((await page.inputValue(f.url === '/contact/' ? '#name' : '#svc-name')) === '', `${f.url}: form is cleared after success`, 'cleared');

    // server error and network failure
    for (const [label, m] of [['HTTP 500', 'http500'], ['network failure', 'abort']]) {
      mode = m;
      await f.fill(page);
      await submit.click();
      await page.locator('#formStatus .error-message').waitFor({ timeout: 4000 }).catch(() => {});
      const bad = await page.evaluate(() => { const e = document.querySelector('#formStatus .error-message'); return e && { role: e.getAttribute('role'), text: e.textContent, mailto: e.querySelector('a[href^="mailto:"]')?.getAttribute('href'), successGone: !document.querySelector('#formStatus .success-message') }; });
      r.expect(bad && bad.role === 'alert' && FAILURE.test(bad.text) && bad.mailto && bad.successGone, `${f.url}: ${label} shows an error (role=alert) with an email fallback and removes the success message`, bad ? `"${bad.text.slice(0, 60)}"` : 'no message');
      r.expect(!(await submit.isDisabled()), `${f.url}: submit button usable again after ${label}`, 'enabled');
    }
    await context.close();
  }

  // ---- the endpoints, printed
  r.note('submit endpoints in the code: ' + Object.entries(endpoints).map(([u, e]) => `${u} -> ${e}`).join(' ; '));
  r.expect(new Set(Object.values(endpoints)).size === 1, 'Contact and Services post to the same Formspree form', Object.values(endpoints)[0]);

  // ---- optional live probe
  if (ctx.args.probeFormspree && !ctx.args.skipNetwork) {
    const id = Object.values(endpoints)[0].split('/').pop();
    const bogus = await fetch('https://formspree.io/f/zzzzzzzz', { method: 'POST', headers: { Accept: 'application/json' }, body: (() => { const f = new FormData(); f.append('_gotcha', 'probe'); return f; })() });
    const real = await fetch(`https://formspree.io/f/${id}`, { method: 'POST', headers: { Accept: 'application/json' }, body: (() => { const f = new FormData(); f.append('_gotcha', 'probe'); f.append('name', 'verify-probe-do-not-reply'); return f; })() });
    const realBody = await real.text();
    r.expect(bogus.status === 404 && real.status === 200 && /"ok":\s*true/.test(realBody), 'live probe: an unknown form id answers 404, the site\'s form id answers 200 {"ok":true}', `unknown=${bogus.status}, ${id}=${real.status} ${realBody.slice(0, 40)}`);
    r.note('The probe sent one POST with the honeypot field _gotcha set; Formspree discards such submissions as spam, so nothing is delivered to the inbox. Whether a REAL submission reaches the inbox can only be confirmed by you.');
  } else {
    r.note('live Formspree probe not run (use --probe-formspree); nothing was sent to Formspree by this run');
  }
  return [r.finish()];
}

module.exports = { ids: [14], run };
