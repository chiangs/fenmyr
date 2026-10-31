// @ts-nocheck
import { cloneForDrag } from './clipboard.ts';
import {
  ROT_FIXED,
  anchorOf,
  mrot,
  realBox,
  rhFor,
  selKey,
  stepZoom,
  tiltOf,
  toWorld,
  viewSoon,
  zoomAt,
} from './handles.ts';
import { TILTS, renderCard, titleW } from './render.ts';
import { applyView } from './view.ts';
import {
  byId,
  linkById,
  pinAt,
  renderTray,
  renderWires,
  selectOnly,
  selectWire,
  sendToTray,
  wireGeom,
} from './wires.ts';
import { CGAP, CPAD, CW, layoutColl, parentOf } from '../cards/collection.ts';
import { cropDown, cropping } from '../cards/crop.ts';
import { pullColors } from '../cards/imageColors.ts';
import { collAt, dropInto } from '../cards/kanban.ts';
import { clamp, tilt, uid } from '../core/base.ts';
import { $, cardsEl, stage, world } from '../core/dom.ts';
import { remember, save, snapT } from '../core/history.ts';
import { docTarget, dropIntoDoc } from '../docs/drop.ts';
import { fitText } from '../edit/text.ts';
import { endEdit, startEdit } from '../features/tags.ts';
import { audioAct } from '../media/devices.ts';
import { videoAct } from '../media/video.ts';
import { card } from '../model/boards.ts';
import { FS, SIZED, fsMul, placeSelbar, selCards } from '../selbar/selbar.ts';
import { newNoteColor, snapTo } from '../settings/licenses.ts';
import { settings } from '../settings/settings.ts';
import { drawDown, drawOn } from '../tools/draw.ts';
import { drawPen, endPen, penDown, penMove, penT } from '../tools/pen.ts';
import { addCard } from '../tools/penEdit.ts';
import { placeAt, placing, stopPlacing } from '../tools/place.ts';
import { openColor } from '../ui/colorPicker.ts';
import { flipVNote, openVNote, toggleVNFull } from '../vault/notes.ts';
import { pickWF, syncDesign } from '../wireframe/pieces.ts';
import { inSection } from '../wireframe/sections.ts';
import { fileIntoFrame, groupOf, onFrame, snapWF } from '../wireframe/tilt.ts';
import { WF } from '../wireframe/wireframes.ts';
import { appState, session } from '../core/state.ts';

function clearStuckDrag() {
  cardsEl.querySelectorAll('.card.dragging').forEach(el => {
    el.classList.remove('dragging');
    el.style.transform = '';
    el.style.willChange = '';
  });
  stage.classList.remove('dragging-cards', 'cloning', 'panning');
}

export const overTray = e => {
  const r = $('tray').getBoundingClientRect();
  return e.clientX > r.left && e.clientY > r.top && e.clientY < r.bottom && !$('tray').classList.contains('closed');
};

