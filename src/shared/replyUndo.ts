// Undo under one of Myra's replies: put back what it changed, from its record, except what the person changed since.
import { isMeasured } from './cardTypes.ts';
import { type BoardLists, type BoardPatch, copy, holdersOf, type Placed, placedById, same } from './changes.ts';
import type { Card, Link } from './model.ts';

// A card in a collection is placed and sized by it, and a title or a collection sizes itself, so those numbers are not
// the person's doing and don't make a card count as changed.
const LAID = new Set(['x', 'y', 'w', 'h', 'r']);
const MEASURED = new Set(['w', 'h']);

type State = Placed<Card | Link> | null | undefined;

function sameState(a: State, b: State) {
  if (!a || !b) return !a && !b;
  const drop = a.in ? LAID : 'type' in a.item && isMeasured(a.item.type) ? MEASURED : undefined;
  return a.at === b.at && a.in === b.in && same(a.item, b.item, drop);
}

// same: only the layout moved; back: already as it was (Ctrl+Z, or an Undo before); undo: still as she left it;
// skip: changed since
type Fate = 'same' | 'back' | 'undo' | 'skip';

function fateOf(d: { was: State; now: State }, cur: State): Fate {
  return sameState(d.was, d.now) ? 'same' : sameState(cur, d.was) ? 'back' : sameState(cur, d.now) ? 'undo' : 'skip';
}

// keep: cards not to touch, such as the one being typed in
function fates(record: BoardPatch, now: BoardLists, keep: ReadonlySet<string>) {
  const cur = placedById(now.cards, now.tray, holdersOf(now.cards)),
    curLinks = placedById(now.links, now.trayLinks ?? []),
    byId = new Map(record.cards.map(d => [d.id, d])),
    cards = new Map<string, Fate>(),
    skipped: string[] = [];
  const skip = (id: string) => {
    cards.set(id, 'skip');
    skipped.push(id);
  };
  for (const d of record.cards) {
    const f = fateOf(d, cur.get(d.id));
    if (f === 'skip' || (f === 'undo' && keep.has(d.id))) skip(d.id);
    else cards.set(d.id, f);
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
  const spotAfter = (id: string) => (cards.get(id) === 'undo' ? byId.get(id)?.was?.at : cur.get(id)?.at),
    joins = (l: Placed<Link> | null) => !l || (spotAfter(l.item.a) === l.at && spotAfter(l.item.b) === l.at),
    linkFates = record.links.map(d => ({ d, fate: fateOf(d, curLinks.get(d.id)) }));
  let linksBack: typeof record.links = [];
  for (let spread = true; spread; ) {
    spread = false;
    for (const [id, fate] of cards)
      if (fate === 'undo' && tied.get(id)?.some(t => cards.get(t) === 'skip')) {
        cards.set(id, 'skip');
        spread = true;
      }
    linksBack = linkFates.filter(({ d, fate }) => fate === 'undo' && joins(d.was)).map(({ d }) => d);
    // Undo removes only connectors it puts back as they were, so a card it would take away from a connector the reply
    // didn't make, such as one the person drew after it, counts as changed since and stays with it.
    const own = new Set(linksBack.map(d => d.id));
    for (const l of curLinks.values())
      if (!own.has(l.item.id))
        for (const end of [l.item.a, l.item.b])
          if (cards.get(end) === 'undo' && spotAfter(end) !== l.at) {
            skip(end);
            spread = true;
          }
  }
  return { cards, skipped, cur, byId, linksBack };
}

export function undoable(record: BoardPatch, now: BoardLists) {
  const { cards, linksBack } = fates(record, now, new Set());
  return [...cards.values()].includes('undo') || linksBack.length > 0;
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
    if (d.was) lists[d.was.at].splice(d.was.i, 0, copy(d.was.item));
}

// Never changes `now`, and keeps every card and connector it doesn't put back as the same object, so an editor holding
// one stays on the board. Running it again on what it returns puts back nothing more. It takes away nothing but what
// the reply made or changed, as she left it.
export function planUndo(record: BoardPatch, now: BoardLists, keep: ReadonlySet<string>): Undone {
  const { cards, skipped, cur, byId, linksBack } = fates(record, now, keep),
    lists: BoardLists = { cards: [...now.cards], tray: [...now.tray], links: [...now.links] },
    goes = record.cards.filter(d => cards.get(d.id) === 'undo'),
    trayLinks = [...(now.trayLinks ?? [])];
  putBack({ board: lists.cards, tray: lists.tray }, goes);
  putBack({ board: lists.links, tray: trayLinks }, linksBack);
  if (now.trayLinks || trayLinks.length) lists.trayLinks = trayLinks;
  return {
    lists,
    undone: goes.length + linksBack.length,
    skipped: skipped.flatMap(id => cur.get(id)?.item ?? byId.get(id)?.now?.item ?? []),
  };
}
