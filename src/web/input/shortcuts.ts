// @ts-nocheck
import { endTour, obKeys } from '../app/onboarding.ts';
import { copyCards, lastClip, pasteCards } from '../canvas/clipboard.ts';
import { fit } from '../canvas/handles.ts';
import { renderCard } from '../canvas/render.ts';
import { byId, renderWires, selectOnly, selectWire } from '../canvas/wires.ts';
import { cropping, endCrop } from '../cards/crop.ts';
import { tilt, uid } from '../core/base.ts';
import { $, stage } from '../core/dom.ts';
import { remember, save, travel } from '../core/history.ts';
import { closeDoc, docCard } from '../docs/editor.ts';
import { startFind } from '../features/find.ts';
import { capture, setFocus } from '../features/focus.ts';
import { endEdit } from '../features/tags.ts';
import { closeHome, homeAt } from '../library/home.ts';
import { readyToRecord } from '../media/devices.ts';
import { wonderIfEmpty } from '../myra/chat.ts';
import { chatOpen, myraOpen } from '../myra/chatWindow.ts';
import { removeSelected } from '../myra/helpers.ts';
import { zoomFit, zoomStep, zoomTo } from '../panels/zoomMenu.ts';
import { closeSettings } from '../settings/colors.ts';
import { drawOn, enterDraw, exitDraw } from '../tools/draw.ts';
import { drawPen, endPen, penT, startPen } from '../tools/pen.ts';
import { addCard, drawVec, endVec, refit, vec, vecCard } from '../tools/penEdit.ts';
import { placing, startPlacing, stopPlacing } from '../tools/place.ts';
import { closeColor } from '../ui/colorPicker.ts';
import { toPointer } from '../ui/toolbar.ts';
import { groupSel, pickWF, restack } from '../wireframe/pieces.ts';
import { makeSection } from '../wireframe/sections.ts';
import { appState, session } from '../core/state.ts';
let CLEAN_EL;

function setClean(on) {
  if (on === document.body.classList.contains('clean') || (on && document.body.classList.contains('phone'))) return;
  const fade = (from, to) =>
    CLEAN_EL.forEach(el => el.animate?.([{ opacity: from }, { opacity: to }], { duration: 220, easing: 'ease' }));
  if (on) {
    closeColor();
    myraOpen(false);
    fade(1, 0);
    setTimeout(() => document.body.classList.add('clean'), 200);
  } else {
    document.body.classList.remove('clean');
    fade(0, 1);
  }
}
// the board mustn't grab presses on the pill

