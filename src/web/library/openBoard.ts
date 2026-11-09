import { renderAll } from '../canvas/render.ts';
import { $ } from '../core/dom.ts';
import { resetHistory, saveNow } from '../core/history.ts';
import { appState, session } from '../core/state.ts';
import { dueIndex } from '../features/due.ts';
import { findClose } from '../features/find.ts';
import { leaveDraft, restoreDraft } from '../myra/chatDraft.ts';
import { setExpanded } from '../myra/chatExpand.ts';
import { renderChat } from '../myra/chatLog.ts';
import { chatOpen } from '../myra/chatWindow.ts';
import { forgetReplies } from '../myra/replyMemory.ts';
import { showProto } from '../proto/layout.ts';
import { checkCode } from '../repo/codeFolder.ts';
import { askAboutCopy } from '../repo/copy.ts';
import { closeColor } from '../ui/colorPicker.ts';
import { renderPalette } from '../ui/palette.ts';
import { applyToolbar } from '../ui/toolbarConfig.ts';
import { refreshVNotes, vnFull } from '../vault/notes.ts';
import { miniCache } from './homeTiles.ts';
import { refreshBoards } from './rowMenu.ts';

export async function openBoard(id: string) {
  // an edit still waiting to save belongs to the board you're leaving: save it first
  if (appState.saveT && session.board) await saveNow();
  const b = await Fenmyr.load(id);
  if (!b) return;
  // the draft goes with the board you're leaving, words typed while this one loaded included
  await leaveDraft();
  miniCache.clear();
  vnFull.clear();
  appState.histOpen = false;
  findClose(undefined);
  setExpanded(false);
  session.board = { name: '', cards: [], links: [], tray: [], ...b };
  restoreDraft();
  checkCode(session.board);
  showProto(session.board);
  askAboutCopy(session.board);
  if (chatOpen()) setTimeout(renderChat, 0);
  session.board.palette = session.board.palette || [];
  setTimeout(resetHistory, 0);
  forgetReplies();
  session.view = { x: 160, y: 140, z: 1, ...b.view };
  session.sel.clear();
  session.editing = null;
  session.focusSet = null;
  closeColor();
  renderPalette();
  session.board.cards.forEach(c => {
    if (c.type === 'audio' && c.rec) {
      c.rec = false;
      c.paused = false;
      if (!c.src) c.txNote = 'This recording got interrupted. Tap Replace to record again.';
    }
  });
  session.board.cards.forEach(c => {
    if (c.type === 'canvas' && c.board) {
      const kb = appState.boardList.find(x => x.id === c.board);
      if (kb && kb.name !== c.text) c.text = kb.name;
    }
  });
  const field = $('boardName');
  if (field instanceof HTMLInputElement) field.value = session.board.name;
  renderAll();
  refreshBoards();
  refreshVNotes();
  applyToolbar();
  try {
    localStorage.setItem('fenmyr:last', id);
  } catch (_e) {}
  dueIndex();
}
