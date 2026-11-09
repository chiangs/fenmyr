import { cardName } from '../../shared/cardTypes.ts';
import type { ChatAction } from '../../shared/chat.ts';
import type { Sources } from '../../shared/repos.ts';
import { fit } from '../canvas/handles.ts';
import { selectOnly } from '../canvas/wires.ts';
import { save } from '../core/history.ts';
import { session } from '../core/state.ts';
import type { SayAction } from '../myra/say.ts';
import { esc } from '../ui/dom.ts';

// Code linked back to the cards it came from: the builder names them for each file it writes, the board keeps that,
// and Myra's reply and the code pane offer each card, which a click selects and brings into view.
const MAX_BUTTONS = 4;

const cardById = (id: string) => session.board.cards.find(c => c.id === id);

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
    return c ? [`“${cardName(c)}”`] : [];
  });
  return `I built it from these cards on the board: ${names.join(', ')}.`;
}

// buttons under Myra's reply, one per card the build came from
export const cardButtons = (ids: string[]): ChatAction[] =>
  ids
    .slice(0, MAX_BUTTONS)
    .filter(id => cardById(id))
    .map(card => ({ kind: 'source', card }));

// a stored card button, while its card is still on the board
export function sourceButton(id: string): SayAction | null {
  const c = cardById(id);
  return c ? { label: `↗ ${cardName(c)}`, ghost: true, run: () => showCard(id) } : null;
}

// the code pane's row of the cards a file came from
export function fromCards(file: string) {
  const b = session.board;
  if (b.kind !== 'prototype') return '';
  const chips = (b.proto.sources?.[file] ?? [])
    .flatMap(id => {
      const c = cardById(id);
      if (!c) return [];
      const card = esc(c.id),
        name = esc(cardName(c));
      return [`<button class="pc-card" data-card="${card}" title="Show this card on the board">${name}</button>`];
    })
    .join('');
  return chips ? `<div class="pc-from"><span>From the board</span>${chips}</div>` : '';
}
