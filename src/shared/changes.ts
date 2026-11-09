// What one Myra reply did to a board: every card and connector it changed, as it was and as it is now. The change set,
// the cards as they were before the reply, and an Undo all read this one record.
import type { Card, Link } from './model.ts';

export type BoardLists = {
  cards: Card[];
  tray: Card[];
  links: Link[];
  trayLinks?: Link[] | undefined;
};
type Spot = 'board' | 'tray';
// i: its index in that list, so an Undo puts it back in its place in the stack. in: the collection holding it, whose
// layout sets its place and size.
export type Placed<T> = { at: Spot; item: T; i: number; in?: string };
type Delta<T> = { id: string; was: Placed<T> | null; now: Placed<T> | null };
export type BoardPatch = { cards: Delta<Card>[]; links: Delta<Link>[] };

// Each card id is in at most one list. `relaid` maps a collection to the cards its layout shifted (the collection
// itself among them; '' for cards in none). `skipped` holds cards she left alone: the one the person was typing in, and
// any they changed between the plan and its landing.
export type ChangeSet = {
  added: string[];
  moved: string[];
  edited: string[];
  removed: string[];
  relaid: Record<string, string[]>;
  links: { added: string[]; removed: string[] };
  skipped: string[];
};

// what a collection's layout and filing change; a card whose only differences are these was moved, not edited
const SHAPE = new Set(['x', 'y', 'w', 'h', 'r', 'kids', 'colOf']);

// A deep copy that shares the strings, which can't change, so a picture's data URL is never copied and comparing it
// with the board's own is a pointer check.
export function copy<T>(v: T): T {
  if (typeof v !== 'object' || v === null) return v;
  const out = Object.assign(Array.isArray(v) ? [] : {}, v);
  for (const k of Object.keys(out)) Reflect.set(out, k, copy(Reflect.get(out, k)));
  return out;
}

const idOf = (v: unknown) => (typeof v === 'object' && v && 'id' in v && typeof v.id === 'string' ? v.id : undefined);

// Swaps each long string in `fresh` for the equal one at the same place in `old` (cards and connectors matched by id),
// so a board read back from saved text shares its pictures' data URLs again and comparing them stays a pointer check.
export function shareStrings(fresh: unknown, old: unknown) {
  if (typeof fresh !== 'object' || !fresh || typeof old !== 'object' || !old) return;
  const byId = Array.isArray(old) ? new Map(old.map(o => [idOf(o), o])) : undefined;
  for (const k of Object.keys(fresh)) {
    const v = Reflect.get(fresh, k),
      id = idOf(v),
      o = byId && id ? byId.get(id) : Reflect.get(old, k);
    if (typeof v !== 'string') shareStrings(v, o);
    else if (v.length > 1024 && v === o) Reflect.set(fresh, k, o);
  }
}

const defined = (o: object, drop?: ReadonlySet<string>) =>
  Object.keys(o).filter(k => Reflect.get(o, k) !== undefined && !drop?.has(k));

// Equal as JSON would be, without writing out a picture's data URL; `drop` leaves out keys at the top level only.
export function same(a: unknown, b: unknown, drop?: ReadonlySet<string>): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = defined(a, drop),
    kb = defined(b, drop);
  return ka.length === kb.length && ka.every(k => same(Reflect.get(a, k), Reflect.get(b, k)));
}

export const listsOf = (b: BoardLists): BoardLists =>
  copy({ cards: b.cards, tray: b.tray, links: b.links, trayLinks: b.trayLinks });

export function holdersOf(cards: readonly Card[]) {
  const holder = new Map<string, string>();
  for (const c of cards) if (c.type === 'coll') for (const k of c.kids) holder.set(k, c.id);
  return holder;
}

export function placedById<T extends { id: string }>(
  board: readonly T[],
  tray: readonly T[],
  holder: ReadonlyMap<string, string> = new Map(),
) {
  const m = new Map<string, Placed<T>>();
  const put = (at: Spot) => (item: T, i: number) => {
    const inside = holder.get(item.id);
    m.set(item.id, inside ? { at, item, i, in: inside } : { at, item, i });
  };
  tray.forEach(put('tray'));
  board.forEach(put('board'));
  return m;
}

function deltas<T extends { id: string }>(was: Map<string, Placed<T>>, now: Map<string, Placed<T>>): Delta<T>[] {
  const out: Delta<T>[] = [];
  for (const id of new Set([...was.keys(), ...now.keys()])) {
    const a = was.get(id) ?? null,
      b = now.get(id) ?? null;
    if (a && b && a.at === b.at && a.in === b.in && same(a.item, b.item)) continue;
    out.push({ id, was: a && { ...a, item: copy(a.item) }, now: b && { ...b, item: copy(b.item) } });
  }
  return out;
}

// `before` must be a copy taken before the change (listsOf), since a reply changes cards in place
export function recordOf(before: BoardLists, after: BoardLists): BoardPatch {
  return {
    cards: deltas(
      placedById(before.cards, before.tray, holdersOf(before.cards)),
      placedById(after.cards, after.tray, holdersOf(after.cards)),
    ),
    links: deltas(placedById(before.links, before.trayLinks ?? []), placedById(after.links, after.trayLinks ?? [])),
  };
}

// the same change the other way round: what it is now becomes what it was
export const reversed = (p: BoardPatch): BoardPatch => ({
  cards: p.cards.map(({ id, was, now }) => ({ id, was: now, now: was })),
  links: p.links.map(({ id, was, now }) => ({ id, was: now, now: was })),
});

// The cards a reply touched, less any its plan changes that landing left as it was. `landed` is taken before drawing,
// which puts a card she moved inside a kanban back in its column, and she still moved it. One she touched without
// planning a change to it, such as to the same words, stays.
export function landedTouched(touched: readonly string[], planned: BoardPatch, landed: BoardPatch) {
  const plans = new Set(planned.cards.map(d => d.id)),
    changed = new Set(landed.cards.map(d => d.id));
  return touched.filter(id => !plans.has(id) || changed.has(id));
}

export const onlyShape = (a: Card, b: Card) =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].every(
    k => SHAPE.has(k) || same(Reflect.get(a, k), Reflect.get(b, k)),
  );

// named: the ids the reply moved, edited, placed or removed by name, so a shift it asked for is a move, not a re-layout
export function changeSet(
  record: BoardPatch,
  { named, skipped }: { named: ReadonlySet<string>; skipped: readonly string[] },
): ChangeSet {
  const set: ChangeSet = {
    added: [],
    moved: [],
    edited: [],
    removed: [],
    relaid: {},
    links: { added: [], removed: [] },
    skipped: [...skipped],
  };
  for (const { id, was, now } of record.cards) {
    if (!now) set.removed.push(id);
    else if (!was || (was.at === 'tray' && now.at === 'board')) set.added.push(id);
    else if (was.at !== now.at || !onlyShape(was.item, now.item)) set.edited.push(id);
    else if (named.has(id)) set.moved.push(id);
    else {
      const under = now.item.type === 'coll' ? id : (now.in ?? '');
      set.relaid[under] = [...(set.relaid[under] ?? []), id];
    }
  }
  for (const { id, was, now } of record.links) {
    if (!now) set.links.removed.push(id);
    else if (!was || (was.at === 'tray' && now.at === 'board')) set.links.added.push(id);
  }
  return set;
}
