// @ts-nocheck
import { fit } from '../canvas/handles.ts';
import { miniCache, openBoard } from '../library/home.ts';
import { refreshBoards } from '../library/rowMenu.ts';
import { newBoard } from '../model/boards.ts';
import { session } from '../core/state.ts';

// ---------- canvases: a board inside this board, like a folder you can open ----------
export async function openCanvas(c) {
  if (!c.board) {
    const child = newBoard(c.text || 'Untitled canvas');
    child.parent = session.board.id;
    child.folder = session.board.folder || null;
    c.board = child.id;
    await Fenmyr.save(child);
  }
  session.board.view = session.view;
  await Fenmyr.save(session.board);
  miniCache.delete(c.board);
  await openBoard(c.board);
  fit(session.board.cards);
}

export async function renameChild(c) {
  if (!c.board) return;
  const b = await Fenmyr.load(c.board);
  if (b && c.text && b.name !== c.text) {
    b.name = c.text;
    await Fenmyr.save(b);
    refreshBoards();
  }
}
