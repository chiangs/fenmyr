import type { BoardLists } from '../../shared/changes.ts';
import type { Card, CardOf } from '../../shared/model.ts';
import type { MyraReply } from '../../shared/myraReply.ts';
import { boxOf, nearestEmptySpot } from '../canvas/emptySpot.ts';
import { pullFromTray } from '../canvas/wires.ts';
import { arrange, COLL } from '../cards/collection.ts';
import { kanbanFields, placeInColumn } from '../cards/kanban.ts';
import { COLOR_NAMES, uid } from '../core/base.ts';
import { keepMyraText } from '../edit/noteBody.ts';
import { dueDate, hasDue } from '../features/due.ts';
import { cleanTags, existingTag } from '../features/tags.ts';
import { card } from '../model/boards.ts';
import { FS } from '../selbar/textSize.ts';
import { snapTo } from '../settings/licenses.ts';
import { buildScreen } from '../wireframe/screen.ts';
import { type HeldReply, MYRA_ADDS } from './applyTypes.ts';

type Point = { x: number; y: number };
type Coll = CardOf<'coll'>;
type Box = Point & { w: number; h: number };
// read from the screen before the board changes: the middle of the view and of its open part, the card being typed
// in, and where the middle of the view will be once cards placed in a box are shown
export type ViewAt = {
  center: Point;
  open: Point;
  editing: string | null;
  centreShowing: (made: Card[], box: Box) => Point;
};
type Edit = NonNullable<MyraReply['edit']>[number];

// the ids a reply names to move or edit, so a shift it asked for counts as a move rather than a re-layout
export const namedIn = (r: MyraReply) => new Set([...(r.move ?? []), ...(r.edit ?? [])].map(o => o.id));

