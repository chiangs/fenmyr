import { addImages, linkCard, pictureForNote, spotifyOf } from '../cards/spotify.ts';
import { $, stage } from '../core/dom.ts';
import { appState, session } from '../core/state.ts';
import { capture } from '../features/focus.ts';
import { nestBoard } from '../library/nesting.ts';
import { refreshBoards } from '../library/rowMenu.ts';
import { addAtCenter, centerWorld } from '../panels/zoomMenu.ts';
import { closestTo, isTyping } from '../ui/dom.ts';
import { lastClip, pasteCards } from './clipboard.ts';
import { toWorld } from './handles.ts';
import { overTray } from './pointerKit.ts';
import { byId } from './wires.ts';
export function init23() {
  // ---------- paste and drop ----------
  addEventListener('paste', e => {
    appState.pendingPaste = false; // a real paste arrived, so Ctrl+V's fallback (pasting the cards you last copied) must stand down, whichever way this paste goes
    // pictures never go inside a card's text: a note gets a connected picture card, anything else you were typing in gets one on the board
    const imgs = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/')),
      one = !session.editing && session.sel.size === 1 && !isTyping(e.target) ? byId([...session.sel][0] ?? '') : null;
    const inEditing = closestTo(e.target, '.card.editing'),
      clip = e.clipboardData;
    if (imgs.length && !$('capture').classList.contains('on')) {
      const into = session.editing && inEditing ? byId(session.editing) : one;
      if (into?.type === 'note') {
        e.preventDefault();
        pictureForNote(into, imgs);
        return;
      }
      if (session.editing && inEditing) {
        e.preventDefault();
        addImages(imgs, null);
        return;
      }
    }
    if (!clip) return;
    const capturing = e.target instanceof Element && e.target.id === 'capInput';
    if (isTyping(e.target) && !(capturing && clip.files.length)) return; // a picture pasted into quick capture goes to Unsorted
    appState.pendingPaste = false;
    // cards copied in Fenmyr (on this board or another one) come back as cards
    const tx = clip.getData('text/plain');
    if (lastClip && !clip.files.length && (clip.getData('text/x-fenmyr') || tx === lastClip.text)) {
      e.preventDefault();
      return pasteCards();
    }
    const files = [...clip.files];
    const intoTray = $('capture').classList.contains('on');
    if (files.length) {
      e.preventDefault();
      addImages(files, null, intoTray);
      capture(false);
      return;
    }
    const t = clip.getData('text/plain').trim();
    if (!t) return;
    e.preventDefault();
    if (/^https?:\/\/\S+$/.test(t) || spotifyOf(t)) linkCard(t, centerWorld());
    else addAtCenter('note', { text: t, color: 'butter' });
  });

  stage.addEventListener('dragover', e => e.preventDefault());

  stage.addEventListener('drop', e => {
    e.preventDefault();
    const dt = e.dataTransfer;
    if (!dt) return;
    const files = [...dt.files],
      w = toWorld(e.clientX, e.clientY);
    const bid = dt.getData('fenmyr/board');
    if (bid && session.board) {
      nestBoard(bid, session.board.id, { x: w.x - 130, y: w.y - 90 }).then(ok => {
        if (ok) refreshBoards();
      });
      return;
    }
    if (files.length) {
      const ed = session.editing && closestTo(e.target, '.card.editing') ? byId(session.editing) : null;
      if (ed?.type === 'note') pictureForNote(ed, files);
      else addImages(files, w, overTray(e));
      return;
    }
    const u = dt.getData('text/uri-list') || dt.getData('text/plain');
    if (/^https?:/.test(u)) linkCard(u.trim(), w);
  });
}
