'use strict';
/*
 * 15. Both resume PDFs: valid, expected page count, contain the email but NOT the phone number (the site hides it behind click-to-reveal), no text outside the
 *     page or crowding its edge, no blank page. Every page is rasterised to out/pdf/*.png so it can be looked at.
 */
const fs = require('fs');
const path = require('path');
const { result } = require('../lib/report');

const PDFJS = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build');

async function inspect(browser, file) {
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  await page.setContent('<html><body style="margin:0"></body></html>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(PDFJS, 'pdf.min.js'), 'utf8') });
  const worker = fs.readFileSync(path.join(PDFJS, 'pdf.worker.min.js'), 'utf8');
  const data = fs.readFileSync(file).toString('base64');
  const out = await page.evaluate(async ({ data, worker }) => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([worker], { type: 'text/javascript' }));
    const pdf = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(data), (c) => c.charCodeAt(0)) }).promise;
    const meta = await pdf.getMetadata().catch(() => null);
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i);
      const view = pg.view; // [x0, y0, x1, y1] in points
      const tc = await pg.getTextContent();
      const items = tc.items.filter((t) => t.str.trim()).map((t) => ({ s: t.str, x: t.transform[4], y: t.transform[5], w: t.width, h: t.height }));
      const vp = pg.getViewport({ scale: 1.6 });
      const cv = document.createElement('canvas');
      cv.width = vp.width; cv.height = vp.height;
      const c2 = cv.getContext('2d');
      c2.fillStyle = '#fff'; c2.fillRect(0, 0, cv.width, cv.height);
      await pg.render({ canvasContext: c2, viewport: vp }).promise;
      const px = c2.getImageData(0, 0, cv.width, cv.height).data;
      let ink = 0;
      for (let k = 0; k < px.length; k += 4) if (px[k] < 245 || px[k + 1] < 245 || px[k + 2] < 245) ink++;
      pages.push({ view, items, ink: ink / (px.length / 4), png: cv.toDataURL('image/png').split(',')[1], text: items.map((t) => t.s).join(' ') });
    }
    return { numPages: pdf.numPages, title: meta?.info?.Title ?? null, producer: meta?.info?.Producer ?? null, pages };
  }, { data, worker });
  await page.close();
  return out;
}

async function run(ctx) {
  const r = result(15, 'Resume PDFs: valid, page count, email present, phone number absent, nothing clipped, pages rasterised');
  const { expected: ex, root, browser } = ctx;
  const digitsOnly = (s) => s.replace(/\D/g, '');
  const outDir = path.join(ctx.outDir, 'pdf');
  fs.mkdirSync(outDir, { recursive: true });

  for (const spec of ex.pdfs) {
    const abs = path.join(root, spec.file);
    const name = path.basename(spec.file, '.pdf');
    r.expect(fs.existsSync(abs), `${name}: file exists`, spec.file);
    if (!fs.existsSync(abs)) continue;
    const buf = fs.readFileSync(abs);
    r.expect(buf.slice(0, 5).toString() === '%PDF-' && buf.slice(-1024).toString('latin1').includes('%%EOF') && buf.length > 10000 && buf.length < 2 * 1024 * 1024, `${name}: valid PDF container (header, %%EOF, ${(buf.length / 1024).toFixed(0)} KB)`, buf.slice(0, 8).toString('latin1').trim());

    const info = await inspect(browser, abs);
    r.expect(info.numPages === spec.pages, `${name}: ${spec.pages} pages`, `${info.numPages} pages`);
    const all = info.pages.map((p) => p.text).join(' ');
    r.expect(!digitsOnly(all).includes(ex.phone.digits) && !/\+\s*91[ \d-]{10,13}/.test(all), `${name}: does not contain the phone number (public PDFs must not expose what the site hides)`, 'absent');
    r.expect(all.includes(ex.phone.email), `${name}: contains the email address`, ex.phone.email);
    const missing = spec.mustContain.filter((w) => !all.toLowerCase().includes(w.toLowerCase()));
    r.expect(missing.length === 0, `${name}: key resume content present (name, summary, employer, training, college, tools)`, missing.length ? 'missing: ' + missing.join(', ') : `${spec.mustContain.length} phrases`);

    const edge = [];
    info.pages.forEach((p, i) => {
      const [x0, y0, x1, y1] = p.view;
      const M = 14; // points (about 5 mm)
      for (const t of p.items) {
        if (t.x < x0 + M || t.x + t.w > x1 - M || t.y < y0 + M || t.y + t.h > y1 - M) edge.push(`p${i + 1} "${t.s.slice(0, 24)}" at ${t.x.toFixed(0)},${t.y.toFixed(0)} w${t.w.toFixed(0)} (page ${x1.toFixed(0)}x${y1.toFixed(0)})`);
      }
    });
    r.expect(edge.length === 0, `${name}: no text outside or within 14pt of the page edge`, edge.slice(0, 3).join(' | ') || 'all text inside the margins');
    const blank = info.pages.map((p, i) => [i + 1, p.ink]).filter(([, ink]) => ink < 0.005);
    r.expect(blank.length === 0, `${name}: no blank page`, info.pages.map((p, i) => `p${i + 1} ink ${(p.ink * 100).toFixed(1)}%`).join(', '));
    info.pages.forEach((p, i) => {
      const png = path.join(outDir, `${name}-p${i + 1}.png`);
      fs.writeFileSync(png, Buffer.from(p.png, 'base64'));
      r.note(`rasterised: scripts/verify/out/pdf/${name}-p${i + 1}.png (${p.items.length} text items, ink ${(p.ink * 100).toFixed(1)}%)`);
    });
    r.note(`${name}: producer "${info.producer}", title "${info.title}"`);
  }
  r.note('Clipping that does not move text (for example a box cut off by overflow) cannot be detected from text positions: look at the rasterised pages.');
  return [r.finish()];
}

module.exports = { ids: [15], run };
