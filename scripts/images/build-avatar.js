#!/usr/bin/env node
'use strict';
/*
 * Writes image/asif-avatar.webp: the profile photo (scripts/images/source/asif.png) cropped the way the resume sidebar shows it
 * (a square, object-fit: cover, object-position: center 20%) at twice the displayed size, so the 120px circle is
 * sharp on high-density screens without shipping the 480x580 PNG (about 200 KB) for it.
 *
 *   node scripts/images/build-avatar.js
 *
 * Uses sharp from scripts/verify/node_modules (run "npm install" there once).
 */
const path = require('path');
const sharp = require(path.join(__dirname, '..', 'verify', 'node_modules', 'sharp'));

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE = path.join(__dirname, 'source', 'asif.png'); // lossless original; not served (scripts/ is redirected away)
const TARGET = path.join(ROOT, 'image', 'asif-avatar.webp');
const SIZE = 240;
const FOCUS_Y = 0.2; // CSS object-position: center 20%

(async () => {
  const { width, height } = await sharp(SOURCE).metadata();
  const side = Math.min(width, height);
  const top = Math.round((height - side) * FOCUS_Y);
  const left = Math.round((width - side) * 0.5);
  await sharp(SOURCE).extract({ left, top, width: side, height: side }).resize(SIZE, SIZE).webp({ quality: 82 }).toFile(TARGET);
  const out = await sharp(TARGET).metadata();
  console.log(`image/asif-avatar.webp ${out.width}x${out.height} (crop ${side}x${side} at ${left},${top} of ${width}x${height})`);
})();
