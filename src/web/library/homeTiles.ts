import type { Card } from '../../shared/model.ts';
import { child } from '../ui/dom.ts';
import { COLORS } from '../core/base.ts';
import { FBTN_OF } from './sidebarRows.ts';

export const miniCache = new Map<string, Promise<string>>();

export async function mini(id: string): Promise<string> {
  // a tiny map of the board: every card as a little colored block
  if (!miniCache.has(id))
    miniCache.set(
      id,
      Fenmyr.load(id).then(b => {
        const cs = (b && b.cards) || [];
        if (!cs.length) return '';
        const x0 = Math.min(...cs.map(c => c.x)),
          y0 = Math.min(...cs.map(c => c.y)),
          x1 = Math.max(...cs.map(c => c.x + c.w)),
          y1 = Math.max(...cs.map(c => c.y + c.h));
        const fill = (c: Card) =>
          c.type === 'swatch'
            ? c.hex
            : c.type === 'image'
              ? '#d9cfe0'
              : c.type === 'title'
                ? 'transparent'
                : (c.color && COLORS[c.color]) || '#fff';
        return (
          `<svg viewBox="${x0 - 40} ${y0 - 40} ${x1 - x0 + 80} ${y1 - y0 + 80}" preserveAspectRatio="xMidYMid meet">` +
          cs
            .map(c =>
              c.type === 'title'
                ? `<rect x="${c.x}" y="${c.y + c.h * 0.25}" width="${Math.min(c.w, 260)}" height="${c.h * 0.5}" rx="8" fill="#3b342d" opacity=".75"/>`
                : `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="14" fill="${fill(c)}" stroke="rgba(120,80,120,.12)" stroke-width="3" transform="rotate(${c.r || 0} ${c.x + c.w / 2} ${c.y + c.h / 2})"/>`,
            )
            .join('') +
          '</svg>'
        );
      }),
    );
  return miniCache.get(id) ?? '';
}

export function tile(
  kind: string,
  obj: { id: string; name: string },
  sub: string,
  onOpen: () => void,
  btns: [string, string, string][] = [],
) {
  const t = document.createElement('div');
  t.className = 'tile ' + kind;
  t.style.rotate = (((obj.id.charCodeAt(0) + obj.id.charCodeAt(1)) % 5) - 2) * 0.6 + 'deg';
  t.innerHTML = `<div class="tile-art"></div><div class="tile-meta"><b></b><small>${sub}</small>${btns.map(([a, tt, s]) => `<button class="f-btn" data-a="${a}" title="${tt}">${FBTN_OF(a) || s}</button>`).join('')}</div>`;
  child(t, '.tile-meta b').textContent = obj.name;
  t.onclick = e => {
    if ((e.target instanceof Element && e.target.closest('.f-btn')) || child(t, '.tile-meta b').isContentEditable)
      return;
    onOpen();
  };
  return t;
}

export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export const ago = (t: number) => {
  const s = Date.now() / 1000 - t,
    m = s / 60,
    h = m / 60,
    d = h / 24;
  return s < 90
    ? 'just now'
    : m < 60
      ? Math.round(m) + 'm ago'
      : h < 24
        ? Math.round(h) + 'h ago'
        : Math.round(d) + 'd ago';
};
