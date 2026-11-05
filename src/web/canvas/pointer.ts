import { pullColors } from '../cards/imageColors.ts';
import { clamp } from '../core/base.ts';
import { cardsEl, stage } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { appState, session } from '../core/state.ts';
import { endEdit, startEdit } from '../edit/editing.ts';
import { linkUnder } from '../edit/noteLinks.ts';
import { fitText } from '../edit/text.ts';
import { audioAct } from '../media/devices.ts';
import { videoAct } from '../media/video.ts';
import { card } from '../model/boards.ts';
import { placeSelbar } from '../selbar/selbar.ts';
import { newNoteColor, snapTo } from '../settings/licenses.ts';
import { settings } from '../settings/settings.ts';
import { endPen, penT } from '../tools/pen.ts';
import { addCard } from '../tools/penEdit.ts';
import { cardEl, closestTo } from '../ui/dom.ts';
import { flipVNote, openVNote, toggleVNFull } from '../vault/notes.ts';
import { revealCards } from '../wireframe/drawer.ts';
import { onDragMove } from './dragMove.ts';
import { stepZoom, toWorld, viewSoon, zoomAt } from './handles.ts';
import { clearStuckDrag } from './pointerKit.ts';
import { onPress } from './press.ts';
import { onRelease } from './release.ts';
import { renderCard } from './render.ts';
import { byId, selectOnly } from './wires.ts';

let ctrlHeld = false;
let wheelSum = 0;
let wheelAt = 0;
export function init16() {
  // ---------- pointer: drag cards, resize, connect, marquee, pan ----------
  appState.drag = null;

  stage.addEventListener('pointercancel', () => {
    if (appState.drag?.mode === 'move') {
      appState.drag.start?.forEach(s => {
        const el = s.el || cardEl(s.c.id);
        if (el) {
          el.style.left = `${s.c.x}px`;
          el.style.top = `${s.c.y}px`;
        }
      });
    }
    appState.drag = null;
    clearStuckDrag();
    placeSelbar();
  });

  stage.addEventListener('pointerdown', onPress);

  stage.addEventListener('pointermove', onDragMove);

  stage.addEventListener('pointerup', onRelease);

  stage.addEventListener('dblclick', e => {
    if (penT) {
      const P = penT.pts,
        last = P.at(-1),
        prev = P.at(-2);
      if (last && prev && Math.hypot(last.x - prev.x, last.y - prev.y) < 4 / session.view.z) P.pop();
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
      closestTo(
        e.target,
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

  // A press on a note's link opens it on release, so a click that reaches the link came from the keyboard.
  cardsEl.addEventListener('click', e => {
    const href = linkUnder(closestTo(e.target, 'a'));
    if (!href) return;
    e.preventDefault();
    Fenmyr.openURL(href);
  });
  // Tab can land on a link in a note out of sight. A click focuses the link too, and must not move the board.
  cardsEl.addEventListener('focusin', e => {
    const a = closestTo(e.target, 'a:focus-visible'),
      c = byId(closestTo(a, '.card')?.dataset.id ?? '');
    if (c && linkUnder(a)) revealCards([c]);
  });

  // card buttons: pull colours, checklist items
  cardsEl.addEventListener('click', e => {
    const el = closestTo(e.target, '.card');
    if (!el) return;
    const c = byId(el.dataset.id ?? ''),
      act = closestTo(e.target, '[data-act]')?.dataset.act;
    if (!c) return;
    if (c.type === 'video' && act?.startsWith('vd-')) return videoAct(c, act, e);
    if (c.type === 'audio' && act?.startsWith('au-')) return audioAct(c, act, e);
    if (act === 'colors') pullColors(c);
    if (c.type === 'vnote') {
      if (act === 'vn-open') return openVNote(c);
      if (act === 'vn-flip') return flipVNote(c);
      if (act === 'vn-full') return toggleVNFull(c);
    }
    if (c.type !== 'todo') return;
    if (act === 'item') {
      c.items = c.items || [];
      c.items.push({ t: 'new thing', done: false });
      renderCard(c);
      fitText(c);
      save();
    }
    if (act === 'item-x') {
      const i = +(closestTo(e.target, 'li')?.dataset.i ?? -1);
      remember();
      endEdit();
      if (i >= 0) c.items?.splice(i, 1);
      renderCard(c);
      fitText(c);
      selectOnly([c.id]);
      save();
      return;
    }
    const li = closestTo(e.target, 'li');
    const item = c.items?.[+(li?.dataset.i ?? -1)],
      t = e.target;
    if (li && item) {
      if (t instanceof HTMLInputElement) {
        item.done = t.checked;
        li.classList.toggle('done', item.done);
        save();
      } else if (t instanceof HTMLSpanElement && !t.isContentEditable) startEdit(c.id, t);
    }
  });

  // trackpad: two fingers pan, pinch (or ctrl + scroll) zooms; the wheel pans up and down, Shift + wheel sideways
  stage.addEventListener(
    'wheel',
    e => {
      if (
        closestTo(
          e.target,
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
