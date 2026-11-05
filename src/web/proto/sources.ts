import { labelOf } from '../../shared/cardTypes.ts';
import type { Card } from '../../shared/model.ts';
import type { Sources } from '../../shared/repos.ts';
import { fit } from '../canvas/handles.ts';
import { selectOnly } from '../canvas/wires.ts';
import { save } from '../core/history.ts';
import { session } from '../core/state.ts';
import { esc } from '../ui/dom.ts';

// Code linked back to the cards it came from: the builder names them for each file it writes, the board keeps that,
// and Myra's reply and the code pane offer each card, which a click selects and brings into view.
const MAX_BUTTONS = 4;

const cardById = (id: string) => session.board.cards.find(c => c.id === id);

// what a person calls a card: its own words, else its kind
function nameOf(c: Card) {
  const words = ['name', 'title', 'text', 'label']
    .map(k => Reflect.get(c, k))
    .find((v): v is string => typeof v === 'string' && v.trim() !== '');
  return (words?.trim().split('\n')[0] ?? labelOf(c.type)).slice(0, 40);
}

export function showCard(id: string) {
  const c = cardById(id);
  if (!c) return;
  selectOnly([id]);
  fit([c]);
}

// A build's sources, kept on the open prototype for cards still on it. A file keeps the cards of every build that
// wrote it. Returns the cards this build used.
export function keepSources(sources: Sources) {
  const b = session.board;
  if (b.kind !== 'prototype') return [];
  const next = { ...(b.proto.sources ?? {}) },
    used = new Set<string>();
  for (const [file, ids] of Object.entries(sources)) {
    const here = ids.filter(id => cardById(id));
    if (!here.length) continue;
    next[file] = [...new Set([...(next[file] ?? []), ...here])];
    for (const id of here) used.add(id);
  }
  if (!used.size) return [];
  b.proto = { ...b.proto, sources: next };
  save();
  return [...used];
}

// Myra's line naming the cards a build came from: their buttons don't outlast the window, so the words name them too
export function cardsLine(ids: string[]) {
  const names = ids.flatMap(id => {
    const c = cardById(id);
    return c ? [`“${nameOf(c)}”`] : [];
  });
  return `I built it from these cards on the board: ${names.join(', ')}.`;
}

// buttons under Myra's reply, one per card the build came from
export const cardButtons = (ids: string[]) =>
  ids.slice(0, MAX_BUTTONS).flatMap(id => {
    const c = cardById(id);
    return c ? [{ label: `↗ ${nameOf(c)}`, ghost: true, run: () => showCard(id) }] : [];
  });

// the code pane's row of the cards a file came from
export function fromCards(file: string) {
  const b = session.board;
  if (b.kind !== 'prototype') return '';
  const chips = (b.proto.sources?.[file] ?? [])
    .flatMap(id => {
      const c = cardById(id);
      if (!c) return [];
      const card = esc(c.id),
        name = esc(nameOf(c));
      return [`<button class="pc-card" data-card="${card}" title="Show this card on the board">${name}</button>`];
    })
    .join('');
  return chips ? `<div class="pc-from"><span>From the board</span>${chips}</div>` : '';
}