let ctrlHeld = false;
let wheelSum = 0;
let wheelAt = 0;
export function init16() {
  // ---------- pointer: drag cards, resize, connect, marquee, pan ----------
  appState.drag = null;

  stage.addEventListener('pointercancel', () => {
    if (appState.drag?.mode === 'move') {
      appState.drag.start?.forEach(s => {
        const el = s.el || cardsEl.querySelector(`[data-id="${s.c.id}"]`);
        if (el) {
          el.style.left = s.c.x + 'px';
          el.style.top = s.c.y + 'px';
        }
      });
    }
    appState.drag = null;
    clearStuckDrag();
    placeSelbar();
  });

  stage.addEventListener('pointerdown', e => {
    if (!appState.drag) clearStuckDrag();
    if (
      e.target.closest(
        '.tools, .tray, .myra, .top, .capture, .side, .keys, .cpop, .home, .selbar, .dock, .docview, .shapepick, .tplpick',
      )
    )
      return;
    const el = e.target.closest('.card'),
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
    if (e.target.id === 'rh' && rhFor && rhFor.startsWith('g:') && e.button === 0) {
      const cs = session.board.cards.filter(c => c.group === rhFor.slice(2)),
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
    if (e.target.id === 'mrot' && e.button === 0) {
      const cs = selCards().filter(c => !c.locked);
      if (cs.length >= 1) {
        remember();
        const R = realBox;
        const x0 = Math.min(...cs.map(c => c.x)),
          x1 = Math.max(...cs.map(c => c.x + R(c).w)),
          y0 = Math.min(...cs.map(c => c.y)),
          y1 = Math.max(...cs.map(c => c.y + R(c).h));
        const cx = (x0 + x1) / 2,
          cy = (y0 + y1) / 2;
        const single = cs.length === 1,
          anchor = anchorOf(cs),
          ang0 = tiltOf(anchor);
        appState.drag = {
          mode: 'mrotate',
          cx,
          cy,
          ang0,
          single,
          anchor: anchor.id,
          a0: Math.atan2(w.y - cy, w.x - cx),
          dot0: { x: parseFloat(mrot.style.left), y: parseFloat(mrot.style.top) },
          items: cs.map(c => {
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
          }),
        };
        appState.drag.items.forEach(it => cardsEl.querySelector(`[data-id="${it.c.id}"]`)?.classList.add('tilting')); // no easing while turning, so nothing trails behind
        stage.setPointerCapture(e.pointerId);
        return;
      }
    }
    if (e.target.id === 'rh' && rhFor === 'm' && e.button === 0) {
      const cs = selCards().filter(c => !c.locked && c.type !== 'ink');
      if (cs.length > 1) {
        remember();
        const items = cs.map(c => {
            const r = realBox(c);
            return { c, x: c.x, y: c.y, w: r.w, h: r.h, fs0: fsMul(c), size0: c.size, sw0: c.sw };
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
    if (e.target.id === 'rh' && rhFor && e.button === 0) {
      const c = byId(rhFor);
      if (c) {
        appState.drag = { mode: 'resize', id: c.id, sx: w.x, sy: w.y, w0: c.w, h0: c.h, fs0: fsMul(c) };
        stage.setPointerCapture(e.pointerId);
        return;
      }
    }
    if (cropping && e.target.closest('.crop-ui')) {
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
    const wireEl = e.target.closest('[data-wire]');
    if (wireEl && !session.space) {
      const l = linkById(wireEl.dataset.wire);
      if (!l) return;
      if (wireEl.classList.contains('w-bend')) appState.drag = { mode: 'bend', l };
      else if (wireEl.dataset.end) appState.drag = { mode: 'rewire', l, end: wireEl.dataset.end };
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
      const id = el.dataset.id,
        c = byId(id);
      if (session.editing === id && !e.target.closest('.handle, .knob')) return; // clicking inside text you're editing
      if (e.target.closest('input[type=checkbox], .link-in input')) return;
      if (e.target.closest('[data-act]')) return;
      if (
        c.type === 'section' &&
        !session.sel.has(id) &&
        e.button === 0 &&
        !e.shiftKey &&
        !e.target.closest('.sec-name, .handle, .knob, .rot-h')
      ) {
        endEdit();
        selectOnly([]);
        appState.drag = { mode: 'marquee', sx: e.clientX, sy: e.clientY, base: new Set(), sec: id };
        stage.setPointerCapture(e.pointerId);
        return;
      }
      if (e.target.classList.contains('rot-h')) {
        appState.drag = { mode: 'rotate', c, cx: c.x + c.w / 2, cy: c.y + c.h / 2, tilt: TILTS(c) };
        if (appState.drag.tilt) el.classList.add('tilting');
      } else if (e.target.classList.contains('handle')) {
        appState.drag = { mode: 'resize', id, sx: w.x, sy: w.y, w0: c.w, h0: c.h, fs0: fsMul(c) };
      } else if (e.target.classList.contains('knob')) {
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
            .filter(Boolean)
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
            .filter(Boolean)
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
  });

  stage.addEventListener('pointermove', e => {
    if (penT && !appState.drag) {
      penMove(e);
      return;
    }
    if (!appState.drag) return;
    const w = toWorld(e.clientX, e.clientY);
    if (appState.drag.mode === 'pan') {
      session.view.x = appState.drag.vx + e.clientX - appState.drag.sx;
      session.view.y = appState.drag.vy + e.clientY - appState.drag.sy;
      applyView();
    }
    if (appState.drag.mode === 'move') {
      let dx = w.x - appState.drag.sx,
        dy = w.y - appState.drag.sy;
      if (!appState.drag.moved && Math.hypot(dx, dy) > 2) {
        appState.drag.moved = true;
        if (e.altKey) cloneForDrag();
      }
      const sn = snapWF(appState.drag.start, dx, dy);
      dx = sn.dx;
      dy = sn.dy;
      // move on the GPU: the card is lifted as an already-drawn picture and slid with a transform, so the wobbly-edge filter isn't redrawn every frame (Safari is slow at that)
      appState.drag.start.forEach(s => {
        s.c.x = s.x + dx;
        s.c.y = s.y + dy;
        const el = s.el || (s.el = cardsEl.querySelector(`[data-id="${s.c.id}"]`));
        if (!el) return;
        if (!s.lifted) {
          s.lifted = true;
          el.style.willChange = 'transform';
          el.classList.add('dragging');
          stage.classList.add('dragging-cards');
        }
        el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      });
      renderWires();
      $('tray').classList.toggle('drop', overTray(e));
      const loose = appState.drag.start.filter(s => s.c.type !== 'coll'),
        skip = new Set(appState.drag.start.filter(s => s.c.type === 'coll').map(s => s.c.id));
      cardsEl.querySelectorAll('.drop-in, .drop-col').forEach(n => n.classList.remove('drop-in', 'drop-col'));
      const dt = loose.length && !skip.size && docTarget(e, w, loose);
      $('docview').classList.toggle('drop', dt === 'page');
      if (dt && dt !== 'page') {
        cardsEl.querySelector(`[data-id="${dt.id}"]`)?.classList.add('drop-in');
      } else if (loose.length && !skip.size) {
        const t = collAt(w, skip);
        if (t) cardsEl.querySelector(`[data-id="${t.s.id}"]`)?.classList.add(t.side ? 'drop-col' : 'drop-in');
      }
    }
    if (appState.drag.mode === 'resize' && byId(appState.drag.id).type === 'coll' && !byId(appState.drag.id).kanban) {
      const c = byId(appState.drag.id);
      c.cols = Math.max(1, Math.round((appState.drag.w0 + w.x - appState.drag.sx - CPAD * 2 + CGAP) / (CW + CGAP)));
      layoutColl(c);
      renderWires();
      return;
    }
    if (appState.drag.mode === 'resize' && ['stamp', 'icon'].includes(byId(appState.drag.id).type)) {
      const c = byId(appState.drag.id);
      c.w = c.h = clamp(appState.drag.w0 + Math.max(w.x - appState.drag.sx, w.y - appState.drag.sy), 24, 400);
      const el = cardsEl.querySelector(`[data-id="${c.id}"]`);
      Object.assign(el.style, { width: c.w + 'px', height: c.h + 'px' });
      el.style.setProperty('--sz', c.w + 'px');
      return;
    }
    // Shift + resize scales the whole thing: same shape, and the words (and everything inside) grow or shrink with it
    if (
      appState.drag.mode === 'resize' &&
      e.shiftKey &&
      !['coll', 'frame', 'section'].includes(byId(appState.drag.id).type)
    ) {
      const c = byId(appState.drag.id),
        el = cardsEl.querySelector(`[data-id="${c.id}"]`),
        kx = (appState.drag.w0 + w.x - appState.drag.sx) / appState.drag.w0,
        ky = (appState.drag.h0 + w.y - appState.drag.sy) / appState.drag.h0;
      const k = Math.max(
        0.2,
        Math.min((appState.drag.w0 * 12) / appState.drag.w0, Math.abs(kx - 1) >= Math.abs(ky - 1) ? kx : ky),
      );
      c.w = Math.round(appState.drag.w0 * k);
      c.h = Math.round(appState.drag.h0 * k);
      if (SIZED.includes(c.type)) {
        const m = +(appState.drag.fs0 * k).toFixed(4),
          hit = Object.keys(FS).find(z => Math.abs(FS[z] - m) < 0.001);
        if (hit === 'm') delete c.fs;
        else c.fs = hit || m;
        el.style.setProperty('--fs', fsMul(c));
      }
      if (c.type === 'title' && !c.fixedW) {
        c.fixedW = true;
        el.classList.add('fixedw');
      }
      if (c.type === 'note' || c.type === 'todo') c.userH = c.h;
      el.style.width = c.w + 'px';
      if (c.type !== 'title') el.style.height = c.h + 'px';
      else c.h = el.offsetHeight;
      renderWires();
      return;
    }
    if (appState.drag.mode === 'resize') {
      const c = byId(appState.drag.id);
      c.w = Math.max(80, appState.drag.w0 + w.x - appState.drag.sx);
      c.h = Math.max(50, appState.drag.h0 + w.y - appState.drag.sy);
      const el = cardsEl.querySelector(`[data-id="${c.id}"]`);
      if (c.type === 'title' && !c.fixedW) {
        c.fixedW = true;
        el.classList.add('fixedw');
      }
      if (c.type === 'note' || c.type === 'todo') c.userH = c.h;
      el.style.width = c.w + 'px';
      if (c.type !== 'title') el.style.height = c.h + 'px';
      else c.h = el.offsetHeight;
      renderWires();
    }
    if (appState.drag.mode === 'gresize' && appState.drag.multi && e.shiftKey) {
      const d = appState.drag,
        kx = (d.bw + w.x - d.sx) / d.bw,
        ky = (d.bh + w.y - d.sy) / d.bh,
        k = Math.max(0.15, Math.abs(kx - 1) >= Math.abs(ky - 1) ? kx : ky);
      d.items.forEach(it => {
        const c = it.c;
        c.x = d.bx + (it.x - d.bx) * k;
        c.y = d.by + (it.y - d.by) * k;
        c.w = Math.max(8, it.w * k);
        c.h = Math.max(8, it.h * k);
        if (SIZED.includes(c.type)) {
          const m = +(it.fs0 * k).toFixed(4),
            hit = Object.keys(FS).find(z => Math.abs(FS[z] - m) < 0.001);
          if (hit === 'm') delete c.fs;
          else c.fs = hit || m;
        }
        if (c.type === 'text' && it.size0) c.size = Math.max(4, Math.round(it.size0 * k * 10) / 10);
        if (c.type === 'title' && c.fixedW) c.w = Math.max(8, it.w * k);
        const el = cardsEl.querySelector(`[data-id="${c.id}"]`);
        if (el) {
          Object.assign(el.style, {
            left: c.x + 'px',
            top: c.y + 'px',
            width: titleW(c),
            height: c.type === 'title' ? 'auto' : c.h + 'px',
          });
          el.style.setProperty('--fs', fsMul(c));
          if (c.type === 'text') {
            const tx = el.querySelector('.tx');
            if (tx) tx.style.fontSize = (c.size || 18) + 'px';
          }
        }
      });
      renderWires();
    } else if (appState.drag.mode === 'gresize') {
      const d = appState.drag,
        nw = Math.max(24, d.bw + w.x - d.sx),
        nh = Math.max(14, d.bh + w.y - d.sy),
        kx = nw / d.bw,
        ky = nh / d.bh;
      d.items.forEach(it => {
        const c = it.c,
          txt = c.type === 'text'; // text keeps its height and stays centered where it was, so a label sits in the middle of its button
        c.x = d.bx + (it.x - d.bx) * kx;
        c.w = Math.max(8, it.w * kx);
        c.h = txt ? it.h : Math.max(8, it.h * ky);
        c.y = txt ? d.by + (it.y + it.h / 2 - d.by) * ky - it.h / 2 : d.by + (it.y - d.by) * ky;
        const el = cardsEl.querySelector(`[data-id="${c.id}"]`);
        if (el)
          Object.assign(el.style, {
            left: c.x + 'px',
            top: c.y + 'px',
            width: titleW(c),
            height: c.type === 'title' ? 'auto' : c.h + 'px',
          });
      });
      renderWires();
    }
    if (appState.drag.mode === 'wire') {
      appState.drag.b = w;
      renderWires({ a: appState.drag.a, b: w });
    }
    if (appState.drag.mode === 'mrotate') {
      const d = appState.drag;
      let a = ((Math.atan2(w.y - d.cy, w.x - d.cx) - d.a0) * 180) / Math.PI;
      a = ((a + 540) % 360) - 180;
      a = e.shiftKey
        ? Math.round(a / 15) * 15
        : Math.abs(a - Math.round(a / 15) * 15) < 2
          ? Math.round(a / 15) * 15
          : a;
      d.cur = a;
      const t = (a * Math.PI) / 180,
        co = Math.cos(t),
        si = Math.sin(t);
      d.items.forEach(it => {
        const c = it.c,
          dx = it.mx - d.cx,
          dy = it.my - d.cy,
          nx = d.cx + dx * co - dy * si,
          ny = d.cy + dx * si + dy * co; // each piece's middle goes around the turn
        c.x = nx - it.w / 2;
        c.y = ny - it.h / 2;
        const el = cardsEl.querySelector(`[data-id="${c.id}"]`);
        if (el) {
          el.style.left = c.x + 'px';
          el.style.top = c.y + 'px';
        }
        if (ROT_FIXED.includes(c.type)) return;
        if (it.wf) {
          c.rot = +(it.r0 + a).toFixed(2);
          el?.style.setProperty('--rot', c.rot + 'deg');
        } else {
          c.r = +(it.r0 + a).toFixed(2);
          if (c.type === 'stamp') c.tilted = true;
          el?.style.setProperty('--tilt', c.r + 'deg');
        }
      });
      renderWires();
      const rb = $('rotBadge');
      rb.textContent = Math.round(a) + '°';
      rb.style.left = e.clientX + 18 + 'px';
      rb.style.top = e.clientY - 34 + 'px';
      rb.classList.add('on');
    }
    if (appState.drag.mode === 'rotate') {
      let a = (Math.atan2(w.y - appState.drag.cy, w.x - appState.drag.cx) * 180) / Math.PI + 90;
      a = ((a % 360) + 360) % 360;
      if (a > 180) a -= 360;
      const near = Math.round(a / 15) * 15;
      if (Math.abs(a - near) < 4) a = near; // eases onto 15° steps
      if (appState.drag.tilt) {
        appState.drag.c.r = Math.round(a);
        appState.drag.c.tilted = true;
        cardsEl
          .querySelector(`[data-id="${appState.drag.c.id}"]`)
          ?.style.setProperty('--tilt', appState.drag.c.r + 'deg');
      } else {
        appState.drag.c.rot = Math.round(a);
        cardsEl
          .querySelector(`[data-id="${appState.drag.c.id}"]`)
          ?.style.setProperty('--rot', appState.drag.c.rot + 'deg');
        syncDesign();
      }
      const rb = $('rotBadge');
      rb.textContent = Math.round(a) + '°';
      rb.style.left = e.clientX + 18 + 'px';
      rb.style.top = e.clientY - 34 + 'px';
      rb.classList.add('on');
    }
    if (appState.drag.mode === 'drawbox') {
      let r = appState.drag.rect;
      if (!r) {
        r = appState.drag.rect = document.createElement('div');
        r.className = 'draw-rect';
        world.appendChild(r);
      }
      const x = Math.min(appState.drag.sx, w.x),
        y = Math.min(appState.drag.sy, w.y);
      Object.assign(r.style, {
        left: x + 'px',
        top: y + 'px',
        width: Math.abs(w.x - appState.drag.sx) + 'px',
        height: Math.abs(w.y - appState.drag.sy) + 'px',
      });
    }
    if (appState.drag.mode === 'bend') {
      const a = byId(appState.drag.l.a),
        b = byId(appState.drag.l.b);
      if (a && b) {
        appState.drag.l.bend = 0;
        const g = wireGeom(appState.drag.l, a, b),
          bend = 2 * ((w.x - g.mid.x) * g.n.x + (w.y - g.mid.y) * g.n.y);
        appState.drag.l.bend = Math.abs(bend) < 12 ? 0 : Math.round(bend);
        renderWires();
      }
    } // pull it flat and it snaps straight
    if (appState.drag.mode === 'rewire') {
      const ke = appState.drag.end === 'a' ? 'b' : 'a',
        keep = byId(appState.drag.l[ke]);
      if (keep) {
        const g = wireGeom(appState.drag.l, byId(appState.drag.l.a), byId(appState.drag.l.b));
        renderWires({ a: ke === 'a' ? g.p0 : g.p2, b: w });
      }
    }
    if (appState.drag.mode === 'marquee') {
      const m = $('marquee'),
        r = stage.getBoundingClientRect(),
        x0 = Math.min(appState.drag.sx, e.clientX),
        y0 = Math.min(appState.drag.sy, e.clientY),
        x1 = Math.max(appState.drag.sx, e.clientX),
        y1 = Math.max(appState.drag.sy, e.clientY);
      Object.assign(m.style, {
        display: 'block',
        left: x0 - r.left + 'px',
        top: y0 - r.top + 'px',
        width: x1 - x0 + 'px',
        height: y1 - y0 + 'px',
      });
      const a = toWorld(x0, y0),
        b = toWorld(x1, y1),
        hit = session.board.cards
          .filter(
            c =>
              !c.hidden &&
              !c.locked &&
              (c.type === 'section'
                ? c.x > a.x && c.x + c.w < b.x && c.y > a.y && c.y + c.h < b.y
                : c.x < b.x && c.x + c.w > a.x && c.y < b.y && c.y + c.h > a.y),
          )
          .flatMap(c => groupOf(c.id));
      selectOnly([...new Set([...appState.drag.base, ...hit])]);
    }
  });

  stage.addEventListener('pointerup', e => {
    if (penT) {
      penT.down = null;
      drawPen();
      return;
    }
    if (!appState.drag) return;
    const d = appState.drag;
    appState.drag = null;
    stage.classList.remove('panning');
    $('guides').innerHTML = '';
    $('marquee').style.display = 'none';
    $('tray').classList.remove('drop');
    if (d.mode === 'marquee' && d.sec && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) {
      selectOnly([d.sec]);
      return;
    }
    if (d.mode === 'move') {
      stage.classList.remove('dragging-cards', 'cloning');
      // set it down: the transform becomes its real position again
      d.start.forEach(s => {
        const el = s.el || cardsEl.querySelector(`[data-id="${s.c.id}"]`);
        if (!el) return;
        el.style.left = s.c.x + 'px';
        el.style.top = s.c.y + 'px';
        el.style.transform = '';
        el.style.willChange = '';
        el.classList.remove('dragging');
      });
      if (d.moved && overTray(e)) {
        // dropped on the tray: back to Unsorted
        sendToTray(d.start.map(s => s.c));
        session.sel.clear();
        renderTray();
        renderWires();
        save();
        return;
      }
      cardsEl.querySelectorAll('.drop-in, .drop-col').forEach(n => n.classList.remove('drop-in', 'drop-col'));
      if (d.moved) {
        if (settings.snap) {
          const lead = d.start[0].c,
            dx = snapTo(lead.x) - lead.x,
            dy = snapTo(lead.y) - lead.y;
          d.start.forEach(s2 => {
            s2.c.x += dx;
            s2.c.y += dy;
            renderCard(s2.c);
          });
        } // snap the group together, keeping its shape
        const w = toWorld(e.clientX, e.clientY),
          skip = new Set(d.start.filter(s => s.c.type === 'coll').map(s => s.c.id));
        const dt = !skip.size && docTarget(e, w, d.start);
        $('docview').classList.remove('drop');
        if (dt) {
          d.start.forEach(s2 => {
            s2.c.x = s2.x;
            s2.c.y = s2.y;
            renderCard(s2.c);
          });
          dropIntoDoc(
            dt,
            d.start.map(s2 => s2.c),
            e,
          );
          return;
        } // the card slides home; its words go into the doc
        if (!skip.size) {
          const ids = d.start.map(s => s.c.id),
            t = collAt(w, skip);
          if (t) dropInto(t, ids, w);
          else
            ids.forEach(id => {
              const from = parentOf(id);
              if (from) {
                from.kids = from.kids.filter(k => k !== id);
                const el = cardsEl.querySelector(`[data-id="${id}"]`);
                el?.classList.remove('inside');
                byId(id).r = tilt();
                renderCard(byId(id));
              }
            });
        }
        if (!skip.size) fileIntoFrame(d.start.map(s2 => s2.c).filter(c => c.type !== 'frame' && !parentOf(c.id)));
        save();
        renderWires();
      } else if (
        d.start.length === 1 &&
        d.start[0].c.type === 'swatch' &&
        document.elementFromPoint(e.clientX, e.clientY)?.closest('.chipcol')
      )
        openColor(d.start[0].c); // only the color itself opens the wheel; the rest of the card just selects it
      else {
        // our own double-click check (pointer events don't count clicks everywhere), on whatever is really under the pointer
        const now = Date.now(),
          id = d.start[0].c.id,
          under = document.elementFromPoint(e.clientX, e.clientY);
        if (under && under.matches('.card.todo li span') && !under.isContentEditable) {
          appState.lastTap = {};
          startEdit(id, under);
          return;
        } // list items edit with one click
        const pid = under?.closest('.card')?.dataset.id || id;
        if (appState.lastTap.id === pid && now - appState.lastTap.t < 420) {
          appState.lastTap = {};
          if (session.sel.size > 1 && byId(pid)?.group && session.sel.has(pid)) {
            selectOnly([pid]);
            if (['text', 'note', 'title', 'todo'].includes(byId(pid).type)) startEdit(pid, under);
            return;
          } // into the group: just this piece
          startEdit(pid, under);
        } else appState.lastTap = { id: pid, t: now };
      }
    }
    if (d.mode === 'resize') save();
    if (d.mode === 'gresize') {
      d.items.forEach(it => {
        renderCard(it.c);
        if (it.c.type === 'note' || it.c.type === 'todo') it.c.userH = it.c.h;
      });
      selectOnly(d.items.map(it => it.c.id));
      save();
    }
    if (d.mode === 'bend') save();
    if (d.mode === 'mrotate' && !d.single)
      appState.mrotKeep = { key: selKey(d.items.map(it => it.c)), anchor: d.anchor }; // the dot stays on the piece that was on top
    if (d.mode === 'mrotate') {
      $('rotBadge').classList.remove('on');
      d.items.forEach(it => {
        renderCard(it.c);
        cardsEl.querySelector(`[data-id="${it.c.id}"]`)?.classList.remove('tilting');
      });
      selectOnly(d.items.map(it => it.c.id));
      save();
      $('selbar').dataset.key = '';
    }
    if (d.mode === 'rotate') {
      $('rotBadge').classList.remove('on');
      cardsEl.querySelector(`[data-id="${d.c.id}"]`)?.classList.remove('tilting');
      save();
      $('selbar').dataset.key = '';
    }
    if (d.mode === 'drawbox') {
      d.rect?.remove();
      const w = toWorld(e.clientX, e.clientY);
      let x = Math.min(d.sx, w.x),
        y = Math.min(d.sy, w.y),
        bw = Math.abs(w.x - d.sx),
        bh = Math.abs(w.y - d.sy);
      if (bw < 6 && bh < 6) {
        bw = 160;
        bh = 100;
      } // a click makes a standard box
      const c = card('box', { x, y, w: Math.round(bw), h: Math.round(bh), r: 0, fill: '#e4e4e7', radius: 6 });
      addCard(c);
      fileIntoFrame([c]);
      pickWF(null);
      selectOnly([c.id]);
      save();
    }
    if (d.mode === 'rewire') {
      const w = toWorld(e.clientX, e.clientY),
        other = d.end === 'a' ? d.l.b : d.l.a,
        pad = 16 / session.view.z;
      const t = [...session.board.cards]
        .reverse()
        .find(
          c =>
            c.id !== other &&
            c.type !== 'coll' &&
            c.type !== 'section' &&
            w.x > c.x - pad &&
            w.x < c.x + c.w + pad &&
            w.y > c.y - pad &&
            w.y < c.y + (c.type === 'title' ? 50 : c.h) + pad,
        );
      if (t) {
        d.l[d.end] = t.id;
        d.l['p' + d.end] = pinAt(t, w);
        save();
      }
      renderWires();
    }
    if (d.mode === 'wire') {
      const w = toWorld(e.clientX, e.clientY),
        t = [...session.board.cards]
          .reverse()
          .find(c => c.id !== d.id && w.x > c.x && w.x < c.x + c.w && w.y > c.y && w.y < c.y + c.h);
      if (t && !session.board.links.some(l => (l.a === d.id && l.b === t.id) || (l.b === d.id && l.a === t.id))) {
        session.board.links.push({ id: uid(), a: d.id, b: t.id, ...(settings.wireStyle || {}) });
        save();
      }
      renderWires();
    }
  });

  stage.addEventListener('dblclick', e => {
    if (penT) {
      const P = penT.pts;
      if (
        P.length > 1 &&
        Math.hypot(P[P.length - 1].x - P[P.length - 2].x, P[P.length - 1].y - P[P.length - 2].y) < 4 / session.view.z
      )
        P.pop();
      endPen(true);
      return;
    } // a double-click finishes the line
    if (settings.dblNote === false) return; // only the setting turns this off
    const hitEl = document.elementFromPoint(e.clientX, e.clientY);
    if (
      hitEl?.closest('.selbar') ||
      hitEl?.closest('.card:not(.section)') ||
      hitEl?.closest('.sec-name, [contenteditable="true"]')
    )
      return;
    if (
      e.target.closest(
        '.card:not(.section), .tools, .tray, .myra, .top, .capture, .side, .keys, .cpop, .home, .selbar, .docview, .hub, .sheet',
      )
    )
      return;
    const w = toWorld(e.clientX, e.clientY),
      c = card('note', { name: '', color: newNoteColor() });
    c.x = snapTo(w.x - c.w / 2);
    c.y = snapTo(w.y - c.h / 2);
    addCard(c);
    selectOnly([c.id]);
    startEdit(c.id);
  });

  // card buttons: pull colours, checklist items
  cardsEl.addEventListener('click', e => {
    const el = e.target.closest('.card');
    if (!el) return;
    const c = byId(el.dataset.id),
      act = e.target.closest('[data-act]')?.dataset.act;
    if (act && act.startsWith('vd-')) return videoAct(c, act, e);
    if (act && act.startsWith('au-')) return audioAct(c, act, e);
    if (act === 'colors') pullColors(c);
    if (act === 'vn-open') return openVNote(c);
    if (act === 'vn-flip') return flipVNote(c);
    if (act === 'vn-full') return toggleVNFull(c);
    if (act === 'item') {
      c.items = c.items || [];
      c.items.push({ t: 'new thing', done: false });
      renderCard(c);
      fitText(c);
      save();
    }
    if (act === 'item-x') {
      const i = +e.target.closest('li').dataset.i;
      remember();
      endEdit();
      c.items.splice(i, 1);
      renderCard(c);
      fitText(c);
      selectOnly([c.id]);
      save();
      return;
    }
    const li = e.target.closest('li');
    if (li && c.type === 'todo') {
      const i = +li.dataset.i;
      if (e.target.matches('input')) {
        c.items[i].done = e.target.checked;
        li.classList.toggle('done', c.items[i].done);
        save();
      } else if (e.target.matches('span') && !e.target.isContentEditable) startEdit(c.id, e.target);
    }
  });

  // trackpad: two fingers pan, pinch (or ctrl + scroll) zooms; the wheel pans up and down, Shift + wheel sideways
  stage.addEventListener(
    'wheel',
    e => {
      if (
        e.target.closest(
          '.tray, .m-bubble, .cpop, .home, .m-chat, .design, .side, .row-menu, .stamp-pick, .wheel-stamps, .docview, .settings, .shapepick, .tplpick',
        )
      )
        return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // a touchpad pinch also arrives as a ctrl + wheel event, but without Ctrl actually held: that one stays smooth (at most 5% per event)
        if (!ctrlHeld)
          return zoomAt(e.clientX, e.clientY, session.view.z * Math.exp(clamp(-e.deltaY * 0.01, -0.05, 0.05)), true);
        // Ctrl + wheel: one step per notch. A notch is one big event, or (high-resolution wheels, two-finger scroll) small ones adding up to 40px
        const d = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
        if (Math.sign(d) !== Math.sign(wheelSum) || performance.now() - wheelAt > 250) wheelSum = 0;
        wheelSum += d;
        wheelAt = performance.now();
        if (Math.abs(wheelSum) >= 40) {
          stepZoom(e.clientX, e.clientY, wheelSum < 0 ? 1 : -1);
          wheelSum = 0;
        }
      } else if (e.shiftKey) {
        session.view.x -= Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        viewSoon();
      } // Shift + wheel pans sideways, as the wheel alone pans up and down
      else {
        session.view.x -= e.deltaX;
        session.view.y -= e.deltaY;
        viewSoon();
      }
    },
    { passive: false },
  );

  addEventListener(
    'keydown',
    e => {
      if (e.key === 'Control' || e.key === 'Meta') ctrlHeld = true;
    },
    true,
  );

  addEventListener(
    'keyup',
    e => {
      if (e.key === 'Control' || e.key === 'Meta') ctrlHeld = false;
    },
    true,
  );

  addEventListener('blur', () => {
    ctrlHeld = false;
  });
}
