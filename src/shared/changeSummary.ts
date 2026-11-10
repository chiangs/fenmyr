// What Myra says a reply did to the board ("Changed on the board"), what a plan left alone, and what she says after
// Undo puts it back.
import { cardName, labelOf, nounOf } from './cardTypes.ts';
import type { BoardPatch, ChangeSet, Placed } from './changes.ts';
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
  const name = c.text?.trim() ? `, ${c.text.trim()}` : '',
    cards = c.kids.length ? plural(c.kids.length, 'card') : '',
    columns = c.kanban ? plural(c.colNames?.length ?? 0, 'column') : '',
    inside = [columns, cards].filter(Boolean).join(' and '),
    holding = inside ? `${name ? ',' : ''} with ${inside}` : '';
  return `+ 1 ${nounOf(c, 1)}${name}${holding}`;
}

// One line of the summary and the cards it covers, so a plan's preview can light that line's part.
export type Step = { line: string; cards: string[] };

// made: the collections the reply made, whose lines count the cards filed or moved into them
function addedSteps(
  added: readonly Placed<Card>[],
  made: ReadonlySet<string>,
  movedIn: readonly Placed<Card>[],
): Step[] {
  const colls = added.flatMap(p => (p.item.type === 'coll' ? [p.item] : [])),
    rest = added.flatMap(p => (p.item.type !== 'coll' && !made.has(p.in ?? '') ? [p.item] : [])),
    [one] = rest,
    name = one && rest.length === 1 && cardName(one) !== labelOf(one.type) ? `, “${cardName(one)}”` : '',
    filed = (coll: string) => [...added, ...movedIn].flatMap(p => (p.in === coll ? [p.item.id] : []));
  return [
    ...colls.map(c => ({ line: collectionLine(c), cards: [c.id, ...filed(c.id)] })),
    ...(rest.length ? [{ line: `+ ${counted(rest)}${name}`, cards: rest.map(c => c.id) }] : []),
  ];
}

const reworded = (a: Card, b: Card) =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter(k => !LAYOUT.has(k) && JSON.stringify(Reflect.get(a, k)) !== JSON.stringify(Reflect.get(b, k)))
    .every(k => WORDS.has(k));

// Worded when the reply lands, from the cards as they were then, so a card deleted later still reads as added.
export function summarySteps(record: BoardPatch, set: ChangeSet): Step[] {
  const deltas = new Map(record.cards.map(d => [d.id, d])),
    pick = (ids: readonly string[]) => ids.flatMap(id => deltas.get(id) ?? []),
    added = pick(set.added).flatMap(d => d.now ?? []),
    edited = pick(set.edited),
    removed = pick(set.removed).flatMap(d => d.was?.item ?? []),
    made = new Set(added.flatMap(p => (p.item.type === 'coll' ? [p.item.id] : []))),
    [moved, movedIn] = partition(pick(set.moved), d => !made.has(d.now?.in ?? '')),
    into = moved.every(d => d.now?.in && d.now.in !== d.was?.in) ? ' in' : '',
    outOf = moved.every(d => d.was?.in && !d.now?.in) ? ' out' : '',
    nowOf = (ds: typeof moved) => ds.flatMap(d => d.now?.item ?? []),
    ids = (ds: readonly { id: string }[]) => ds.map(d => d.id),
    links = set.links.added.length;
  return [
    ...addedSteps(
      added,
      made,
      movedIn.flatMap(d => d.now ?? []),
    ),
    ...(links ? [{ line: `+ ${plural(links, 'connector')}`, cards: [] }] : []),
    ...(moved.length ? [{ line: `→ ${counted(nowOf(moved))} moved${into || outOf}`, cards: ids(moved) }] : []),
    ...(edited.length
      ? [
          {
            line: `✎ ${counted(nowOf(edited))} ${edited.every(d => d.was && d.now && reworded(d.was.item, d.now.item)) ? 'reworded' : 'changed'}`,
            cards: ids(edited),
          },
        ]
      : []),
    ...(removed.length ? [{ line: `− ${counted(removed)} removed`, cards: ids(removed) }] : []),
  ];
}

export const summaryLines = (record: BoardPatch, set: ChangeSet) => summarySteps(record, set).map(s => s.line);

function partition<T>(xs: readonly T[], keep: (x: T) => boolean): [T[], T[]] {
  return [xs.filter(keep), xs.filter(x => !keep(x))];
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

export function namedList(cards: readonly Named[]) {
  const names = cards.slice(0, NAMED).map(c => `“${cardName(c)}”`),
    more = cards.length - names.length;
  return more ? `${names.join(', ')} and ${plural(more, 'more card', 'more cards')}` : names.join(' and ');
}

// After a plan lands: the cards she left because the person changed them after the plan, or nothing to say.
export function leftLine(left: readonly Named[]) {
  if (!left.length) return '';
  const one = left.length === 1;
  return `I left ${namedList(left)} as you have ${one ? 'it' : 'them'}, since ${one ? 'it' : 'they'} changed after my plan.`;
}

// skipped: the cards she left because they changed after the reply, whether the person or a later reply of hers
// changed them. back: how many were already as they were before it, as after Ctrl+Z.
export function undoLine({ undone, skipped, back }: { undone: number; skipped: readonly Named[]; back: number }) {
  const list = namedList(skipped),
    one = skipped.length === 1;
  if (!undone && skipped.length)
    return `${list} ${one ? 'has' : 'have'} changed since that reply, so I’ve left the board as it is.`;
  if (!undone && back) return 'That reply is already undone.';
  if (!undone) return 'Everything from that reply has changed since, so I’ve left the board as it is.';
  if (!skipped.length) return 'I’ve put the board back as it was before that reply.';
  return `I’ve put back what that reply changed, apart from ${list}, which ${one ? 'has' : 'have'} changed since. I’ve left ${one ? 'it as it is' : 'those as they are'}.`;
}
