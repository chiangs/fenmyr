import type { Card, CardOf } from '../../shared/model.ts';
import { cardEl } from '../ui/dom.ts';

// What the builder sees of the cards, not just their words: image cards as they are, drawings drawn out, and wireframe
// screens captured as they look on the canvas. At most six, each small enough to send.
type Picture = { name: string; data: string };
const MAX_BYTES = 3_000_000;

const asData = (blob: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

async function imageOf(src: string) {
  if (src.startsWith('data:image/')) return src;
  return asData(await (await fetch(src)).blob());
}

function drawing(c: CardOf<'ink'>) {
  const scale = Math.min(1, 1200 / Math.max(c.ow, c.oh, 1)),
    canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(c.ow * scale));
  canvas.height = Math.max(1, Math.round(c.oh * scale));
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.strokeStyle = c.ink ?? '#222';
  g.lineWidth = (typeof c.size === 'number' ? c.size : 4) * scale;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  for (const [i, [x, y]] of c.pts.entries()) {
    if (i) g.lineTo(x * scale, y * scale);
    else g.moveTo(x * scale, y * scale);
  }
  g.stroke();
  return canvas.toDataURL('image/png');
}

// a wireframe screen as it looks right now, when it's on screen
async function screen(c: Card) {
  const r = cardEl(c.id)?.getBoundingClientRect();
  if (!r || r.width < 4 || r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) return null;
  return Fenmyr.captureArea({ x: r.left, y: r.top, w: r.width, h: r.height });
}

const pictureOf = (c: Card) =>
  c.type === 'image' && c.src ? imageOf(c.src) : c.type === 'ink' ? drawing(c) : c.type === 'frame' ? screen(c) : null;

export async function picturesOf(cards: Card[]): Promise<Picture[]> {
  const out: Picture[] = [];
  for (const c of cards) {
    if (out.length >= 6) break;
    const data = await Promise.resolve(pictureOf(c)).catch(() => null);
    if (data && data.length < MAX_BYTES) out.push({ name: `${c.type} ${c.name || c.text || c.id}`, data });
  }
  return out;
}
