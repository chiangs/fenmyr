import type { ContextUse } from '../../shared/contextFit.ts';
import { fit } from '../canvas/handles.ts';
import { selectOnly } from '../canvas/selection.ts';
import { session } from '../core/state.ts';
import type { Piece } from './acts.ts';

/** The cards that weren't sent whole, with their picture or at all, that are still on the board, as a button that
 *  selects them there and brings them into view. Only while `board`, which they were sent from, is the open one, and not
 *  after it has been left, as when her bubble outlasts the board. Pressing it takes nothing away from the block it is
 *  under. */
export function leftOutButton(use: ContextUse, board: string): Piece[] {
  const b = session.board;
  if (b?.id !== board) return [];
  const ids = new Set([...use.left, ...use.pictures, ...use.unseen, ...use.tooBig, ...use.shortened]),
    here = b.cards.filter(c => ids.has(c.id));
  if (!here.length) return [];
  const run = () => {
    selectOnly(here.map(c => c.id));
    fit(here);
  };
  return [
    {
      slot: 'other',
      button: { label: 'Select these cards', ghost: true, after: 'stay', live: () => session.board?.id === board, run },
    },
  ];
}
