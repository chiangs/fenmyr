import { MAX_PICTURES } from '../../shared/contextFit.ts';
import type { Card, CardOf } from '../../shared/model.ts';
import type { Ops } from '../../shared/ops.ts';
import { cardEl } from '../ui/dom.ts';

// What the builder sees of the cards, not just their words: image cards as they are, drawings drawn out, and wireframe
// screens captured as they look on the canvas, in the cards' order up to the most a build takes. A card whose picture
// isn't sent is named by why, so the host can say so: its screen was out of view, the picture was too big, or the build
// had its pictures already. A picture that can't be read is left out without a word.
type Sent = Pick<Ops['protoBuild']['args'], 'pictures' | 'unseen' | 'tooBig' | 'over'>;
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

// a wireframe screen as it looks right now, or null when it isn't on screen
async function screen(c: Card) {
  const r = cardEl(c.id)?.getBoundingClientRect();
  if (!r || r.width < 4 || r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) return null;
  return Fenmyr.captureArea({ x: r.left, y: r.top, w: r.width, h: r.height });
}

export const hasPicture = (c: Card) => (c.type === 'image' ? !!c.src : c.type === 'ink' || c.type === 'frame');

const pictureOf = (c: Card) =>
  c.type === 'image' && c.src ? imageOf(c.src) : c.type === 'ink' ? drawing(c) : c.type === 'frame' ? screen(c) : null;

export async function picturesOf(cards: readonly Card[]): Promise<Sent> {
  const sent: Sent = { pictures: [], unseen: [], tooBig: [], over: [] };
  for (const c of cards) {
    if (!hasPicture(c)) continue;
    if (sent.pictures.length >= MAX_PICTURES) {
      sent.over.push(c.id);
      continue;
    }
    const data = await Promise.resolve(pictureOf(c)).catch(() => undefined);
    if (data === null && c.type === 'frame') sent.unseen.push(c.id);
    else if (!data) continue;
    else if (data.length >= MAX_BYTES) sent.tooBig.push(c.id);
    else sent.pictures.push({ id: c.id, name: `${c.type} ${c.name || c.text || c.id}`, data });
  }
  return sent;
}
