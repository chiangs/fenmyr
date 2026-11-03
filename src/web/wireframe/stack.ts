import type { Card } from '../../shared/model.ts';
import { renderCard } from '../canvas/render.ts';
import { renderWires, selectOnly } from '../canvas/wires.ts';
import { uid } from '../core/base.ts';
import { $, cardsEl } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { session } from '../core/state.ts';
import { LY, layersSoon } from '../panels/layers.ts';
import { selCards } from '../selbar/selected.ts';
import { chirp } from '../settings/licenses.ts';
import { cardEl } from '../ui/dom.ts';
import { onFrame } from './tilt.ts';

// ---------- stacking: bring to front / forward, send backward / to back. Later in board.cards = higher on the board, and Layers lists it top-first ----------
// groups move as one, a frame brings everything on it along, and a card on a frame never goes behind its frame
export function restack(where: 'front' | 'back' | 'forward' | 'backward') {
  const cs = selCards();
  if (!cs.length || !session.board) return;
  // sections always sit behind cards, so they stack among themselves; a screen stacks like a card and brings its pieces along
  const box = (c: Card) => c.type === 'section',
    boxes = cs.every(box),
    peer = (c: Card) => !boxes || box(c);
  // a whole group you selected moves as one (all its pieces are selected); a piece picked out of a group moves on its own
  const ids = new Set<string>();
  cs.forEach(c => {
    ids.add(c.id);
    if (c.type === 'frame' && !boxes)
      onFrame(c).forEach(k => {
        ids.add(k.id);
      });
  });
  const all = session.board.cards,
    moving = all.filter(c => ids.has(c.id)),
    rest = all.filter(c => !ids.has(c.id)),
    idx = all.map((c, i) => (ids.has(c.id) ? i : -1)).filter(i => i >= 0);
  const seen = (c: Card) => !ids.has(c.id) && !c.hidden && peer(c);
  let at: number;
  if (where === 'front') at = boxes ? rest.reduce((n, c, i) => (box(c) ? i + 1 : n), 0) : rest.length;
  else if (where === 'back') at = 0;
  else if (where === 'forward') {
    const i = all.findIndex((c, k) => k > Math.max(...idx) && seen(c));
    const above = all[i];
    if (!above) return;
    at = rest.indexOf(above) + 1;
  } else {
    let i = -1;
    for (let k = Math.min(...idx) - 1; k >= 0; k--) {
      const c = all[k];
      if (c && seen(c)) {
        i = k;
        break;
      }
    }
    const below = all[i];
    if (!below) return;
    at = rest.indexOf(below);
  }
  moving.forEach(c => {
    const f = c.onFrame && !ids.has(c.onFrame) ? rest.findIndex(x => x.id === c.onFrame) : -1;
    if (f >= 0) at = Math.max(at, f + 1);
  });
  const next = [...rest];
  next.splice(at, 0, ...moving);
  if (next.every((c, i) => c === all[i]))
    return chirp(where === 'front' || where === 'forward' ? 'Already on top ✦' : 'Already at the back ✦', 1600);
  remember();
  session.board.cards = next;
  // move only the restacked cards on the page, so a playing Spotify or video elsewhere keeps going
  const top = moving.at(-1),
    after = next
      .slice(top ? next.indexOf(top) + 1 : 0)
      .map(c => cardEl(c.id))
      .find(el => el && !el.classList.contains('coll'));
  moving.forEach(c => {
    const el = cardEl(c.id);
    if (el) cardsEl.insertBefore(el, after || null);
  });
  renderWires();
  save();
  LY.reveal = true;
  layersSoon();
}

export function groupSel(on: boolean) {
  const cs = selCards();
  if (on && cs.length < 2) return;
  const g = on ? uid() : null;
  cs.forEach(c => {
    if (g) c.group = g;
    else delete c.group;
    renderCard(c);
  });
  selectOnly(cs.map(c => c.id));
  $('selbar').dataset.key = '';
  save();
}
