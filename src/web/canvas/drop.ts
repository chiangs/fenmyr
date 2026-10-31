// @ts-nocheck
import { isTyping } from '../ui/dom.ts';
import { lastClip, pasteCards } from './clipboard.ts';
import { toWorld } from './handles.ts';
import { overTray } from './pointer.ts';
import { byId } from './wires.ts';
import { addImages, linkCard, pictureForNote, spotifyOf } from '../cards/spotify.ts';
import { $, stage } from '../core/dom.ts';
import { capture } from '../features/focus.ts';
import { nestBoard } from '../library/nesting.ts';
import { refreshBoards } from '../library/rowMenu.ts';
import { addAtCenter, centerWorld } from '../panels/zoomMenu.ts';
import { appState, session } from '../core/state.ts';
export function init23() {
  // ---------- paste and drop ----------
  addEventListener('paste', e => {
    appState.pendingPaste = false; // a real paste arrived, so Ctrl+V's fallback (pasting the cards you last copied) must stand down, whichever way this paste goes
    // pictures never go inside a card's text: a note gets a connected picture card, anything else you were typing in gets one on the board
    const imgs = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/')),
      one = !session.editing && session.sel.size === 1 && !isTyping(e.target) ? byId([...session.sel][0]) : null;
    if (imgs.length && !$('capture').classList.contains('on')) {
      const into = session.editing && e.target.closest?.('.card.editing') ? byId(session.editing) : one;
      if (into?.type === 'note') {
        e.preventDefault();
        pictureForNote(into, imgs);
        return;
      }
      if (session.editing && e.target.closest?.('.card.editing')) {
        e.preventDefault();
        addImages(imgs, null);
        return;
      }
    }
    if (isTyping(e.target) && !(e.target.id === 'capInput' && e.clipboardData.files?.length)) return; // a picture pasted into quick capture goes to Unsorted
    appState.pendingPaste = false;
    // cards copied in Fenmyr (on this board or another one) come back as cards
    const tx = e.clipboardData.getData('text/plain');
    if (
      lastClip &&
      !e.clipboardData.files?.length &&
      (e.clipboardData.getData('text/x-fenmyr') || tx === lastClip.text)
    ) {
      e.preventDefault();
      return pasteCards();
    }
    const files = [...(e.clipboardData.files || [])];
    const intoTray = $('capture').classList.contains('on');
    if (files.length) {
      e.preventDefault();
      addImages(files, null, intoTray);
      capture(false);
      return;
    }
    const t = e.clipboardData.getData('text/plain').trim();
    if (!t) return;
    e.preventDefault();
    if (/^https?:\/\/\S+$/.test(t) || spotifyOf(t)) linkCard(t, centerWorld());
    else addAtCenter('note', { text: t, color: 'butter' });
  });

  stage.addEventListener('dragover', e => e.preventDefault());

  stage.addEventListener('drop', e => {
    e.preventDefault();
    const files = [...e.dataTransfer.files],
      w = toWorld(e.clientX, e.clientY);
    const bid = e.dataTransfer.getData('fenmyr/board');
    if (bid && session.board)
      return nestBoard(bid, session.board.id, { x: w.x - 130, y: w.y - 90 }).then(ok => ok && refreshBoards());
    if (files.length) {
      const ed = session.editing && e.target.closest?.('.card.editing') ? byId(session.editing) : null;
      if (ed?.type === 'note') return pictureForNote(ed, files);
      return addImages(files, w, overTray(e));
    }
    const u = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (/^https?:/.test(u)) linkCard(u.trim(), w);
  });
}
