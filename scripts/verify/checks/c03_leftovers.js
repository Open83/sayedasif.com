'use strict';
/*
 * 3. No leftover text or links for removed things.
 *
 * Interpretation notes (also in the report):
 *  - "Capabilities": the word, and any link to /capabilities, anywhere in the deployed site.
 *  - "Payment Testing": links to the deleted page and anchor text naming it. "Payment Testing" as a skill label
 *    (resume skills, project tags, blog category) is legitimate content and is only counted, not failed.
 *  - "mutating" is checked in the deployed site AND in drafts/, as asked; "mutation test" (a different thing) is fine.
 */
const path = require('path');
const { result } = require('../lib/report');
const { isText, readText, grep, ROOT } = require('../lib/site');
const { execFileSync } = require('child_process');

function trackedDrafts() {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'drafts'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
}

async function run(ctx) {
  const r = result(3, 'No leftovers: Capabilities, Payment Testing page, waitForSelector, "mutating", More ▾, wa.me links, Print as PDF, 💡');
  const site = ctx.files.filter(isText);
  const html = ctx.files.filter((f) => f.endsWith('.html'));
  const drafts = trackedDrafts();

  const rules = [
    { name: '"Capabilities" (text or /capabilities link)', files: site, re: /Capabilities|href="\/capabilities|\/capabilities\//, },
    { name: 'link to the deleted Payment Testing page (/payments)', files: site, re: /href="\/payments(?:\/|\.html)?["#]/ },
    { name: 'anchor text "Payment Testing"', files: html, re: /<a\b[^>]*>\s*Payment Testing\s*<\/a>/i },
    { name: '"waitForSelector" (site and drafts)', files: [...site, ...drafts], re: /waitForSelector/ },
    { name: '"mutating" (site and drafts)', files: [...site, ...drafts], re: /\bmutating\b/i },
    { name: '"mutat…" near DEF-002 (site and drafts)', files: [...site, ...drafts], re: /DEF-002[\s\S]{0,500}?\bmutat\w*|\bmutat\w*[\s\S]{0,500}?DEF-002/i },
    { name: '"More ▾" menu', files: html, re: /More\s*(?:▾|&#9662;|&darr;|&blacktriangledown;)|nav-dropdown/i },
    { name: 'static WhatsApp link (href/src to wa.me, api.whatsapp.com or whatsapp:) in HTML', files: html, re: /(?:href|src|action)\s*=\s*["'][^"']*(?:wa\.me|api\.whatsapp\.com|whatsapp:)/i },
    { name: '"Print as PDF" / "Print-Ready" flow', files: [...site, ...drafts], re: /Print\s*(?:→|&rarr;|->)?\s*(?:Save\s*)?as\s*PDF|Print-Ready/i },
    { name: '💡 helper text', files: [...site, ...drafts], re: /💡|&#128161;|&#x1F4A1;/i },
  ];
  for (const rule of rules) {
    const hits = grep(rule.files, rule.re);
    r.expect(hits.length === 0, `no ${rule.name}`, hits.length ? hits.slice(0, 3).map((h) => `${h.file}: …${h.text}…`).join(' | ') : `0 matches in ${rule.files.length} files`);
  }

  const skillLabel = grep(html, /Payment Testing/);
  const byFile = {};
  for (const h of skillLabel) byFile[h.file] = (byFile[h.file] || 0) + 1;
  r.note(`"Payment Testing" still appears as a skill/category label (allowed): ${Object.entries(byFile).map(([f, n]) => `${f} x${n}`).join(', ') || 'none'}`);
  return [r.finish()];
}

module.exports = { ids: [3], run };
