'use strict';
/*
 * Collects check results and prints them as a table.
 *
 *   const r = result(13, 'WhatsApp button');
 *   r.pass('present on every page', '15 pages');
 *   r.fail('overlap at 390px', 'footer link under the button on /contact/');
 *   r.note('informational line');
 *   r.skip('needs a preview URL');
 *   results.push(r.finish());
 */

function result(id, title) {
  const subs = [];
  const notes = [];
  let skipped = null;
  const api = {
    id,
    title,
    pass(name, evidence = '') { subs.push({ pass: true, name, evidence }); return true; },
    fail(name, evidence = '') { subs.push({ pass: false, name, evidence }); return false; },
    expect(cond, name, evidence = '') { subs.push({ pass: !!cond, name, evidence }); return !!cond; },
    note(text) { notes.push(text); },
    skip(reason) { skipped = reason; },
    finish() {
      const failed = subs.filter((s) => !s.pass);
      let status = 'PASS';
      if (skipped && subs.length === 0) status = 'SKIPPED';
      else if (failed.length) status = 'FAIL';
      const summary = skipped && subs.length === 0
        ? skipped
        : failed.length
          ? `${failed.length} of ${subs.length} sub-checks failed: ${failed.slice(0, 3).map((f) => f.name + (f.evidence ? ' (' + f.evidence + ')' : '')).join('; ')}${failed.length > 3 ? '; ...' : ''}`
          : `${subs.length} sub-checks passed` + (subs.length ? ': ' + subs.slice(0, 2).map((s) => s.evidence || s.name).filter(Boolean).join('; ') : '');
      const details = [
        ...subs.map((s) => `${s.pass ? 'PASS' : 'FAIL'}  ${s.name}${s.evidence ? '  ::  ' + s.evidence : ''}`),
        ...notes.map((n) => 'NOTE  ' + n),
        ...(skipped ? ['SKIP  ' + skipped] : []),
      ];
      return { id, title, status, summary, details };
    },
  };
  return api;
}

function pad(s, n) { s = String(s); return s.length >= n ? s.slice(0, n - 1) + '…' : s + ' '.repeat(n - s.length); }

function table(results) {
  const lines = [];
  lines.push(`${pad('#', 4)}${pad('What was tested', 58)}${pad('Result', 9)}Evidence`);
  lines.push('-'.repeat(140));
  for (const r of results) {
    lines.push(`${pad(r.id, 4)}${pad(r.title, 58)}${pad(r.status, 9)}${String(r.summary).slice(0, 110)}`);
  }
  return lines.join('\n');
}

function markdown(results, meta = {}) {
  const out = [];
  out.push('# Verification report');
  out.push('');
  for (const [k, v] of Object.entries(meta)) out.push(`- ${k}: ${v}`);
  out.push('');
  out.push('| # | What was tested | Result | Evidence |');
  out.push('|---|---|---|---|');
  for (const r of results) out.push(`| ${r.id} | ${r.title} | ${r.status} | ${String(r.summary).replace(/\|/g, '\\|')} |`);
  out.push('');
  for (const r of results) {
    out.push(`## ${r.id}. ${r.title} (${r.status})`);
    out.push('');
    out.push('```');
    out.push(...r.details);
    out.push('```');
    out.push('');
  }
  return out.join('\n');
}

module.exports = { result, table, markdown };
