import { applyView } from '../canvas/view.ts';
import { clamp } from '../core/base.ts';
import { $, stage } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { appState, session } from '../core/state.ts';
import { closestTo } from '../ui/dom.ts';

type Point = { x: number; y: number };
type Pinch = { d: number; z: number; wx: number; wy: number };
export function init63() {
  // ---------- touch: one finger pans an empty board, two fingers pinch to zoom, press and hold for the menu ----------
  {
    const pts = new Map<number, Point>();
    let pinch: Pinch | null = null,
      hold: ReturnType<typeof setTimeout> | undefined;
    // the first two fingers down, while there are two
    const pair = (): [Point, Point] | null => {
      const [a, b] = pts.values();
      return a && b ? [a, b] : null;
    };
    stage.addEventListener(
      'pointerdown',
      e => {
        if (e.pointerType !== 'touch') return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        clearTimeout(hold);
        const x0 = e.clientX,
          y0 = e.clientY,
          tgt = e.target;
        if (pts.size === 1 && tgt && !closestTo(tgt, '.dock, .selbar, .modebar, .hub, .sheet, .top, .m-chat'))
          hold = setTimeout(() => {
            // press and hold: the same menu as a right-click
            if (pts.size !== 1) return;
            const [p] = pts.values();
            if (!p || Math.hypot(p.x - x0, p.y - y0) > 8) return;
            appState.drag = null;
            stage.classList.remove('panning');
            $('marquee').style.display = 'none';
            navigator.vibrate?.(10);
            tgt.dispatchEvent(
              new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x0, clientY: y0, button: 2 }),
            );
          }, 520);
        const two = pts.size === 2 && pair();
        if (two) {
          // a second finger: whatever the first was doing becomes a pinch
          clearTimeout(hold);
          appState.drag = null;
          stage.classList.remove('panning');
          $('marquee').style.display = 'none';
          const [a, b] = two,
            mx = (a.x + b.x) / 2,
            my = (a.y + b.y) / 2;
          pinch = {
            d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
            z: session.view.z,
            wx: (mx - session.view.x) / session.view.z,
            wy: (my - session.view.y) / session.view.z,
          };
        }
      },
      true,
    );
    addEventListener(
      'pointermove',
      e => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const two = pair();
        if (pinch && two) {
          const [a, b] = two,
            mx = (a.x + b.x) / 2,
            my = (a.y + b.y) / 2;
          session.view.z = clamp((pinch.z * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d, 0.2, 3);
          session.view.x = mx - pinch.wx * session.view.z;
          session.view.y = my - pinch.wy * session.view.z;
          applyView();
        }
      },
      true,
    );
    const end = (e: PointerEvent) => {
      if (!pts.delete(e.pointerId)) return;
      clearTimeout(hold);
      if (pts.size < 2 && pinch) {
        pinch = null;
        save();
      }
    };
    addEventListener('pointerup', end, true);
    addEventListener('pointercancel', end, true);
  }
}