// The board part of a reply, in the order its steps have always run. It changes only `b`: no drawing, no saving and
// no waiting, so it plans on a copy for a preview as well as on the open board. Ids it can’t find are skipped. So is
// the card being typed in, whose id it returns.
export function planBoard(b: BoardLists, held: HeldReply, view: ViewAt): string[] {
  const r = held.reply,
    skipped = new Set<string>(),
    byId = (id: string) => b.cards.find(c => c.id === id),
    colls = () => b.cards.filter((c): c is Coll => c.type === 'coll'),
    parentOf = (id: string) => colls().find(s => s.kids.includes(id)),
    arrangeAll = () => {
      for (const s of colls()) arrange(s, b.cards);
    },
    typedIn = (id: string) => {
      if (id === view.editing) skipped.add(id);
      return id === view.editing;
    };
  // her template's cards go in the empty space nearest the middle of the view, which then moves to them if it must
  let center = view.center;
  if (held.template?.mode === 'add') {
    const made = structuredClone(held.template.cards),
      others = [...b.cards];
    b.cards.push(...made);
    b.links.push(...structuredClone(held.template.links));
    arrangeAll();
    const { x: x0, y: y0, w, h } = boxOf(made),
      spot = nearestEmptySpot({ w, h }, view.open, others);
    for (const c of made) {
      c.x += spot.x - x0;
      c.y += spot.y - y0;
    }
    arrangeAll();
    center = view.centreShowing(made, { x: spot.x, y: spot.y, w, h });
  }
  // where a card she didn't place goes: the next spot in a grid around the middle of the view
  let i = 0;
  const place = (o: { x?: number | undefined; y?: number | undefined; type?: string | undefined }): Point => {
    if (o.x != null && o.y != null) return { x: o.x, y: o.y };
    const wide = o.type === 'font',
      at = {
        x: center.x - 300 + (i % 3) * (wide ? 330 : 250),
        y: center.y - 100 + Math.floor(i / 3) * (wide ? 240 : 170),
      };
    i++;
    return at;
  };
  // collections Myra makes, and cards she files into them (by collection id, or by the name of one she just made)
  const made: Record<string, Card> = {};
  for (const o of r.collections ?? []) {
    const s = card('coll', {
      ...place(o),
      text: o.name || o.text || '',
      color: o.color && COLL[o.color] ? o.color : 'pink',
      kids: [],
      r: 0,
      ...kanbanFields(o),
    });
    b.cards.push(s);
    made[(o.name || '').toLowerCase()] = s;
  }
  const leaveCollection = (c: Card) => {
    const from = parentOf(c.id);
    if (from) from.kids = from.kids.filter(x => x !== c.id);
  };
  const collFor = (k: string) =>
    byId(k)?.type === 'coll'
      ? byId(k)
      : made[k.toLowerCase()] || colls().find(s => s.text?.toLowerCase() === k.toLowerCase());
  const file = (c: Card, k: string, column?: string | number) => {
    const s = collFor(k);
    if (s?.type !== 'coll' || c.id === s.id) return;
    leaveCollection(c);
    s.kids.push(c.id);
    placeInColumn(s, c.id, column);
  };
  for (const o of r.add ?? []) {
    const c = card(MYRA_ADDS.find(t => t === o.type) ?? 'note', {
      font: o.type === 'font' ? o.font || o.text : o.font ? String(o.font) : undefined,
      body: o.type === 'doc' ? o.body || '' : undefined,
      ...place(o),
      text: o.type === 'font' ? o.sample || '' : o.text || '',
      color: o.color && COLOR_NAMES.includes(o.color) ? o.color : 'white',
      hex: o.hex,
      label: o.label ?? undefined,
      items: o.items
        ? o.items.map(t => (typeof t === 'string' ? { t, done: false } : { t: t.t, done: t.done === true }))
        : undefined,
      tagText: o.tag ?? undefined,
      name: o.name,
    });
    if (c.type === 'note' && o.text) keepMyraText(c, o.text);
    if (c.type === 'note' && cleanTags(o.tags).length) c.tags = cleanTags(o.tags).map(existingTag);
    if (hasDue(c) && o.due && dueDate(o.due)) c.due = o.due;
    b.cards.push(c);
    if (o.in) file(c, o.in, o.column);
  }
  for (const o of r.titles ?? []) b.cards.push(card('title', { ...place(o), text: o.text }));
  for (const o of r.place ?? []) {
    const c = b.tray.find(x => x.id === o.id);
    if (c) pullFromTray(b, c, place(o));
  }
  // every card she added so far has been laid out by now, so screens and pictures go beside where they really are
  arrangeAll();
  for (const o of r.move ?? []) {
    const c = byId(o.id);
    if (!c || o.x == null || typedIn(c.id)) continue;
    c.x = o.x;
    c.y = o.y ?? c.y;
    if (o.color && COLOR_NAMES.includes(o.color)) c.color = o.color;
  }
  for (const o of r.edit ?? []) {
    const c = byId(o.id) || b.tray.find(x => x.id === o.id);
    if (!c || typedIn(c.id)) continue;
    edit(c, o);
    if (o.in !== undefined) {
      if (o.in) file(c, o.in);
      else leaveCollection(c);
    }
  }
  const gone = new Set((r.remove ?? []).filter(id => !typedIn(id)));
  if (gone.size) {
    b.cards = b.cards.filter(c => !gone.has(c.id));
    b.tray = b.tray.filter(c => !gone.has(c.id));
    tidyTies(b);
    b.links = b.links.filter(l => !gone.has(l.a) && !gone.has(l.b));
  }
  for (const p of r.connect ?? []) {
    const [a, z] = Array.isArray(p) ? p : [p.a, p.b];
    if (byId(a) && byId(z)) b.links.push({ id: uid(), a, b: z });
  }
  // wireframes: real screens built from the pieces, left to right, with arrows for the flow
  if (r.screens?.length) {
    let sx = b.cards.length ? Math.max(...b.cards.map(c => c.x + c.w)) + 160 : center.x - 200,
      prev: Card | null = null;
    const sy = b.cards.length ? Math.min(...b.cards.map(c => c.y)) : center.y - 400;
    for (const sp of r.screens) {
      const { f, made } = buildScreen(sp, sx, sy);
      b.cards.push(...made);
      const noFlow = typeof sp === 'object' && sp !== null && 'flow' in sp && sp.flow === false;
      if (prev && !noFlow) b.links.push({ id: uid(), a: prev.id, b: f.id, arrow: true });
      prev = f;
      sx += f.w + 140;
    }
  }
  // pictures (Mobbin screens, Higgsfield images), laid out in a row of tilted cards
  if (held.pictures.length) {
    const base = {
      x: Math.max(...b.cards.map(c => c.x + c.w), center.x - 300) + 80,
      y: Math.min(...b.cards.map(c => c.y), center.y),
    };
    held.pictures.forEach((p, k) => {
      b.cards.push(
        card('image', {
          src: p.src,
          w: p.w,
          h: p.h,
          x: p.x ?? base.x + (k % 4) * 270,
          y: p.y ?? base.y + Math.floor(k / 4) * 560,
          tagText: p.caption,
        }),
      );
    });
  }
  // notes she says she used land on the board as vault note cards
  held.notes.forEach((n, k) => {
    const c = card('vnote', {
      vault: n.vaultId,
      path: n.rel,
      title: n.title,
      tags: n.tags,
      props: n.props,
      excerpt: n.excerpt,
      color: 'lilac',
    });
    c.x = snapTo(center.x - 460 + (k % 3) * (c.w + 20));
    c.y = snapTo(center.y + 140 + Math.floor(k / 3) * (c.h + 20));
    b.cards.push(c);
  });
  return [...skipped];
}

