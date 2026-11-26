import { isGuide } from '../../shared/guides.ts';
import { placeInView } from '../canvas/handles.ts';
import { selectOnly } from '../canvas/selection.ts';
import { save } from '../core/history.ts';
import { session } from '../core/state.ts';
import { chirp } from '../myra/say.ts';
import { settings } from '../settings/settings.ts';
import { addCard } from '../tools/penEdit.ts';
import { guideCards } from './welcome.ts';

// Prototypes made before they came with rules and design cards: after a build, Myra offers the two cards once per
// board, as she offers wireframes once (frameTip). Any answer, or none, has been the offer.
const OFFERED = 'fenmyr:guidesOffered';
// stored in place of a board's id, it stands for all of them: no board is offered the cards
const EVERY_BOARD = '*';

function offeredBoards(): string[] {
  try {
    const told: unknown = JSON.parse(localStorage.getItem(OFFERED) || '[]');
    return Array.isArray(told) ? told.filter(x => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function addGuides(board: string) {
  // the offer stays in the chat of the board it was made on, which may have been closed since
  if (session.board.id !== board || session.board.cards.some(isGuide)) return;
  const made = guideCards(0, 0);
  for (const c of made) addCard(c);
  placeInView(made);
  save();
  selectOnly(made.map(c => c.id));
}

/** A build has finished on the open board. */
export function offerGuides() {
  const b = session.board;
  // a quiet Myra says nothing, so the offer waits for a time she can make it
  if (b.kind !== 'prototype' || b.cards.some(isGuide) || settings.chat === 'quiet') return;
  const seen = offeredBoards();
  if (seen.includes(b.id) || seen.includes(EVERY_BOARD)) return;
  try {
    localStorage.setItem(OFFERED, JSON.stringify([...seen, b.id]));
  } catch {}
  chirp(
    'I can keep rules and design just for this prototype, on top of the repo’s. Shall I add the two cards?',
    12000,
    [
      { label: 'Add them', cls: 'next', run: () => addGuides(b.id) },
      { label: 'Not now', ghost: true, run: () => {} },
    ],
  );
}
