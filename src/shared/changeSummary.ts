// What Myra says a reply did to the board ("Changed on the board"), and what she says after Undo puts it back.
import { cardName, labelOf, nounOf } from './cardTypes.ts';
import type { BoardPatch, ChangeSet } from './changes.ts';
import type { StoredChangeSet } from './chat.ts';
import type { Card } from './model.ts';

type Named = { type: string };

// fields that hold a card's words: an edit that changed only these (and the layout they pushed) rewords it
const WORDS = new Set(['text', 'name', 'title', 'body', 'label', 'items', 'desc', 'doc']);
const LAYOUT = new Set(['x', 'y', 'w', 'h', 'r', 'kids', 'colOf']);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// one kind gives its own word ("3 notes"); a mix gives "cards"
function counted(cards: readonly Named[]) {
  const n = cards.length,
    nouns = new Set(cards.map(c => nounOf(c, n)));
  const [only] = nouns;
  return nouns.size === 1 && only ? `${n} ${only}` : plural(n, 'card');
}

function collectionLine(c: Extract<Card, { type: 'coll' }>) {
  const name = c.text?.trim() ? `, ${c.text.trim()},` : '',
    inside = c.kanban ? plural(c.colNames?.length ?? 0, 'column') : plural(c.kids.length, 'card');
  return `+ 1 ${nounOf(c, 1)}${name} with ${inside}`;
}

function addedLines(cards: readonly Card[], holder: ReadonlyMap<string, string | undefined>) {
  const ids = new Set(cards.map(c => c.id)),
    colls = cards.filter(c => c.type === 'coll'),
    // a card filed into a collection she also made is counted in that collection's line
    rest = cards.filter(c => c.type !== 'coll' && !ids.has(holder.get(c.id) ?? '')),
    [one] = rest,
    name = one && rest.length === 1 && cardName(one) !== labelOf(one.type) ? `, “${cardName(one)}”` : '';
  return [...colls.map(collectionLine), ...(rest.length ? [`+ ${counted(rest)}${name}`] : [])];
}

const reworded = (a: Card, b: Card) =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter(k => !LAYOUT.has(k) && JSON.stringify(Reflect.get(a, k)) !== JSON.stringify(Reflect.get(b, k)))
    .every(k => WORDS.has(k));

// Worded when the reply lands, from the cards as they were then, so a card deleted later still reads as added.
export function summaryLines(record: BoardPatch, set: ChangeSet): string[] {
  const deltas = new Map(record.cards.map(d => [d.id, d])),
    pick = (ids: readonly string[]) => ids.flatMap(id => deltas.get(id) ?? []),
    added = pick(set.added).flatMap(d => d.now ?? []),
    moved = pick(set.moved),
    edited = pick(set.edited),
    removed = pick(set.removed).flatMap(d => d.was?.item ?? []),
    holder = new Map(added.map(p => [p.item.id, p.in])),
    movedIn = moved.every(d => d.now?.in && d.now.in !== d.was?.in),
    nowOf = (ds: typeof moved) => ds.flatMap(d => d.now?.item ?? []),
    links = set.links.added.length;
  return [
    ...addedLines(
      added.map(p => p.item),
      holder,
    ),
    ...(links ? [`+ ${plural(links, 'connector')}`] : []),
    ...(moved.length ? [`→ ${counted(nowOf(moved))} moved${movedIn ? ' in' : ''}`] : []),
    ...(edited.length
      ? [
          `✎ ${counted(nowOf(edited))} ${edited.every(d => d.was && d.now && reworded(d.was.item, d.now.item)) ? 'reworded' : 'changed'}`,
        ]
      : []),
    ...(removed.length ? [`− ${counted(removed)} removed`] : []),
  ];
}

// for a reply kept before the summary was: counts only, since its cards may be long gone
export function countLines(set: StoredChangeSet): string[] {
  const n = (l?: readonly string[]) => l?.length ?? 0;
  return [
    ...(n(set.added) ? [`+ ${plural(n(set.added), 'card')}`] : []),
    ...(n(set.links?.added) ? [`+ ${plural(n(set.links?.added), 'connector')}`] : []),
    ...(n(set.moved) ? [`→ ${plural(n(set.moved), 'card')} moved`] : []),
    ...(n(set.edited) ? [`✎ ${plural(n(set.edited), 'card')} changed`] : []),
    ...(n(set.removed) ? [`− ${plural(n(set.removed), 'card')} removed`] : []),
  ];
}

const NAMED = 2;

// skipped: the cards she left because the person changed them after the reply
export function undoLine({ undone, skipped }: { undone: number; skipped: readonly Named[] }) {
  if (!undone) return 'You’ve changed everything from that reply since, so I’ve left the board as it is.';
  if (!skipped.length) return 'I’ve put the board back as it was before that reply.';
  const names = skipped.slice(0, NAMED).map(c => `“${cardName(c)}”`),
    more = skipped.length - names.length,
    list = more ? `${names.join(', ')} and ${plural(more, 'more card', 'more cards')}` : names.join(' and '),
    one = skipped.length === 1;
  return `I’ve put back what that reply changed, apart from ${list}, which you’ve changed since. I’ve left ${one ? 'it' : 'those'} as you have ${one ? 'it' : 'them'}.`;
}
