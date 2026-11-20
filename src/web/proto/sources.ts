import { cardName } from '../../shared/cardTypes.ts';
import type { Board } from '../../shared/model.ts';
import type { Sources } from '../../shared/repos.ts';
import { fit } from '../canvas/handles.ts';
import { selectOnly } from '../canvas/selection.ts';
import { session } from '../core/state.ts';
import type { SayAction } from '../myra/say.ts';
import { esc } from '../ui/dom.ts';

// Code linked back to the cards it came from: the builder names them for each file it writes, the board keeps that,
// and the build's block and the code pane offer each card, which a click selects and brings into view.
const cardOn = (b: Board, id: string) => b.cards.find(c => c.id === id);
const cardById = (id: string) => cardOn(session.board, id);

export function showCard(id: string) {
  const c = cardById(id);
  if (!c) return;
  selectOnly([id]);
  fit([c]);
}

// A build's sources, kept on its prototype, open or not, for cards still on it. A file keeps the cards of every build
// that wrote it. Returns the cards this build used. The caller writes the board.
export function keepSources(b: Board, sources: Sources) {
  if (b.kind !== 'prototype') return [];
  const next = { ...(b.proto.sources ?? {}) },
    used = new Set<string>();
  for (const [file, ids] of Object.entries(sources)) {
    const here = ids.filter(id => cardOn(b, id));
    if (!here.length) continue;
    next[file] = [...new Set([...(next[file] ?? []), ...here])];
    for (const id of here) used.add(id);
  }
  if (!used.size) return [];
  b.proto = { ...b.proto, sources: next };
  return [...used];
}

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
