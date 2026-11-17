import type { Drawn } from '../canvas/drag.ts';
import { selectOnly } from '../canvas/wires.ts';
import { save } from '../core/history.ts';
import { session } from '../core/state.ts';
import { card } from '../model/boards.ts';
import { fileIntoFrame } from '../wireframe/tilt.ts';
import { addCard } from './penEdit.ts';
import type { placing } from './place.ts';
import { drawScreen, makeScreen } from './screenTool.ts';

type Point = { x: number; y: number };
// a drag shorter than this each way on screen is a click, at any zoom
const CLICK = 6;
/** The box a click with R's tool makes. */
export const CLICK_BOX = { w: 160, h: 100 };

/** What a press with this tool in hand draws, if it draws: R's box or W's screen. */
export function drawnBy(tool: typeof placing): Drawn | null {
  if (tool?.type === 'box') return { kind: 'box' };
  if (tool?.type === 'frame') return { kind: 'screen', device: tool.extra.device ?? 'iPhone' };
  return null;
}

/** A box or screen drag lets go: a click makes the tool's usual card at the press, a drag one the size it drew. */
export function finishDrawn(make: Drawn, a: Point, b: Point) {
  const r = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) },
    click = r.w * session.view.z < CLICK && r.h * session.view.z < CLICK;
  switch (make.kind) {
    case 'box': {
      const size = click ? CLICK_BOX : { w: Math.round(r.w), h: Math.round(r.h) },
        c = card('box', { x: r.x, y: r.y, ...size, r: 0, fill: '#e4e4e7', radius: 6 });
      addCard(c);
      fileIntoFrame([c]);
      selectOnly([c.id]);
      save();
      return;
    }
    case 'screen':
      return click ? makeScreen(make.device, a) : drawScreen(r);
    default: {
      const unknown: never = make;
      return unknown;
    }
  }
}