const openSettingsKey = () => {
  if (!$('settings').classList.contains('on') && !$('onboard').classList.contains('on')) $('gearBtn').click();
};
export function init20() {
  // ---------- just the board: every panel tucks away (Ctrl+\, like Figma), and comes back with Ctrl+\ or Esc ----------
  CLEAN_EL = ['side', 'tray', 'dock', 'keys', 'design']
    .map(id => $(id))
    .concat([document.querySelector('.top')])
    .filter(Boolean);

  $('cleanBtn').onclick = () => setClean(true);

  $('cleanBack').onclick = () => setClean(false);

  ['pointerdown', 'mousedown', 'dblclick'].forEach(t => $('cleanBack').addEventListener(t, e => e.stopPropagation()));

  addEventListener('keydown', e => {
    const typing = e.target.closest('input, textarea, [contenteditable="true"]');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      capture(true);
      return;
    }
    if (
      (e.metaKey || e.ctrlKey) &&
      !e.shiftKey &&
      !e.altKey &&
      e.key.toLowerCase() === 'f' &&
      !homeAt &&
      !$('settings').classList.contains('on')
    ) {
      e.preventDefault();
      startFind();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === ',' && !e.altKey) {
      e.preventDefault();
      openSettingsKey();
      return;
    } // ⌘, opens Settings, even while typing or at Home
    if ((e.metaKey || e.ctrlKey) && (e.key === '\\' || e.code === 'Backslash') && !homeAt && !docCard) {
      e.preventDefault();
      setClean(!document.body.classList.contains('clean'));
      return;
    }
    if (e.key === 'Escape' && document.body.classList.contains('clean') && !session.editing && !drawOn) {
      setClean(false);
      return;
    }
    if (
      (e.metaKey || e.ctrlKey) &&
      e.key.toLowerCase() === 'z' &&
      !e.target.closest('input, textarea, [contenteditable="true"]') &&
      !homeAt
    ) {
      e.preventDefault();
      travel(e.shiftKey ? 1 : -1);
      return;
    } // inside text, ⌘Z undoes typing as usual
    if (vec && !e.metaKey && !e.ctrlKey && !document.activeElement?.closest?.('input, textarea')) {
      // editing points
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        endVec();
        return;
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && vec.sel.size) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const c = vecCard();
        if (c.pts.length - vec.sel.size >= 2) {
          remember();
          c.pts = c.pts.filter((_, i) => !vec.sel.has(i));
          if (c.pts.length < 3) c.closed = undefined;
          vec.sel.clear();
          refit(c);
          renderCard(c);
          drawVec();
          save();
        }
        return;
      }
    }
    if (penT && !session.editing && !e.metaKey && !e.ctrlKey) {
      // the Pen: Enter or Esc finishes, Backspace takes back the last point
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        endPen(true);
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        e.stopImmediatePropagation();
        penT.pts.pop();
        drawPen();
        return;
      }
    }
    if (e.key === 'Escape' && homeAt) {
      closeHome();
      return;
    }
    if (
      e.key === 'Enter' &&
      $('coach').classList.contains('on') &&
      !session.editing &&
      !document.activeElement?.closest?.('input, textarea, [contenteditable="true"]') &&
      !$('capture').classList.contains('on')
    ) {
      e.preventDefault();
      $('coachNext').click();
      return;
    }
    if (
      e.key === 'Escape' &&
      $('coach').classList.contains('on') &&
      !session.editing &&
      !document.activeElement?.closest?.('input, textarea, [contenteditable="true"]') &&
      !$('capture').classList.contains('on')
    ) {
      endTour();
      return;
    }
    if ($('onboard').classList.contains('on')) return obKeys(e); // setup has its own keys
    if (e.key === 'Escape' && $('settings').classList.contains('on')) {
      closeSettings();
      return;
    }
    if (e.key === 'Escape' && cropping) {
      endCrop('cancel');
      return;
    }
    if (e.key === 'Enter' && cropping && !e.target.closest('input, textarea, [contenteditable="true"]')) {
      endCrop('done');
      return;
    }
    if (e.key === 'Escape' && drawOn) {
      exitDraw();
      return;
    }
    if (e.key === 'Escape' && docCard) {
      closeDoc();
      return;
    }
    if (
      e.key === 'Escape' &&
      (placing ||
        $('shapePick').classList.contains('on') ||
        $('tplPick').classList.contains('on') ||
        $('stampWheel').classList.contains('on') ||
        $('stampPick').classList.contains('on'))
    ) {
      stopPlacing();
      return;
    }
    if (e.key === 'Escape' && session.selWire) {
      selectWire(null);
      return;
    }
    if (e.key === 'Escape') {
      closeColor();
      capture(false);
      endEdit();
      setFocus(false);
      selectOnly([]);
      myraOpen(false);
      document.activeElement.blur();
      return;
    }
    if (typing || homeAt || $('capture').classList.contains('on')) return; // never fire board shortcuts while quick capture is open
    if (e.key === ' ') {
      session.space = true;
      stage.classList.add('space');
      e.preventDefault();
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && session.selWire) {
      session.board.links = session.board.links.filter(l => l.id !== session.selWire);
      session.selWire = null;
      renderWires();
      save();
      return;
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && session.sel.size) removeSelected();
    if ((e.metaKey || e.ctrlKey) && e.altKey && e.code === 'KeyG' && session.sel.size) {
      e.preventDefault();
      makeSection();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g' && session.sel.size) {
      e.preventDefault();
      groupSel(!e.shiftKey);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && !e.altKey && ['=', '+', '-', '_', '0'].includes(e.key)) {
      e.preventDefault();
      return e.key === '0' ? zoomTo(1) : zoomStep(e.key === '=' || e.key === '+' ? 1 : -1);
    }
    if (e.shiftKey && !e.metaKey && !e.ctrlKey && e.code === 'Digit1') {
      e.preventDefault();
      return zoomFit();
    }
    if ((e.metaKey || e.ctrlKey) && (e.code === 'BracketRight' || e.code === 'BracketLeft') && session.sel.size) {
      e.preventDefault();
      restack(e.code === 'BracketRight' ? (e.shiftKey ? 'front' : 'forward') : e.shiftKey ? 'back' : 'backward');
      return;
    }
    if ((e.metaKey || e.ctrlKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase()) && session.sel.size) {
      e.preventDefault();
      $('selbar')
        .querySelector(`[data-ts="${{ b: 'bold', i: 'italic', u: 'under' }[e.key.toLowerCase()]}"]`)
        ?.click();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      selectOnly(session.board.cards.map(c => c.id));
    }
    if ((e.metaKey || e.ctrlKey) && ['c', 'x'].includes(e.key.toLowerCase()) && session.sel.size && !homeAt) {
      const r = copyCards();
      if (r) {
        navigator.clipboard?.writeText(r.text).catch(() => {});
        if (e.key.toLowerCase() === 'x') {
          e.preventDefault();
          removeSelected();
        }
      }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v' && !homeAt) {
      appState.pendingPaste = true;
      setTimeout(() => {
        if (appState.pendingPaste && lastClip) pasteCards();
        appState.pendingPaste = false;
      }, 150);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd' && session.sel.size) {
      e.preventDefault();
      const gm = {},
        copies = [...session.sel].map(id =>
          Object.assign(JSON.parse(JSON.stringify(byId(id))), { id: uid(), r: tilt() }),
        );
      copies.forEach(c => {
        if (c.group) c.group = gm[c.group] || (gm[c.group] = uid());
      });
      copies.forEach(c => {
        c.x += 30;
        c.y += 30;
        addCard(c);
      });
      selectOnly(copies.map(c => c.id));
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'f') setFocus(!session.focusSet);
    if (k === 'n') startPlacing('note');
    if (k === 't') startPlacing('title');
    if (k === 'c') startPlacing('todo');
    if (k === 'g') startPlacing('coll');
    if (k === 'r') pickWF('box');
    if (k === 'x') pickWF('text');
    if (k === 'd') startPlacing('doc');
    if (k === 's') $('tools').querySelector('[data-add="shape"]').click();
    if (k === 'e') $('tools').querySelector('[data-add="stamp"]').click();
    if (k === 'l') startPlacing('link');
    if (k === 'p' && e.shiftKey) {
      penT ? endPen(true) : startPen();
      return;
    }
    if (k === 'p') drawOn ? exitDraw() : enterDraw();
    if (k === 'a') readyToRecord().then(ok => ok && startPlacing('audio'));
    if (k === 'v') {
      if (e.shiftKey) startPlacing('video');
      else toPointer();
    }
    if (k === 'i') $('filePick').click();
    if (k === '0') fit(session.board.cards);
    if (k === 'm') {
      e.preventDefault();
      const was = chatOpen();
      myraOpen(true);
      if (!was) wonderIfEmpty();
    }
  });

  addEventListener('keyup', e => {
    if (e.key === ' ') {
      session.space = false;
      stage.classList.remove('space');
    }
  });
}
