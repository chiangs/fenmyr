import { typesWith } from '../../shared/cardTypes.ts';
import { type Card, readCards, readLinks } from '../../shared/model.ts';
import type { Template } from '../../shared/ops.ts';
import { byId } from '../canvas/wires.ts';
import { copyOf, uid } from '../core/base.ts';
import { session } from '../core/state.ts';
import { onFrame } from '../wireframe/tilt.ts';

// ---------- the cards in a template: copied out of a board, and copied back in with fresh ids ----------
const NO_KEEP = typesWith('notInTemplates');
// files and other boards stay out of templates; pictures become empty image spots
export function templateFrom(cs: Card[]) {
  const all = new Set(cs);
  cs.forEach(c => {
    if (c.type === 'coll')
      for (const k of c.kids) {
        const kid = byId(k);
        if (kid) all.add(kid);
      }
    if (c.type === 'frame')
      onFrame(c).forEach(k => {
        all.add(k);
      });
  });
  const kept = [...all].filter(c => !NO_KEEP.includes(c.type)),
    ids = new Set(kept.map(c => c.id));
  const x0 = Math.min(...kept.map(c => c.x)),
    y0 = Math.min(...kept.map(c => c.y));
  const cards = kept.map(c => {
    const o: Record<string, unknown> = { ...copyOf(c), x: Math.round(c.x - x0), y: Math.round(c.y - y0) };
    if (c.type === 'image') {
      o.type = 'box';
      o.img = 'Image';
      for (const k of ['src', 'crop', 'cropEdit']) delete o[k];
    }
    if (c.type === 'link') delete o.image;
    if (c.type === 'coll') {
      o.kids = c.kids.filter(k => ids.has(k));
      if (c.colOf) o.colOf = Object.fromEntries(Object.entries(c.colOf).filter(([k]) => ids.has(k)));
    }
    return o;
  });
  const links = copyOf(session.board.links.filter(l => ids.has(l.a) && ids.has(l.b)));
  return { cards, links };
}

// fresh ids for everything, so a template can be used again and again
export function instantiate(t: Template, dx: number, dy: number) {
  const ids: Record<string, string> = {},
    grp: Record<string, string> = {},
    source = readCards(copyOf(t.cards));
  source.forEach(c => {
    ids[c.id] = uid();
  });
  const newId = (id: string) => ids[id] ?? '';
  const cards: Card[] = source.map(c => {
    const o = { ...c, id: newId(c.id), x: c.x + dx, y: c.y + dy };
    if (o.type === 'coll') {
      o.kids = o.kids.map(newId).filter(Boolean);
      if (o.colOf)
        o.colOf = Object.fromEntries(
          Object.entries(o.colOf)
            .filter(([k]) => ids[k])
            .map(([k, v]) => [newId(k), v]),
        );
    }
    if (o.group) o.group = grp[o.group] ??= uid();
    return o;
  });
  return {
    cards,
    links: readLinks(t.links)
      .filter(l => ids[l.a] && ids[l.b])
      .map(l => ({ ...l, id: uid(), a: newId(l.a), b: newId(l.b) })),
  };
}
