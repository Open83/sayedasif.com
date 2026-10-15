'use strict';
/*
 * 3. No leftover text or links for removed things.
 *
 * Interpretation notes (also in the report):
 *  - "Capabilities": the word, and any link to /capabilities, anywhere in the deployed site.
 *  - "Payment Testing": links to the deleted page and anchor text naming it. "Payment Testing" as a skill label
 *    (resume skills, project tags, blog category) is legitimate content and is only counted, not failed.
 *  - "mutating" is checked in the deployed site AND in drafts/, as asked; "mutation test" (a different thing) is fine.
 *  - TODO markers that ship in the deployed files are an inventory, not a pass: they must be exactly the ones the owner knows
 *    about (expected.json "pendingTodos"); `node run.js --release` fails while any remains.
 */
const path = require('path');
const { result } = require('../lib/report');
const { isText, readText, grep, ROOT } = require('../lib/site');
const { execFileSync } = require('child_process');

function trackedDrafts() {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'drafts'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
}

// where in the page is character offset i: an HTML comment, JSON-LD, a meta tag, the title, or text/attribute a visitor can get?
function kindAt(text, i) {
  const within = (re) => { let m; const rx = new RegExp(re.source, 'g'); while ((m = rx.exec(text))) { if (i >= m.index && i < m.index + m[0].length) return true; if (m.index > i) return false; } return false; };
  if (within(/<!--[\s\S]*?-->/)) return 'comment';
  if (within(/<script[^>]*ld\+json[^>]*>[\s\S]*?<\/script>/)) return 'json-ld';
  if (within(/<title>[\s\S]*?<\/title>/)) return 'title';
  if (within(/<meta\b[^>]*>/)) return 'meta';
  if (within(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/)) return 'script/style';
  return 'visible';
}
function occurrences(files, re) {
  const out = [];
  for (const file of files) {
    const text = readText(file);
    const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m;
    while ((m = rx.exec(text))) {
      const line = text.slice(0, m.index).split('\n').length;
      const lineText = text.split('\n')[line - 1].replace(/\s+/g, ' ').trim();
      out.push({ file, line, kind: file.endsWith('.html') ? kindAt(text, m.index) : 'text', exact: m[0], excerpt: lineText.slice(0, 150) });
      if (m.index === rx.lastIndex) rx.lastIndex++;
    }
  }
  return out;
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

  // every "Payment Testing" (any case, hyphen or space) in the deployed pages, with where it sits
  const pt = occurrences(html, /payment[ -]testing/i);
  const exact = pt.filter((o) => o.exact === 'Payment Testing');
  const kinds = {};
  for (const o of pt) kinds[o.kind] = (kinds[o.kind] || 0) + 1;
  r.note(`"Payment Testing" still appears (allowed as a skill/category label, only the page and links were to go): ${exact.length} times with that exact spelling and ${pt.length - exact.length} as payment testing / payment-testing; by kind: ${Object.entries(kinds).map(([k, n]) => k + ' ' + n).join(', ')}`);
  for (const o of pt) r.note(`  ${o.file}:${o.line} [${o.kind}${o.exact === 'Payment Testing' ? '' : ', variant "' + o.exact + '"'}] ${o.excerpt}`);

  // TODO markers that ship: an inventory, not a pass
  const todos = occurrences(ctx.files.filter(isText), /TODO/);
  const known = ctx.expected.pendingTodos || [];
  const unknown = todos.filter((t) => !known.some((k) => k.file === t.file && t.excerpt.includes(k.text)));
  r.expect(unknown.length === 0, `TODO markers in the deployed files are exactly the ${known.length} the owner knows about (a new one cannot slip in)`, unknown.slice(0, 3).map((t) => `${t.file}:${t.line} ${t.excerpt}`).join(' | ') || `${todos.length} found, all on the list`);
  const resolved = known.filter((k) => !todos.some((t) => t.file === k.file && t.excerpt.includes(k.text)));
  if (resolved.length) r.note(`TODO entries in expected.json that no longer exist in the pages (resolved, remove them from the list): ${resolved.map((k) => k.file + ' "' + k.text + '"').join('; ')}`);
  for (const t of todos) r.note(`  pending TODO ${t.file}:${t.line} [${t.kind}: ${t.kind === 'comment' ? 'not rendered, but shipped in the page source' : 'visible'}] ${t.excerpt.slice(0, 120)}`);
  if (ctx.args.release) r.expect(todos.length === 0, '--release: no TODO marker may ship', todos.map((t) => t.file + ':' + t.line).join(', ') || 'none');
  else if (todos.length) r.note(`${todos.length} TODO marker(s) still ship in the page source: this check passing does not mean they are done (node run.js --release fails while any remain)`);
  return [r.finish()];
}

module.exports = { ids: [3], run };
