import { card } from '../model/boards.ts';
import { say } from '../settings/licenses.ts';
import { addCard } from '../tools/penEdit.ts';
import type { Card } from '../../shared/model.ts';

type Rgb = [number, number, number];

// ---------- pulling colours out of an image ----------
export function pullColors(c: Card & { src?: string }) {
  const im = new Image();
  im.onload = () => {
    const cv = document.createElement('canvas');
    cv.width = 60;
    cv.height = Math.max(1, Math.round((60 * im.height) / im.width));
    const g = cv.getContext('2d');
    if (!g) return;
    g.drawImage(im, 0, 0, cv.width, cv.height);
    const d = g.getImageData(0, 0, cv.width, cv.height).data,
      buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] ?? 0,
        gr = d[i + 1] ?? 0,
        bl = d[i + 2] ?? 0,
        k = [r >> 5, gr >> 5, bl >> 5].join(','),
        b = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0 };
      b.n++;
      b.r += r;
      b.g += gr;
      b.b += bl;
      buckets.set(k, b);
    }
    const picks: Rgb[] = [];
    [...buckets.values()]
      .sort((a, b) => b.n - a.n)
      .forEach(b => {
        const c3: Rgb = [b.r / b.n, b.g / b.n, b.b / b.n];
        if (picks.length < 5 && picks.every(p => Math.hypot(p[0] - c3[0], p[1] - c3[1], p[2] - c3[2]) > 48))
          picks.push(c3);
      });
    const hex = (c3: Rgb) => '#' + c3.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    picks.forEach((p, i) =>
      addCard(
        card('swatch', {
          x: c.x + c.w + 30 + i * 128,
          y: c.y + (i % 2) * 18,
          hex: hex(p),
          label: ['main', 'second', 'accent', 'shadow', 'pop'][i],
        }),
      ),
    );
    say(`I pulled ${picks.length} colours out of that image ✦`);
  };
  im.src = c.src ?? '';
}
