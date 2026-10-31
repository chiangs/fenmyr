// Draws the app icon (assets/icon.png, 1024 px) and the browser tab icon (web/favicon.png, 128 px):
// the duotone cloudberry mark on a warm birch squircle. Needs Playwright's Chromium: node tools/make-icon.ts
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { custom } from './icons/custom.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const mark = custom['fenmyr-mark']?.d;
if (!mark) throw new Error('tools/icons/custom.ts has no fenmyr-mark');
// the colours the app's duotone icons use in light mode
const INK = '#302c26';
const AMBER = '#e8912a';
const LEAF = '#4f9a3d';

const svg = (
  size: number,
) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs><clipPath id="sq"><rect x="61" y="61" width="902" height="902" rx="236"/></clipPath>
    <filter id="sh" x="-10%" y="-10%" width="120%" height="125%"><feGaussianBlur stdDeviation="14"/></filter></defs>
  <rect x="61" y="73" width="902" height="902" rx="236" fill="rgb(196,109,22)" fill-opacity=".28" filter="url(#sh)"/>
  <g clip-path="url(#sq)"><rect x="61" y="61" width="902" height="902" fill="#fbf3e6"/></g>
  <style>.s{fill:none;stroke:${INK};stroke-width:1.25;stroke-linecap:round;stroke-linejoin:round}.f{fill:${INK}}
    .t{fill:${AMBER};fill-opacity:.55}.t2{fill:${LEAF};fill-opacity:.55}</style>
  <g transform="translate(512 512) scale(3.3) translate(-128 -141)">${mark}</g>
</svg>`;

const targets = [
  [path.join(ROOT, 'assets', 'icon.png'), 1024],
  [path.join(ROOT, 'web', 'favicon.png'), 128],
] as const;
const browser = await chromium.launch();
for (const [file, size] of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const drawing = svg(size);
  await page.setContent(`<html><body style="margin:0;background:transparent">${drawing}</body></html>`);
  fs.writeFileSync(file, await page.screenshot({ omitBackground: true, type: 'png' }));
  await page.close();
  console.log('wrote', path.relative(ROOT, file), size);
}
await browser.close();
