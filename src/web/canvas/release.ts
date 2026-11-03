import { cardEl } from '../ui/dom.ts';
import { selKey, toWorld } from './handles.ts';
import { renderCard } from './render.ts';
import { byId, pinAt, renderTray, renderWires, selectOnly, sendToTray } from './wires.ts';
import { parentOf } from '../cards/collection.ts';
import { collAt, dropInto } from '../cards/kanban.ts';
import { tilt, uid } from '../core/base.ts';
import { $, cardsEl, stage } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { docTarget, dropIntoDoc } from '../docs/drop.ts';
import { startEdit } from '../features/tags.ts';
import { card } from '../model/boards.ts';
import { snapTo } from '../settings/licenses.ts';
import { settings } from '../settings/settings.ts';
import { drawPen, penT } from '../tools/pen.ts';
import { addCard } from '../tools/penEdit.ts';
import { openColor } from '../ui/colorPicker.ts';
import { pickWF } from '../wireframe/designPanel.ts';
import { fileIntoFrame } from '../wireframe/tilt.ts';
import { appState, session } from '../core/state.ts';

import { overTray } from './pointerKit.ts';

// letting go: the drag lands (snaps, files into a column or a screen, goes to Unsorted) and is saved
export function onRelease(e: PointerEvent) {
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
      const el = s.el || cardEl(s.c.id);
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
    const lead = d.start[0]?.c;
    if (d.moved) {
      if (settings.snap && lead) {
        const dx = snapTo(lead.x) - lead.x,
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
            const c = byId(id);
            if (from && c) {
              from.kids = from.kids.filter(k => k !== id);
              cardEl(id)?.classList.remove('inside');
              c.r = tilt();
              renderCard(c);
            }
          });
      }
      if (!skip.size) fileIntoFrame(d.start.map(s2 => s2.c).filter(c => c.type !== 'frame' && !parentOf(c.id)));
      save();
      renderWires();
    } else if (
      d.start.length === 1 &&
      lead?.type === 'swatch' &&
      document.elementFromPoint(e.clientX, e.clientY)?.closest('.chipcol')
    )
      openColor(lead); // only the color itself opens the wheel; the rest of the card just selects it
    else if (lead) {
      // our own double-click check (pointer events don't count clicks everywhere), on whatever is really under the pointer
      const now = Date.now(),
        id = lead.id,
        under = document.elementFromPoint(e.clientX, e.clientY);
      if (under instanceof HTMLElement && under.matches('.card.todo li span') && !under.isContentEditable) {
        appState.lastTap = {};
        startEdit(id, under);
        return;
      } // list items edit with one click
      const pid = under?.closest<HTMLElement>('.card')?.dataset.id || id;
      if (appState.lastTap.id === pid && now - (appState.lastTap.t ?? 0) < 420) {
        appState.lastTap = {};
        if (session.sel.size > 1 && byId(pid)?.group && session.sel.has(pid)) {
          selectOnly([pid]);
          if (['text', 'note', 'title', 'todo'].includes(byId(pid)?.type ?? '')) startEdit(pid, under);
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
  if (d.mode === 'mrotate' && !d.single) appState.mrotKeep = { key: selKey(d.items.map(it => it.c)), anchor: d.anchor }; // the dot stays on the piece that was on top
  if (d.mode === 'mrotate') {
    $('rotBadge').classList.remove('on');
    d.items.forEach(it => {
      renderCard(it.c);
      cardEl(it.c.id)?.classList.remove('tilting');
    });
    selectOnly(d.items.map(it => it.c.id));
    save();
    $('selbar').dataset.key = '';
  }
  if (d.mode === 'rotate') {
    $('rotBadge').classList.remove('on');
    cardEl(d.c.id)?.classList.remove('tilting');
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
      if (d.end === 'a') {
        d.l.a = t.id;
        d.l.pa = pinAt(t, w);
      } else {
        d.l.b = t.id;
        d.l.pb = pinAt(t, w);
      }
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
}
