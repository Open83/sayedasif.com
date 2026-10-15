#!/usr/bin/env node
/*
 * Regenerates the two static resume PDFs from their HTML sources with headless Chromium.
 *
 *   scripts/resume-source/resume-print.html -> resume/Sayed-Asif-Software-QA-Engineer-Resume.pdf
 *   scripts/resume-source/resume-ats.html   -> resume/Sayed-Asif-Software-QA-Engineer-Resume-ATS.pdf
 *
 * Needs Playwright to be resolvable (npm i -D @playwright/test && npx playwright install chromium).
 * Not deployed (see .vercelignore). After running, open both PDFs and check every page.
 * Note: the committed ATS PDF was produced earlier with narrower page margins; regenerating it re-flows
 * the text slightly (same content).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const JOBS = [
  ['resume-print.html', 'resume/Sayed-Asif-Software-QA-Engineer-Resume.pdf'],
  ['resume-ats.html', 'resume/Sayed-Asif-Software-QA-Engineer-Resume-ATS.pdf'],
];
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = url.startsWith('/__src/')
    ? path.join(__dirname, 'resume-source', url.slice(7))
    : path.join(ROOT, url);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

server.listen(0, async () => {
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    for (const [src, out] of JOBS) {
      const page = await browser.newPage();
      await page.goto(`${base}/__src/${src}`, { waitUntil: 'load' });
      await page.emulateMedia({ media: 'print' });
      await page.pdf({ path: path.join(ROOT, out), format: 'A4', printBackground: true, preferCSSPageSize: true });
      console.log('wrote', out);
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
});
