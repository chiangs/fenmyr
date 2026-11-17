import type { Card, CardOf } from '../../shared/model.ts';
import { pickerFor, toggleSwap } from '../wireframe/piecePick.ts';
import { caret, FOLD_PIECE, G } from './barKit.ts';
import { cards, group, onBar } from './group.ts';

const isIcon = (c: Card): c is CardOf<'icon'> => c.type === 'icon';

/** Change icon, for icons alone: the first one's glyph, opening the Pieces picker on its icons to swap every one. */
export const changeIcon = group({
  on: (ctx): [CardOf<'icon'>, ...CardOf<'icon'>[]] | null => {
    const cs: Card[] = cards(ctx) ?? [],
      icons = cs.filter(isIcon),
      [first, ...rest] = icons;
    return first && icons.length === cs.length ? [first, ...rest] : null;
  },
  html: icons => {
    const glyph = Icon(icons[0].name ?? 'star', { size: 18 }),
      ids = icons.map(c => c.id).join(),
      p = pickerFor(),
      open = String(p?.kind === 'swap' && p.ids.join() === ids),
      read = `Change icon, ${(icons[0].name ?? 'star').replace(/-/g, ' ')}`,
      CARET = caret();
    return G(
      FOLD_PIECE,
      `<button class="sb-txt sb-chicon" data-chicon="${ids}" title="Change icon" aria-label="${read}" aria-haspopup="dialog" aria-expanded="${open}">${glyph}${CARET}</button>`,
    );
  },
  init: () => onBar('chicon', ids => toggleSwap(ids.split(','))),
});
