import { byId } from '../core/state.ts';
import { togglePieces } from '../wireframe/pieceAuto.ts';
import { pickerScreen } from '../wireframe/piecePick.ts';
import { screenOf } from '../wireframe/screenScope.ts';
import { SEP } from './barKit.ts';
import { cards, group, onBar } from './group.ts';

// Pieces, for a screen or anything on one: it opens and hides the picker beside that screen. It never folds into ···.
export const pieces = group({
  on: ctx => {
    const cs = cards(ctx);
    return cs && screenOf(cs);
  },
  html: screen => {
    const id = screen.id,
      open = String(pickerScreen() === id);
    return `<button class="sb-txt" data-pieces="${id}" aria-haspopup="dialog" aria-expanded="${open}" title="Add pieces to this screen">Pieces</button>${SEP}`;
  },
  init: () =>
    onBar('pieces', id => {
      const s = byId(id);
      if (s?.type === 'frame') togglePieces(s);
    }),
});
