import { toWorld } from '../canvas/handles.ts';
import { $ } from '../core/dom.ts';
import { appState, session } from '../core/state.ts';
import { selCards } from './selected.ts';

let coverT = 0;

let coverKey = '';

// the board's name dims when a card sits under it
function checkTitleCover() {
  const t = document.querySelector('.top');
  if (!t || !session.board) return;
  const key =
    session.view.x +
    ',' +
    session.view.y +
    ',' +
    session.view.z +
    ',' +
    session.board.cards.length +
    ',' +
    (appState.drag ? 1 : 0);
  if (key === coverKey && !appState.drag) return;
  coverKey = key;
  const r = t.getBoundingClientRect(),
    a = toWorld(r.left - 6, r.top - 6),
    b = toWorld(r.right + 6, r.bottom + 6);
  t.classList.toggle(
    'covered',
    session.board.cards.some(c => c.x < b.x && c.x + c.w > a.x && c.y < b.y && c.y + c.h > a.y),
  );
}

let gbKey = '';

function drawGroupBoxes() {
  if (!session.board) return;
  const gs = [...new Set(selCards().flatMap(c => (c.group ? [c.group] : [])))];
  const boxes = gs
    .map(g => {
      const cs = session.board.cards.filter(c => c.group === g && !c.onFrame);
      if (cs.length < 2) return null;
      const x0 = Math.min(...cs.map(c => c.x)),
        y0 = Math.min(...cs.map(c => c.y)),
        x1 = Math.max(...cs.map(c => c.x + c.w)),
        y1 = Math.max(...cs.map(c => c.y + c.h));
      return [x0 - 14, y0 - 14, x1 - x0 + 28, y1 - y0 + 28];
    })
    .filter(b => b !== null);
  const key = JSON.stringify(boxes);
  if (key === gbKey) return;
  gbKey = key;
  $('groupBoxes').innerHTML = boxes
    .map(
      ([x = 0, y = 0, w = 0, h = 0]) =>
        `<div class="group-box" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><span>Group</span></div>`,
    )
    .join('');
}

// every frame: the outline around each selected group, and every eighth frame the name check
export function drawOverlays() {
  drawGroupBoxes();
  if (++coverT % 8 === 0) checkTitleCover();
}
