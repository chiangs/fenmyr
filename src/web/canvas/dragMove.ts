import { cardEl, oneIn } from '../ui/dom.ts';
import { cloneForDrag } from './clipboard.ts';
import { ROT_FIXED, toWorld } from './handles.ts';
import { titleW } from './render.ts';
import { applyView } from './view.ts';
import { byId, renderWires, selectOnly, wireGeom } from './wires.ts';
import { CGAP, CPAD, CW, layoutColl } from '../cards/collection.ts';
import { collAt } from '../cards/kanban.ts';
import { clamp } from '../core/base.ts';
import { $, cardsEl, stage, world } from '../core/dom.ts';
import { docTarget } from '../docs/drop.ts';
import { fsMul, SIZED } from '../selbar/textSize.ts';
import { penMove, penT } from '../tools/pen.ts';
import { syncDesign } from '../wireframe/designPanel.ts';
import { groupOf, snapWF } from '../wireframe/tilt.ts';
import { appState, session } from '../core/state.ts';

import { overTray, setFs } from './pointerKit.ts';

// the pointer moving with a button held: one step of whatever the press started
export function onDragMove(e: PointerEvent) {
  if (penT && !appState.drag) {
    penMove(e);
    return;
  }
  const d = appState.drag;
  if (!d) return;
  const w = toWorld(e.clientX, e.clientY);
  if (d.mode === 'pan') {
    session.view.x = d.vx + e.clientX - d.sx;
    session.view.y = d.vy + e.clientY - d.sy;
    applyView();
  }
  if (d.mode === 'move') {
    let dx = w.x - d.sx,
      dy = w.y - d.sy;
    if (!d.moved && Math.hypot(dx, dy) > 2) {
      d.moved = true;
      if (e.altKey) cloneForDrag();
    }
    const sn = snapWF(d.start, dx, dy);
    dx = sn.dx;
    dy = sn.dy;
    // move on the GPU: the card is lifted as an already-drawn picture and slid with a transform, so the wobbly-edge filter isn't redrawn every frame (Safari is slow at that)
    d.start.forEach(s => {
      s.c.x = s.x + dx;
      s.c.y = s.y + dy;
      const el = s.el || (s.el = cardEl(s.c.id));
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
    const loose = d.start.filter(s => s.c.type !== 'coll'),
      skip = new Set(d.start.filter(s => s.c.type === 'coll').map(s => s.c.id));
    cardsEl.querySelectorAll('.drop-in, .drop-col').forEach(n => n.classList.remove('drop-in', 'drop-col'));
    const dt = loose.length && !skip.size && docTarget(e, w, loose);
    $('docview').classList.toggle('drop', dt === 'page');
    if (dt && dt !== 'page') {
      cardEl(dt.id)?.classList.add('drop-in');
    } else if (loose.length && !skip.size) {
      const t = collAt(w, skip);
      if (t) cardEl(t.s.id)?.classList.add(t.side ? 'drop-col' : 'drop-in');
    }
  }
  if (d.mode === 'resize') {
    const c = byId(d.id),
      el = c ? cardEl(c.id) : null;
    if (!c || !el) return;
    if (c.type === 'coll' && !c.kanban) {
      c.cols = Math.max(1, Math.round((d.w0 + w.x - d.sx - CPAD * 2 + CGAP) / (CW + CGAP)));
      layoutColl(c);
      renderWires();
      return;
    }
    if (c.type === 'stamp' || c.type === 'icon') {
      c.w = c.h = clamp(d.w0 + Math.max(w.x - d.sx, w.y - d.sy), 24, 400);
      Object.assign(el.style, { width: c.w + 'px', height: c.h + 'px' });
      el.style.setProperty('--sz', c.w + 'px');
      return;
    }
    // Shift + resize scales the whole thing: same shape, and the words (and everything inside) grow or shrink with it
    const scaling = e.shiftKey && !['coll', 'frame', 'section'].includes(c.type);
    if (scaling) {
      const kx = (d.w0 + w.x - d.sx) / d.w0,
        ky = (d.h0 + w.y - d.sy) / d.h0,
        k = Math.max(0.2, Math.min(12, Math.abs(kx - 1) >= Math.abs(ky - 1) ? kx : ky));
      c.w = Math.round(d.w0 * k);
      c.h = Math.round(d.h0 * k);
      if (SIZED.includes(c.type)) {
        setFs(c, d.fs0 * k);
        el.style.setProperty('--fs', String(fsMul(c)));
      }
    } else {
      c.w = Math.max(80, d.w0 + w.x - d.sx);
      c.h = Math.max(50, d.h0 + w.y - d.sy);
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
    if (scaling) return;
  }
  if (d.mode === 'gresize' && d.multi && e.shiftKey) {
    const kx = (d.bw + w.x - d.sx) / d.bw,
      ky = (d.bh + w.y - d.sy) / d.bh,
      k = Math.max(0.15, Math.abs(kx - 1) >= Math.abs(ky - 1) ? kx : ky);
    d.items.forEach(it => {
      const c = it.c;
      c.x = d.bx + (it.x - d.bx) * k;
      c.y = d.by + (it.y - d.by) * k;
      c.w = Math.max(8, it.w * k);
      c.h = Math.max(8, it.h * k);
      if (SIZED.includes(c.type)) {
        setFs(c, (it.fs0 ?? 1) * k);
      }
      if (c.type === 'text' && it.size0) c.size = Math.max(4, Math.round(it.size0 * k * 10) / 10);
      if (c.type === 'title' && c.fixedW) c.w = Math.max(8, it.w * k);
      const el = cardEl(c.id);
      if (el) {
        Object.assign(el.style, {
          left: c.x + 'px',
          top: c.y + 'px',
          width: titleW(c),
          height: c.type === 'title' ? 'auto' : c.h + 'px',
        });
        el.style.setProperty('--fs', String(fsMul(c)));
        if (c.type === 'text') {
          const tx = oneIn(el, '.tx');
          if (tx) tx.style.fontSize = (c.size || 18) + 'px';
        }
      }
    });
    renderWires();
  } else if (d.mode === 'gresize') {
    const nw = Math.max(24, d.bw + w.x - d.sx),
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
      const el = cardEl(c.id);
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
  if (d.mode === 'wire') {
    d.b = w;
    renderWires({ a: d.a, b: w });
  }
  if (d.mode === 'mrotate') {
    let a = ((Math.atan2(w.y - d.cy, w.x - d.cx) - d.a0) * 180) / Math.PI;
    a = ((a + 540) % 360) - 180;
    a = e.shiftKey ? Math.round(a / 15) * 15 : Math.abs(a - Math.round(a / 15) * 15) < 2 ? Math.round(a / 15) * 15 : a;
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
      const el = cardEl(c.id);
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
  if (d.mode === 'rotate') {
    let a = (Math.atan2(w.y - d.cy, w.x - d.cx) * 180) / Math.PI + 90;
    a = ((a % 360) + 360) % 360;
    if (a > 180) a -= 360;
    const near = Math.round(a / 15) * 15;
    if (Math.abs(a - near) < 4) a = near; // eases onto 15° steps
    if (d.tilt) {
      d.c.r = Math.round(a);
      d.c.tilted = true;
      cardEl(d.c.id)?.style.setProperty('--tilt', d.c.r + 'deg');
    } else {
      d.c.rot = Math.round(a);
      cardEl(d.c.id)?.style.setProperty('--rot', d.c.rot + 'deg');
      syncDesign();
    }
    const rb = $('rotBadge');
    rb.textContent = Math.round(a) + '°';
    rb.style.left = e.clientX + 18 + 'px';
    rb.style.top = e.clientY - 34 + 'px';
    rb.classList.add('on');
  }
  if (d.mode === 'drawbox') {
    let r = d.rect;
    if (!r) {
      r = d.rect = document.createElement('div');
      r.className = 'draw-rect';
      world.appendChild(r);
    }
    const x = Math.min(d.sx, w.x),
      y = Math.min(d.sy, w.y);
    Object.assign(r.style, {
      left: x + 'px',
      top: y + 'px',
      width: Math.abs(w.x - d.sx) + 'px',
      height: Math.abs(w.y - d.sy) + 'px',
    });
  }
  if (d.mode === 'bend') {
    const a = byId(d.l.a),
      b = byId(d.l.b);
    if (a && b) {
      d.l.bend = 0;
      const g = wireGeom(d.l, a, b),
        bend = 2 * ((w.x - g.mid.x) * g.n.x + (w.y - g.mid.y) * g.n.y);
      d.l.bend = Math.abs(bend) < 12 ? 0 : Math.round(bend);
      renderWires();
    }
  } // pull it flat and it snaps straight
  if (d.mode === 'rewire') {
    const ke = d.end === 'a' ? 'b' : 'a',
      a = byId(d.l.a),
      b = byId(d.l.b);
    if (a && b) {
      const g = wireGeom(d.l, a, b);
      renderWires({ a: ke === 'a' ? g.p0 : g.p2, b: w });
    }
  }
  if (d.mode === 'marquee') {
    const m = $('marquee'),
      r = stage.getBoundingClientRect(),
      x0 = Math.min(d.sx, e.clientX),
      y0 = Math.min(d.sy, e.clientY),
      x1 = Math.max(d.sx, e.clientX),
      y1 = Math.max(d.sy, e.clientY);
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
    selectOnly([...new Set([...d.base, ...hit])]);
  }
}
