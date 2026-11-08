// Undo under one of Myra's replies: put back what it changed, from its record, except what the person changed since.
import { isMeasured } from './cardTypes.ts';
import { type BoardLists, type BoardPatch, holdersOf, listsOf, type Placed, placedById } from './changes.ts';
import type { Card, Link } from './model.ts';

// A card in a collection is placed and sized by it, and a title or a collection sizes itself, so those numbers are not
// the person's doing and don't make a card count as changed.
const LAID = new Set(['x', 'y', 'w', 'h', 'r']);
const MEASURED = new Set(['w', 'h']);

function stateOf(p: Placed<Card | Link> | null | undefined) {
  if (!p) return 'gone';
  const drop = p.in ? LAID : 'type' in p.item && isMeasured(p.item.type) ? MEASURED : null,
    kept = drop ? Object.fromEntries(Object.entries(p.item).filter(([k]) => !drop.has(k))) : p.item;
  return JSON.stringify([p.at, p.in ?? '', kept]);
}

// same: only the layout moved; back: already as it was (Ctrl+Z, or an Undo before); undo: still as she left it;
// skip: changed since
type Fate = 'same' | 'back' | 'undo' | 'skip';

function fateOf(d: { was: Placed<Card | Link> | null; now: Placed<Card | Link> | null }, cur?: Placed<Card | Link>) {
  const was = stateOf(d.was),
    now = stateOf(d.now),
    here = stateOf(cur);
  return was === now ? 'same' : here === was ? 'back' : here === now ? 'undo' : 'skip';
}

// keep: cards not to touch, such as the one being typed in
function fates(record: BoardPatch, now: BoardLists, keep: ReadonlySet<string>) {
  const cur = placedById(now.cards, now.tray, holdersOf(now.cards)),
    cards = new Map<string, Fate>(),
    skipped: string[] = [];
  for (const d of record.cards) {
    const f = fateOf(d, cur.get(d.id));
    const held = f === 'undo' && keep.has(d.id);
    if (f === 'skip' || held) skipped.push(d.id);
    cards.set(d.id, held ? 'skip' : f);
  }
  // A collection and the cards in it go back together or not at all, so a card is never put back into a collection
  // left as the person has it, nor left in one that is put back.
  const tied = new Map<string, string[]>(),
    tie = (a: string, b: string) => tied.set(a, [...(tied.get(a) ?? []), b]);
  for (const d of record.cards)
    for (const holder of new Set([d.was?.in, d.now?.in, cur.get(d.id)?.in]))
      if (holder) {
        tie(d.id, holder);
        tie(holder, d.id);
      }
  for (let spread = true; spread; ) {
    spread = false;
    for (const [id, fate] of cards)
      if (fate === 'undo' && tied.get(id)?.some(t => cards.get(t) === 'skip')) {
        cards.set(id, 'skip');
        spread = true;
      }
  }
  return { cards, skipped, cur };
}

export function undoable(record: BoardPatch, now: BoardLists) {
  const links = placedById(now.links, now.trayLinks ?? []);
  return (
    [...fates(record, now, new Set()).cards.values()].includes('undo') ||
    record.links.some(d => fateOf(d, links.get(d.id)) === 'undo')
  );
}

export type Undone = { lists: BoardLists; undone: number; skipped: Card[] };

function putBack<T extends { id: string }>(
  lists: Record<'board' | 'tray', T[]>,
  ds: readonly { id: string; was: Placed<T> | null; now: Placed<T> | null }[],
) {
  for (const d of ds) {
    const list = d.now && lists[d.now.at],
      at = list ? list.findIndex(x => x.id === d.id) : -1;
    if (list && at >= 0) list.splice(at, 1);
  }
  for (const d of [...ds].sort((a, b) => (a.was?.i ?? 0) - (b.was?.i ?? 0)))
    if (d.was) lists[d.was.at].splice(d.was.i, 0, structuredClone(d.was.item));
}

// Never changes `now`. Running it again on what it returns puts back nothing more.
export function planUndo(record: BoardPatch, now: BoardLists, keep: ReadonlySet<string>): Undone {
  const { cards, skipped, cur } = fates(record, now, keep),
    lists = listsOf(now),
    goes = record.cards.filter(d => cards.get(d.id) === 'undo');
  putBack({ board: lists.cards, tray: lists.tray }, goes);
  const trayLinks = lists.trayLinks ?? [],
    on = { board: new Set(lists.cards.map(c => c.id)), tray: new Set(lists.tray.map(c => c.id)) },
    curLinks = placedById(now.links, now.trayLinks ?? []),
    joins = (l: Placed<Link> | null) => !l || (on[l.at].has(l.item.a) && on[l.at].has(l.item.b)),
    linksBack = record.links.filter(d => fateOf(d, curLinks.get(d.id)) === 'undo' && joins(d.was));
  putBack({ board: lists.links, tray: trayLinks }, linksBack);
  lists.links = lists.links.filter(l => on.board.has(l.a) && on.board.has(l.b));
  const tray = trayLinks.filter(l => on.tray.has(l.a) && on.tray.has(l.b));
  if (now.trayLinks || tray.length) lists.trayLinks = tray;
  else delete lists.trayLinks;
  const byId = new Map(record.cards.map(d => [d.id, d]));
  return {
    lists,
    undone: goes.length + linksBack.length,
    skipped: skipped.flatMap(id => cur.get(id)?.item ?? byId.get(id)?.now?.item ?? []),
  };
}
