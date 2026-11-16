import { byId, selectOnly } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { boardRevision } from '../core/history.ts';
import { appState, session } from '../core/state.ts';
import { closestTo } from '../ui/dom.ts';
import { openPicker } from './piecePick.ts';

// a screen narrower than this on screen has no room for the hint
const MIN_W = 140;

let seen = '';
let drawn = '';

/** Every empty screen shows, in the middle of its body, an Add pieces button and the keys for a box and text. A screen
 *  is empty while no card sits on it. Worked out again only when the board changes, the zoom changes or a drag runs. */
export function drawScreenHints() {
  if (!session.board) return;
  const z = session.view.z,
    now = `${session.board.id} ${boardRevision()} ${z}`;
  if (now === seen && !appState.drag) return;
  if (now !== seen) $('screenHints').style.setProperty('--hz', String(1 / z));
  seen = now;
  const filled = new Set(session.board.cards.flatMap(c => (c.onFrame ? [c.onFrame] : []))),
    html = session.board.cards
      .filter(c => c.type === 'frame' && !filled.has(c.id) && c.w * z >= MIN_W)
      .map(f => {
        const x = f.x + f.w / 2,
          y = f.y + f.h / 2,
          id = f.id;
        return `<div class="screen-hint" style="left:${x}px;top:${y}px"><button type="button" data-hint="${id}">Add pieces</button><span>or press R for a box, X for text</span></div>`;
      })
      .join('');
  if (html === drawn) return;
  drawn = html;
  $('screenHints').innerHTML = html;
}

export function initScreenHints() {
  const layer = $('screenHints');
  // a press on the button is not a press on the board, so it starts no marquee
  layer.addEventListener('pointerdown', e => e.stopPropagation());
  layer.addEventListener('click', e => {
    const s = byId(closestTo(e.target, '[data-hint]')?.dataset.hint ?? '');
    if (s?.type !== 'frame') return;
    selectOnly([s.id]);
    openPicker(s, 'hint');
  });
}
