'use strict';
/*
 * 5. Availability message is identical everywhere, notice-period answer matches, no other availability wording.
 * 6. Exactly one confidentiality disclaimer (the footer).
 */
const { result } = require('../lib/report');
const { normalizeText } = require('../lib/site');

const split = (s) => s.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);

// Statements by the site owner about their own availability. Anything like this that is not the agreed message is flagged.
const SELF_AVAILABILITY = /currently (?:open|employed)|\bopen to\b|\bavailable (?:for (?:full|freelance|part|hire|work|roles|new)|to (?:join|start|work))|\bavailable immediately|\bactively (?:looking|seeking)|\bseeking\b|\bnotice period\b/i;
const AVAILABILITY_ALLOWED = [
  { re: /open to remote, hybrid, or on-site roles|Remote, hybrid and on-site opportunities considered/i, why: 'work arrangement (where), not availability' },
  { re: /\?$/, why: 'FAQ question' },
];
const AVAILABILITY_WORDS = /\b(?:full[- ]time|part[- ]time|freelance|currently (?:open|employed)|open to|available for|notice period|joining)\b/i;

// Confidentiality wording. Allowed exceptions are listed with the reason.
const CONFIDENTIALITY = /confidential|\bNDA\b|non-disclosure|client (?:names?|identit)|not (?:intentionally )?disclos|\bomitted\b|proprietary|anonymi[sz]ed/i;
const CONF_ALLOWED = [
  { page: '/privacy/', why: 'the privacy notice has its own legal "Confidentiality" section' },
  { page: '/services/', sentence: /Please do not include passwords or confidential data/i, why: 'instruction to people filling in the inquiry form, not a disclaimer' },
];

