// Writes the README's art into assets/readme/: Myra as two looping animated PNGs, drawn by the app's own sprite, and the
// small icons beside the "Why Fenmyr" headings, from Fenmyr's cloudberry icons and Phosphor, in cloudberry colours.
//
//   npm run build && node tools/readme-art.ts
//
// Myra is an animated PNG, not a GIF: her edges are soft while she breathes, and a GIF's on-or-off transparency would
// fringe them on GitHub's light or dark page. Each frame is drawn at a fixed time with a fixed clock and no randomness,
// so two runs write the same files.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { launch } from '../tests/support/launch.ts';
import { custom } from './icons/custom.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'assets', 'readme');
const PHOSPHOR = path.join(ROOT, 'node_modules', '@phosphor-icons', 'core', 'assets', 'duotone');

// Mid-tones that read on GitHub's white page and on its near-black one alike.
const INK = '#d4731a';
const TINT = '#f6a63c';
const LEAF = '#5aa845';

type Step = { at: number; hop?: true; pose?: 'happy' | 'love' | null };
type Clip = { file: string; seconds: number; steps: Step[] };

const FPS = 20;
const CLIPS: Clip[] = [
  // the hero: she sits, hops, beams, settles, and blinks once before the loop starts again
  {
    file: 'myra-hello.png',
    seconds: 3.3,
    steps: [
      { at: 0.8, hop: true },
      { at: 1, pose: 'happy' },
      { at: 2.4, pose: null },
    ],
  },
  // Support: heart eyes, with two hearts floating up; they repeat every 2 s, so a 4 s loop meets itself
  { file: 'myra-love.png', seconds: 4, steps: [{ at: 0, pose: 'love' }] },
];

const ICONS: { file: string; phosphor?: string; custom?: string }[] = [
  { file: 'mark.svg', custom: 'fenmyr-mark' },
  { file: 'prototype.svg', phosphor: 'rocket-launch' },
  { file: 'myra.svg', custom: 'myra-chat' },
  { file: 'local.svg', phosphor: 'lock-key' },
  { file: 'linux.svg', phosphor: 'linux-logo' },
  { file: 'access.svg', phosphor: 'eye' },
  { file: 'built.svg', phosphor: 'shield-check' },
];

async function frames(clip: Clip): Promise<Buffer[]> {
  const l = await launch();
  try {
    const urls = await l.page.evaluate(
      ({ clip, fps }) => {
        // her clock and her glances, pinned: she looks straight ahead and every run draws the same frames
        let clock = 3_300_020;
        Object.defineProperty(performance, 'now', { value: () => clock, configurable: true });
        Math.random = () => 0.4;
        const c = document.createElement('canvas');
        c.width = 136;
        c.height = 128;
        const goo = window.Goo(c, { headroom: 4, manual: true });
        const start = clock;
        const out: string[] = [];
        const count = Math.round(clip.seconds * fps);
        for (let i = 0; i < count; i++) {
          clock = start + (i * 1000) / fps;
          const t = i / fps;
          for (const s of clip.steps) {
            if (Math.abs(s.at - t) > 1e-6) continue;
            if (s.hop) goo.hop();
            if (s.pose !== undefined) goo.pose(s.pose);
          }
          goo.draw(clock);
          out.push(c.toDataURL('image/png'));
        }
        return out;
      },
      { clip, fps: FPS },
    );
    return urls.map(u => Buffer.from(u.split(',')[1] ?? '', 'base64'));
  } finally {
    await l.close();
  }
}

function chunk(type: string, data: Buffer) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([head, body, crc]);
}

// a PNG's chunks, in order
function chunks(png: Buffer) {
  const list: { type: string; data: Buffer }[] = [];
  for (let at = 8; at < png.length; ) {
    const len = png.readUInt32BE(at);
    list.push({ type: png.toString('latin1', at + 4, at + 8), data: png.subarray(at + 8, at + 8 + len) });
    at += 12 + len;
  }
  return list;
}

// Joins same-sized PNG frames into one looping animated PNG. A frame that repeats the one before only lengthens it.
function apng(pngs: Buffer[]) {
  const runs: { data: Buffer; ticks: number }[] = [];
  for (const png of pngs) {
    const data = Buffer.concat(chunks(png).flatMap(c => (c.type === 'IDAT' ? [c.data] : [])));
    const last = runs.at(-1);
    if (last?.data.equals(data)) last.ticks++;
    else runs.push({ data, ticks: 1 });
  }
  const first = pngs[0];
  const ihdr = first && chunks(first).find(c => c.type === 'IHDR');
  if (!ihdr) throw new Error('no frames');
  const actl = Buffer.alloc(8);
  actl.writeUInt32BE(runs.length, 0);
  const parts = [first.subarray(0, 8), chunk('IHDR', ihdr.data), chunk('acTL', actl)];
  let seq = 0;
  runs.forEach((run, i) => {
    const fctl = Buffer.alloc(26);
    fctl.writeUInt32BE(seq++, 0);
    ihdr.data.copy(fctl, 4, 0, 8);
    fctl.writeUInt16BE(run.ticks, 20);
    fctl.writeUInt16BE(FPS, 22);
    parts.push(chunk('fcTL', fctl));
    if (i === 0) parts.push(chunk('IDAT', run.data));
    else {
      const n = Buffer.alloc(4);
      n.writeUInt32BE(seq++);
      parts.push(chunk('fdAT', Buffer.concat([n, run.data])));
    }
  });
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

// Phosphor marks its tinted layer with opacity="0.2", and Fenmyr's own icons use the classes s, f, t and t2.
const STYLE = `.s{fill:none;stroke:${INK};stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.f{fill:${INK}}.t{fill:${TINT};fill-opacity:.55}.t2{fill:${LEAF};fill-opacity:.55}`;

function iconInner(icon: (typeof ICONS)[number]) {
  if (icon.custom) {
    const own = custom[icon.custom];
    if (!own) throw new Error(`no icon named ${icon.custom}`);
    return own.d;
  }
  const svg = fs.readFileSync(path.join(PHOSPHOR, `${icon.phosphor}-duotone.svg`), 'utf8');
  return svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/\s+opacity="0\.2"/g, ' class="t"');
}

function iconSvg(icon: (typeof ICONS)[number]) {
  const inner = iconInner(icon);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" fill="${INK}"><style>${STYLE}</style>${inner}</svg>\n`;
}

fs.mkdirSync(OUT, { recursive: true });
for (const icon of ICONS) fs.writeFileSync(path.join(OUT, icon.file), iconSvg(icon));
for (const clip of CLIPS) {
  const file = path.join(OUT, clip.file);
  fs.writeFileSync(file, apng(await frames(clip)));
  console.log(`wrote ${path.relative(ROOT, file)} (${Math.round(fs.statSync(file).size / 1024)} KB)`);
}
console.log(`wrote ${ICONS.length} icons in ${path.relative(ROOT, OUT)}`);