function edit(c: Card, o: Edit) {
  if (o.text != null) {
    if (c.type === 'link') c.title = o.text;
    else if (c.type === 'note') keepMyraText(c, o.text);
    else c.text = o.text;
  }
  if (o.desc != null) c.desc = o.desc;
  if (o.body != null && c.type === 'doc') {
    c.body = o.body;
    c.doc = undefined;
  }
  if (o.items && c.type === 'todo') {
    const before = c.items;
    c.items = o.items.map((t, k) => ({
      t: typeof t === 'string' ? t : t.t,
      done: (typeof t === 'object' && t.done) || (before?.[k]?.t === t && before[k].done) || false,
    }));
  }
  if (o.color && COLOR_NAMES.includes(o.color)) c.color = o.color;
  if (o.tag !== undefined) {
    if (o.tag) c.tagText = o.tag;
    else delete c.tagText;
  }
  if (Array.isArray(o.tags) && c.type === 'note') {
    c.tags = cleanTags(o.tags).map(existingTag);
    if (!c.tags.length) delete c.tags;
  }
  if (o.due !== undefined && hasDue(c)) {
    if (o.due && dueDate(o.due)) c.due = o.due;
    else delete c.due;
  }
  if (o.hex && /^#[0-9a-f]{6}$/i.test(o.hex)) c.hex = o.hex.toLowerCase();
  if (o.label != null) c.label = o.label;
  if (o.bold !== undefined) c.bold = o.bold;
  if (o.italic !== undefined) c.italic = o.italic;
  if (o.under !== undefined) c.under = o.under;
  if (o.strike !== undefined) c.strike = o.strike;
  if (o.size && FS[o.size]) {
    if (o.size === 'm') delete c.fs;
    else c.fs = o.size;
  }
  if (o.name != null && c.type === 'note') c.name = o.name;
}

// a tied card that lost its partners (she removed them) is just an ordinary item again
function tidyTies(b: BoardLists) {
  const n: Record<string, number> = {};
  for (const c of b.tray) if (c.tie) n[c.tie] = (n[c.tie] || 0) + 1;
  for (const c of b.tray) if (c.tie && (n[c.tie] ?? 0) < 2) delete c.tie;
  const ids = new Set(b.tray.map(c => c.id));
  b.trayLinks = (b.trayLinks || []).filter(l => ids.has(l.a) && ids.has(l.b));
  if (!b.trayLinks.length) delete b.trayLinks;
}