async function run(ctx) {
  const { expected: ex } = ctx;
  const models = await ctx.models();
  const M = normalizeText(ex.availabilityMessage);
  const N = normalizeText(ex.noticePeriodAnswer);
  const D = normalizeText(ex.footerDisclaimer);

  // corpus per page: visible text (including closed FAQ answers), meta descriptions, JSON-LD
  const corpus = (m) => {
    const parts = [{ src: 'text', value: m.text }];
    for (const [k, v] of Object.entries({ 'meta description': m.description, 'og:description': m.ogDescription })) if (v) parts.push({ src: k, value: v });
    const leaves = (v, out = []) => {
      if (typeof v === 'string') out.push(v);
      else if (Array.isArray(v)) v.forEach((x) => leaves(x, out));
      else if (v && typeof v === 'object') Object.values(v).forEach((x) => leaves(x, out));
      return out;
    };
    for (const j of m.jsonld) {
      let strings;
      try { strings = leaves(JSON.parse(j)); } catch { strings = [j]; }
      for (const s of strings) parts.push({ src: 'json-ld', value: s });
    }
    return parts.map((p) => ({ ...p, norm: normalizeText(p.value) }));
  };

  // ------------------------------------------------------------------ 5
  const r5 = result(5, 'Availability message identical everywhere; notice-period answer; no other availability wording');
  const counts = {};
  for (const url of Object.keys(models)) {
    counts[url] = corpus(models[url]).reduce((n, p) => n + p.norm.split(M).length - 1, 0);
  }
  for (const url of ex.availabilityRequiredOn) r5.expect(counts[url] >= 1, `exact availability message on ${url}`, `${counts[url]} occurrence(s)`);
  r5.note('occurrences per page: ' + Object.entries(counts).filter(([, n]) => n).map(([u, n]) => `${u} x${n}`).join(', '));

  const contact = models['/contact/'];
  const contactCorpus = corpus(contact);
  r5.expect(contactCorpus.some((p) => p.src === 'meta description' && p.norm.includes(M)), 'Contact meta description carries the exact message', contact.description);
  r5.expect(contactCorpus.some((p) => p.src === 'og:description' && p.norm.includes(M)), 'Contact og:description carries the exact message', contact.ogDescription);
  r5.expect(contactCorpus.some((p) => p.src === 'text' && p.norm.includes(N)), 'notice-period answer matches the agreed text (visible FAQ)', N.slice(0, 60) + '…');
  const ld = contactCorpus.filter((p) => p.src === 'json-ld').map((p) => p.norm).join(' ');
  r5.expect(ld.includes(N), 'notice-period answer matches in the FAQ JSON-LD', 'present');
  r5.expect(contact.raw.includes('<option value="Freelance Project">'), 'Contact subject dropdown still has "Freelance Project"', 'present');
  const noticeElsewhere = Object.entries(models).filter(([u, m]) => u !== '/contact/' && /notice period/i.test(m.text)).map(([u]) => u);
  r5.expect(noticeElsewhere.length === 0, 'notice period only discussed on /contact/', noticeElsewhere.join(', ') || 'only /contact/');

  // everything else that talks about availability
  const flagged = [];
  const mentions = [];
  for (const [url, m] of Object.entries(models)) {
    for (const p of corpus(m)) {
      const rest = p.norm.split(M).join(' ').split(N).join(' ');
      for (const sentence of split(rest)) {
        if (!AVAILABILITY_WORDS.test(sentence)) continue;
        const allowed = AVAILABILITY_ALLOWED.find((a) => a.re.test(sentence));
        if (SELF_AVAILABILITY.test(sentence) && !allowed) flagged.push(`${url} [${p.src}] ${sentence.slice(0, 140)}`);
        else mentions.push(`${url} [${p.src}] ${sentence.slice(0, 120)}${allowed ? " (allowed: " + allowed.why + ")" : ""}`);
      }
    }
  }
  r5.expect(flagged.length === 0, 'no availability wording that differs from the agreed message', flagged.length ? flagged.slice(0, 6).join(' || ') : 'none');
  r5.note(`other sentences that mention freelance/full-time/etc. (descriptive, listed for review): ${mentions.length}`);
  for (const mline of mentions) r5.note('  ' + mline);

  // ------------------------------------------------------------------ 6
  const r6 = result(6, 'Exactly one confidentiality disclaimer, in the footer');
  const missing = [], dup = [];
  for (const [url, m] of Object.entries(models)) {
    const n = normalizeText(m.text).split(D).length - 1;
    if (n === 0) missing.push(url); else if (n > 1) dup.push(`${url} x${n}`);
    if (normalizeText(m.footerText).split(D).length - 1 !== 1) missing.push(url + ' (not in footer)');
  }
  r6.expect(!missing.length && !dup.length, 'the footer disclaimer appears exactly once on every page, inside the footer', missing.concat(dup).join(', ') || `${Object.keys(models).length} pages`);
  const stray = [];
  const allowed = [];
  for (const [url, m] of Object.entries(models)) {
    const body = m.textNodes.filter((n) => !n.inFooter).map((n) => n.text);
    const metaTexts = [m.description, m.ogDescription].filter(Boolean);
    for (const s of [...body.flatMap((t) => split(t)), ...metaTexts.flatMap(split)]) {
      if (!CONFIDENTIALITY.test(s)) continue;
      const ok = CONF_ALLOWED.find((a) => a.page === url && (!a.sentence || a.sentence.test(s)));
      if (ok) allowed.push(`${url}: ${ok.why}`); else stray.push(`${url}: ${s.slice(0, 140)}`);
    }
    // statements inside JSON-LD too
    for (const j of m.jsonld) if (CONFIDENTIALITY.test(j) && url !== '/privacy/') stray.push(`${url}: JSON-LD ${j.match(CONFIDENTIALITY)[0]}`);
  }
  r6.expect(stray.length === 0, 'no other confidentiality/NDA/"client names omitted" statement on any page', stray.length ? stray.slice(0, 6).join(' || ') : 'none');
  r6.note('allowed exceptions: ' + ([...new Set(allowed)].join(' ; ') || 'none'));
  r6.note('Independence statements ("independent project, not client work") are a different kind of statement and are not counted here; they remain on the Razorpay and ERPNext case studies, the homepage and Proof of Work intro lines.');
  return [r5.finish(), r6.finish()];
}

module.exports = { ids: [5, 6], run };
