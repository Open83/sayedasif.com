#!/usr/bin/env node
'use strict';
/*
 * Writes the brand images in the Porcelain + Deep Teal + Ink palette (see /assets/css/site.css):
 *   image/og-share.jpg   1200x630 social image for the pages that have no project cover
 *   favicon.png          64x64
 *   favicon.ico          16, 32 and 48px PNG images in one ICO container
 *
 *   node scripts/images/build-brand.js
 *
 * Drawn as HTML with the site's own self-hosted fonts and rendered by Playwright; sharp encodes the files.
 * Both come from scripts/verify/node_modules (run "npm install" there once). The social image carries only text
 * that is already on the homepage. Not deployed (scripts/ is redirected away).
 */
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..', '..');
const req = createRequire(path.join(ROOT, 'scripts', 'verify', 'package.json'));
const { chromium } = req('playwright');
const sharp = req('sharp');

const b64 = (f) => fs.readFileSync(path.join(ROOT, f)).toString('base64');
const FONTS = `
@font-face{font-family:"Source Serif 4";font-weight:200 900;src:url(data:font/woff2;base64,${b64('assets/fonts/source-serif-4-latin-wght.woff2')}) format("woff2")}
@font-face{font-family:"IBM Plex Sans";font-weight:100 700;src:url(data:font/woff2;base64,${b64('assets/fonts/ibm-plex-sans-latin-wght.woff2')}) format("woff2")}
@font-face{font-family:"IBM Plex Mono";font-weight:400;src:url(data:font/woff2;base64,${b64('assets/fonts/ibm-plex-mono-latin-400.woff2')}) format("woff2")}
@font-face{font-family:"IBM Plex Mono";font-weight:500 700;src:url(data:font/woff2;base64,${b64('assets/fonts/ibm-plex-mono-latin-500.woff2')}) format("woff2")}`;

const PORTRAIT = `data:image/png;base64,${b64('scripts/images/source/asif.png')}`;

const OG = `<!doctype html><meta charset="utf-8"><style>${FONTS}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#F8F8F5;color:#182522;font-family:"IBM Plex Sans",sans-serif;position:relative;overflow:hidden}
.rule{position:absolute;left:0;top:0;bottom:0;width:16px;background:#075E54}
.text{position:absolute;left:84px;top:78px;width:640px}
.mark{font-family:"Source Serif 4",serif;font-weight:650;font-size:34px;letter-spacing:-0.02em}
.mark span{color:#075E54}
.kicker{margin-top:70px;font-family:"IBM Plex Mono",monospace;font-weight:500;font-size:22px;letter-spacing:0.12em;text-transform:uppercase;color:#075E54}
h1{margin-top:18px;font-family:"Source Serif 4",serif;font-weight:600;font-size:104px;line-height:0.98;letter-spacing:-0.025em}
h1 span{display:block;font-size:58px;font-weight:500;color:#53635F;margin-top:10px;letter-spacing:-0.015em}
.tags{margin-top:44px;display:flex;gap:12px}
.tags b{font:400 22px "IBM Plex Mono",monospace;padding:8px 16px;border:1.5px solid #B5C4BD;border-radius:6px;color:#35433F}
.dom{position:absolute;left:84px;bottom:56px;font:400 22px "IBM Plex Mono",monospace;color:#53635F}
.plate{position:absolute;right:64px;top:64px;bottom:0;width:400px;background:#E5F3EF;border:1.5px solid #DCE4DF;border-bottom:0;border-radius:18px 18px 0 0;display:flex;align-items:flex-end;justify-content:center;overflow:hidden}
.plate img{width:380px;display:block}
.base{position:absolute;left:0;right:0;bottom:0;height:1.5px;background:#DCE4DF}
</style><body><div class="rule"></div>
<div class="text"><div class="mark">Sayed<span>Asif</span></div>
<div class="kicker">Software QA Engineer</div>
<h1>Sayed Asif<span>QA Engineer</span></h1>
<div class="tags"><b>Playwright</b><b>API Testing</b><b>Payment Testing</b></div></div>
<div class="dom">sayedasif.com</div>
<div class="plate"><img src="${PORTRAIT}" alt=""></div><div class="base"></div></body>`;

// Monogram: Ink tile, Porcelain serif "S", Deep Teal tint "A"; a short teal rule as the "verified" mark
const ICON = (size) => `<!doctype html><meta charset="utf-8"><style>${FONTS}
*{margin:0}html,body{width:${size}px;height:${size}px;background:transparent}
.t{width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.22)}px;background:#182522;display:flex;align-items:center;justify-content:center;position:relative}
.t b{font-family:"Source Serif 4",serif;font-weight:700;font-size:${Math.round(size * 0.6)}px;letter-spacing:-0.06em;line-height:1;color:#F8F8F5;transform:translateY(-${Math.round(size * 0.03)}px)}
.t b span{color:#7FD1C2}
.t i{position:absolute;left:22%;right:22%;bottom:16%;height:${Math.max(1, Math.round(size * 0.07))}px;border-radius:2px;background:#4FC7B4}
</style><body><div class="t"><b>S<span>A</span></b><i></i></div></body>`;

function ico(pngs) {
  // ICO container holding PNG images (supported by every current browser)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); e.writeUInt8(0, 3); e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12);
    entries.push(e); offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

(async () => {
  const browser = await chromium.launch();
  try {
    const shot = async (html, w, h) => {
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await page.setContent(html);
      await page.evaluate(() => document.fonts.ready);
      const png = await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h }, omitBackground: true });
      await page.close();
      return png;
    };
    const og = await shot(OG, 1200, 630);
    await sharp(og).jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(ROOT, 'image', 'og-share.jpg'));
    console.log(`image/og-share.jpg ${(fs.statSync(path.join(ROOT, 'image', 'og-share.jpg')).size / 1024).toFixed(1)} KB`);

    // icons are drawn large and scaled down, so small sizes stay crisp
    const big = await shot(ICON(256), 256, 256);
    const sized = async (s) => sharp(big).resize(s, s).png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(path.join(ROOT, 'favicon.png'), await sized(64));
    const set = [];
    for (const s of [16, 32, 48]) set.push({ size: s, data: await sized(s) });
    fs.writeFileSync(path.join(ROOT, 'favicon.ico'), ico(set));
    console.log(`favicon.png 64x64 ${(fs.statSync(path.join(ROOT, 'favicon.png')).size / 1024).toFixed(1)} KB; favicon.ico 16/32/48 ${(fs.statSync(path.join(ROOT, 'favicon.ico')).size / 1024).toFixed(1)} KB`);
  } finally {
    await browser.close();
  }
})();
