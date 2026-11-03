import { cardEl, closestTo } from '../ui/dom.ts';
import { anchorOf, mrot, realBox, rhFor, tiltOf, toWorld } from './handles.ts';
import { TILTS } from './render.ts';
import { byId, linkById, selectOnly, selectWire } from './wires.ts';
import { cropDown, cropping } from '../cards/crop.ts';
import { stage } from '../core/dom.ts';
import { remember, snapT } from '../core/history.ts';
import { endEdit } from '../features/tags.ts';
import { fsMul } from '../selbar/textSize.ts';
import { selCards } from '../selbar/selected.ts';
import { drawDown, drawOn } from '../tools/draw.ts';
import { penDown, penT } from '../tools/pen.ts';
import { placeAt, placing, stopPlacing } from '../tools/place.ts';
import { inSection } from '../wireframe/sections.ts';
import { groupOf, onFrame } from '../wireframe/tilt.ts';
import { WF } from '../wireframe/wireframes.ts';
import { appState, session } from '../core/state.ts';

import { clearStuckDrag, targetHas, targetId } from './pointerKit.ts';

// a press on the board: what it starts depends on where it lands (a handle, a wire, a card, empty board) and the tool in hand
export function onPress(e: PointerEvent) {
  if (!appState.drag) clearStuckDrag();
  if (
    closestTo(
      e.target,
      '.tools, .tray, .myra, .top, .capture, .side, .keys, .cpop, .home, .selbar, .dock, .docview, .shapepick, .tplpick',
    )
  )
    return;
  const el = closestTo(e.target, '.card'),
    w = toWorld(e.clientX, e.clientY);
  if (e.button === 2) return; // right-click opens the menu, it doesn't drag
  if (session.board) {
    clearTimeout(snapT);
    remember();
  } // lock in the last change before a new one starts, so undo steps stay separate
  if (penT && e.button === 0 && !session.space) {
    e.preventDefault();
    penDown(e);
    return;
  }
  if (drawOn && e.button === 0 && !session.space) {
    e.preventDefault();
    drawDown(e);
    return;
  }
  const gid = rhFor?.startsWith('g:') ? rhFor.slice(2) : null;
  if (targetId(e) === 'rh' && gid && e.button === 0) {
    const cs = session.board.cards.filter(c => c.group === gid),
      bx = Math.min(...cs.map(c => c.x)),
      by = Math.min(...cs.map(c => c.y));
    appState.drag = {
      mode: 'gresize',
      sx: w.x,
      sy: w.y,
      bx,
      by,
      bw: Math.max(...cs.map(c => c.x + c.w)) - bx,
      bh: Math.max(...cs.map(c => c.y + c.h)) - by,
      items: cs.map(c => ({ c, x: c.x, y: c.y, w: c.w, h: c.h })),
    };
    stage.setPointerCapture(e.pointerId);
    return;
  }
  if (targetId(e) === 'mrot' && e.button === 0) {
    const cs = selCards().filter(c => !c.locked);
    const anchor = anchorOf(cs);
    if (anchor) {
      remember();
      const R = realBox;
      const x0 = Math.min(...cs.map(c => c.x)),
        x1 = Math.max(...cs.map(c => c.x + R(c).w)),
        y0 = Math.min(...cs.map(c => c.y)),
        y1 = Math.max(...cs.map(c => c.y + R(c).h));
      const cx = (x0 + x1) / 2,
        cy = (y0 + y1) / 2;
      const single = cs.length === 1,
        ang0 = tiltOf(anchor);
      const items = cs.map(c => {
        const r = R(c);
        return {
          c,
          mx: c.x + r.w / 2,
          my: c.y + r.h / 2,
          w: r.w,
          h: r.h,
          r0: WF.includes(c.type) ? c.rot || 0 : c.r || 0,
          wf: WF.includes(c.type),
        };
      });
      appState.drag = {
        mode: 'mrotate',
        cx,
        cy,
        ang0,
        single,
        anchor: anchor.id,
        a0: Math.atan2(w.y - cy, w.x - cx),
        dot0: { x: parseFloat(mrot.style.left), y: parseFloat(mrot.style.top) },
        items,
      };
      items.forEach(it => cardEl(it.c.id)?.classList.add('tilting')); // no easing while turning, so nothing trails behind
      stage.setPointerCapture(e.pointerId);
      return;
    }
  }
  if (targetId(e) === 'rh' && rhFor === 'm' && e.button === 0) {
    const cs = selCards().filter(c => !c.locked && c.type !== 'ink');
    if (cs.length > 1) {
      remember();
      const items = cs.map(c => {
          const r = realBox(c);
          return {
            c,
            x: c.x,
            y: c.y,
            w: r.w,
            h: r.h,
            fs0: fsMul(c),
            size0: c.type === 'text' ? c.size : undefined,
            sw0: c.sw,
          };
        }),
        bx = Math.min(...items.map(i => i.x)),
        by = Math.min(...items.map(i => i.y));
      appState.drag = {
        mode: 'gresize',
        multi: true,
        sx: w.x,
        sy: w.y,
        bx,
        by,
        bw: Math.max(...items.map(i => i.x + i.w)) - bx,
        bh: Math.max(...items.map(i => i.y + i.h)) - by,
        items,
      };
      stage.setPointerCapture(e.pointerId);
      return;
    }
  }
  if (targetId(e) === 'rh' && rhFor && e.button === 0) {
    const c = byId(rhFor);
    if (c) {
      appState.drag = { mode: 'resize', id: c.id, sx: w.x, sy: w.y, w0: c.w, h0: c.h, fs0: fsMul(c) };
      stage.setPointerCapture(e.pointerId);
      return;
    }
  }
  if (cropping && closestTo(e.target, '.crop-ui')) {
    e.preventDefault();
    cropDown(e);
    return;
  }
  if (placing?.type === 'box' && e.button === 0) {
    e.preventDefault();
    stopPlacing();
    appState.drag = { mode: 'drawbox', sx: w.x, sy: w.y };
    stage.setPointerCapture(e.pointerId);
    return;
  }
  if (placing && e.button === 0) {
    e.preventDefault();
    placeAt(w);
    return;
  }
  const wireEl = closestTo(e.target, '[data-wire]');
  if (wireEl && !session.space) {
    const l = linkById(wireEl.dataset.wire ?? ''),
      end = wireEl.dataset.end;
    if (!l) return;
    if (wireEl.classList.contains('w-bend')) appState.drag = { mode: 'bend', l };
    else if (end === 'a' || end === 'b') appState.drag = { mode: 'rewire', l, end };
    else {
      selectWire(l.id);
      return;
    }
    stage.setPointerCapture(e.pointerId);
    return;
  }
  if (session.selWire && !el) selectWire(null);
  if (session.space || e.button === 1) {
    appState.drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: session.view.x, vy: session.view.y };
    stage.classList.add('panning');
    stage.setPointerCapture(e.pointerId);
    return;
  }
  if (el) {
    const id = el.dataset.id ?? '',
      c = byId(id);
    if (!c) return;
    if (session.editing === id && !closestTo(e.target, '.handle, .knob')) return; // clicking inside text you're editing
    if (closestTo(e.target, 'input[type=checkbox], .link-in input')) return;
    if (closestTo(e.target, '[data-act]')) return;
    if (
      c.type === 'section' &&
      !session.sel.has(id) &&
      e.button === 0 &&
      !e.shiftKey &&
      !closestTo(e.target, '.sec-name, .handle, .knob, .rot-h')
    ) {
      endEdit();
      selectOnly([]);
      appState.drag = { mode: 'marquee', sx: e.clientX, sy: e.clientY, base: new Set(), sec: id };
      stage.setPointerCapture(e.pointerId);
      return;
    }
    if (targetHas(e, 'rot-h')) {
      const tilt = TILTS(c);
      appState.drag = { mode: 'rotate', c, cx: c.x + c.w / 2, cy: c.y + c.h / 2, tilt };
      if (tilt) el.classList.add('tilting');
    } else if (targetHas(e, 'handle')) {
      appState.drag = { mode: 'resize', id, sx: w.x, sy: w.y, w0: c.w, h0: c.h, fs0: fsMul(c) };
    } else if (targetHas(e, 'knob')) {
      appState.drag = { mode: 'wire', id, a: { x: c.x + c.w, y: c.y + c.h / 2 } };
    } else {
      endEdit();
      if (e.shiftKey) {
        session.sel.has(id) ? session.sel.delete(id) : session.sel.add(id);
        selectOnly([...session.sel]);
      } else if (e.metaKey || e.ctrlKey)
        selectOnly([id]); // Ctrl-click reaches inside a group for just this piece
      else if (!session.sel.has(id)) selectOnly(groupOf(id));
      const ids = new Set(session.sel);
      [...session.sel].forEach(i => {
        const c = byId(i);
        if (c?.type === 'section') inSection(c).forEach(k => ids.add(k.id));
      });
      [...ids].forEach(i => {
        const c = byId(i);
        if (c?.type === 'coll') (c.kids || []).forEach(k => ids.add(k));
        if (c?.type === 'frame') onFrame(c).forEach(k => ids.add(k.id));
      });
      appState.drag = {
        mode: 'move',
        sx: w.x,
        sy: w.y,
        start: [...ids]
          .map(i => byId(i))
          .filter(c => c !== undefined)
          .map(c => ({ c, x: c.x, y: c.y })),
        moved: false,
      };
    }
    stage.setPointerCapture(e.pointerId);
    return;
  }
  // zoomed out, cards are tiny and the gaps between them are easy to hit: a press anywhere inside the selection's outline grabs the whole selection
  if (session.sel.size && !e.shiftKey && e.button === 0 && !session.space) {
    const W2 = toWorld(e.clientX, e.clientY),
      cs0 = selCards().filter(c => !c.hidden && !c.locked),
      pad = 14 / session.view.z;
    if (
      cs0.length &&
      W2.x > Math.min(...cs0.map(c => c.x)) - pad &&
      W2.x < Math.max(...cs0.map(c => c.x + c.w)) + pad &&
      W2.y > Math.min(...cs0.map(c => c.y)) - pad &&
      W2.y < Math.max(...cs0.map(c => c.y + c.h)) + pad
    ) {
      endEdit();
      const ids = new Set(session.sel);
      [...session.sel].forEach(i => {
        const c = byId(i);
        if (c?.type === 'section') inSection(c).forEach(k => ids.add(k.id));
      });
      [...ids].forEach(i => {
        const c = byId(i);
        if (c?.type === 'coll') (c.kids || []).forEach(k => ids.add(k));
        if (c?.type === 'frame') onFrame(c).forEach(k => ids.add(k.id));
      });
      appState.drag = {
        mode: 'move',
        sx: W2.x,
        sy: W2.y,
        start: [...ids]
          .map(i => byId(i))
          .filter(c => c !== undefined)
          .map(c => ({ c, x: c.x, y: c.y })),
        moved: false,
      };
      stage.setPointerCapture(e.pointerId);
      return;
    }
  }
  endEdit();
  if (!e.shiftKey) {
    if (session.sel.size) appState.deselectAt = Date.now();
    selectOnly([]);
  }
  if (e.pointerType === 'touch') {
    if (!e.shiftKey) selectOnly([]);
    appState.drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: session.view.x, vy: session.view.y };
    stage.classList.add('panning');
    stage.setPointerCapture(e.pointerId);
    return;
  } // a finger on empty board moves the board
  appState.drag = { mode: 'marquee', sx: e.clientX, sy: e.clientY, base: new Set(session.sel) };
  stage.setPointerCapture(e.pointerId);
}
