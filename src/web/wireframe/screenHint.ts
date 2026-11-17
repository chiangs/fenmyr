import type { Card } from '../../shared/model.ts';
import { byId, selectOnly } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { boardRevision } from '../core/history.ts';
import { appState, session } from '../core/state.ts';
import { closestTo, esc } from '../ui/dom.ts';
import { openPicker } from './piecePick.ts';

// a screen narrower than this on screen has no room for the hint
const MIN_W = 140;

let seen = '';
let drawn = '';

// A card sits on a screen when it is filed into it, or when its middle lies on the screen and it is drawn above it, as
// a note dropped there is.
function emptyScreens(cards: readonly Card[]) {
  return cards.filter(
    (f, i) =>
      f.type === 'frame' &&
      !cards.some((c, j) => {
        const x = c.x + c.w / 2,
          y = c.y + c.h / 2;
        return c.onFrame === f.id || (j > i && x > f.x && x < f.x + f.w && y > f.y && y < f.y + f.h);
      }),
  );
}

/** Every empty screen shows, in the middle of its body, an Add pieces button and the keys for a box and text. Worked
 *  out again only when the board changes, the zoom changes or a drag runs. */
export function drawScreenHints() {
  if (!session.board) return;
  const z = session.view.z,
    now = `${session.board.id} ${boardRevision()} ${z}`;
  if (now === seen && !appState.drag) return;
  if (now !== seen) $('screenHints').style.setProperty('--hz', String(1 / z));
  seen = now;
  const html = emptyScreens(session.board.cards)
    .filter(f => f.w * z >= MIN_W)
    .map(f => {
      const x = f.x + f.w / 2,
        y = f.y + f.h / 2,
        id = f.id,
        name = esc(`Add pieces to ${f.name || 'this screen'}`);
      return `<div class="screen-hint" style="left:${x}px;top:${y}px"><button type="button" data-hint="${id}" aria-label="${name}">Add pieces</button><span>or press R for a box,<br>X for text</span></div>`;
    })
    .join('');
  if (html === drawn) return;
  drawn = html;
  $('screenHints').innerHTML = html;
}

export function initScreenHints() {
  const layer = $('screenHints');
  // a press on the button is not a press on the board: it starts no marquee, and a double-click makes no note
  for (const t of ['pointerdown', 'dblclick']) layer.addEventListener(t, e => e.stopPropagation());
  layer.addEventListener('click', e => {
    const s = byId(closestTo(e.target, '[data-hint]')?.dataset.hint ?? '');
    if (s?.type !== 'frame') return;
    selectOnly([s.id]);
    openPicker(s, 'hint');
  });
}
