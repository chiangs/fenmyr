import type { Folder, Project } from '../../shared/model.ts';
import type { BoardSummary } from '../../shared/ops.ts';
import { appState, session } from '../core/state.ts';
import { newPrototypeIn } from '../repo/prototypes.ts';
import { chirp } from '../settings/licenses.ts';
import { child } from '../ui/dom.ts';
import { closeHome } from './home.ts';
import { draggable, dropZone, inlineRename, nestBoard, newBoardIn, reorderZone } from './nesting.ts';
import { openBoard } from './openBoard.ts';
import { type Kind, refreshBoards, renameBoard, renameNewest, rowMenu, type Thing, uniqueName } from './rowMenu.ts';
import {
  boardsIn,
  foldersIn,
  holdsBoard,
  makeFolder,
  moveBoard,
  putFolder,
  saveLib,
  subFolders,
  tint,
} from './tree.ts';

let FBTN: { add: string; ren: string; del: string };
export const FBTN_OF = (a: string) => (a === 'add' ? FBTN.add : a === 'ren' ? FBTN.ren : FBTN.del);

// the left box: a small tree (projects ▸ folders ▸ boards)
export function boardRow(b: BoardSummary): Node {
  const r = document.createElement('div');
  r.className = `board-row${session.board && b.id === session.board.id ? ' on' : ''}${b.kind === 'prototype' ? ' proto' : ''}`;
  const shade = tint(b.color);
  r.innerHTML = `<i style="background:${shade}"></i><span></span>`;
  child(r, 'span').textContent = b.name;
  // one click opens the board; a double-click renames it right here (so wait a beat to tell them apart)
  let tap: ReturnType<typeof setTimeout> | undefined;
  const name = child(r, 'span');
  r.onclick = () => {
    if (name.isContentEditable) return;
    clearTimeout(tap);
    tap = setTimeout(() => {
      closeHome();
      openBoard(b.id);
    }, 230);
  };
  r.ondblclick = e => {
    e.stopPropagation();
    clearTimeout(tap);
    inlineRename(name, b, v => renameBoard(b, v));
  };
  const pen = document.createElement('button');
  pen.className = 'f-btn';
  pen.title = 'Rename';
  pen.innerHTML = FBTN.ren;
  r.appendChild(pen);
  pen.onclick = e => {
    e.stopPropagation();
    clearTimeout(tap);
    inlineRename(name, b, v => renameBoard(b, v));
  };
  draggable(r, 'board', b.id);
  reorderZone(r, b);
  dropZone(r, 'board', id => nestBoard(id, b.id));
  r.oncontextmenu = e => rowMenu(e, 'board', b, name);
  const kids = appState.boardList.filter(x => x.parent === b.id);
  if (!kids.length) return r;
  const frag = document.createDocumentFragment(),
    sub = document.createElement('div');
  sub.className = 'sub-boards';
  kids.forEach(k => {
    sub.appendChild(boardRow(k));
  });
  frag.appendChild(r);
  frag.appendChild(sub);
  return frag;
}

function treeNode(obj: Thing, kind: Kind, count: number, kids: Node[], btns: [string, string, string][]) {
  const wrap = document.createElement('div');
  wrap.className = `node ${kind}${obj.open ? ' open' : ''}`;
  const pic = kind === 'project' ? 'pic' : 'fic',
    buttons = btns
      .map(([a, t, s]) => {
        const icon = FBTN_OF(a) || s;
        return `<button class="f-btn" data-a="${a}" title="${t}">${icon}</button>`;
      })
      .join('');
  wrap.innerHTML = `<div class="node-head"><span class="chev">▶</span><span class="${pic}"></span><span class="fname"></span><small>${count}</small>${buttons}</div><div class="node-body"></div>`;
  if (kind === 'project') child(wrap, '.pic').style.background = tint(obj.color ?? '');
  const name = child(wrap, '.fname'),
    body = child(wrap, '.node-body');
  name.textContent = obj.name;
  kids.forEach(k => {
    body.appendChild(k);
  });
  if (!kids.length) {
    const empty = kind === 'project' ? 'No folders yet' : 'Drag boards in here';
    body.innerHTML = `<div class="folder-empty">${empty}</div>`;
  }
  name.ondblclick = e => {
    e.stopPropagation();
    inlineRename(name, obj);
  };
  return { wrap, name };
}

export function folderNode(f: Folder): HTMLElement {
  const inside = boardsIn(f.id),
    subs = subFolders(f.id);
  if (holdsBoard(f)) f.open = true;
  const { wrap, name } = treeNode(
    f,
    'folder',
    inside.length + subs.length,
    [...subs.map(folderNode), ...inside.map(boardRow)],
    [
      ['add', f.kind === 'prototyping' ? 'New prototype in this folder' : 'New board in this folder', '+'],
      ['ren', 'Rename', '✎'],
    ],
  );
  wrap.classList.toggle('proto', f.kind === 'prototyping');
  child(wrap, '.node-head').onclick = async e => {
    const a = e.target instanceof Element ? e.target.closest<HTMLElement>('.f-btn')?.dataset.a : undefined;
    if (a === 'add') return f.kind === 'prototyping' ? newPrototypeIn(f) : newBoardIn(f.id);
    if (a === 'ren') return inlineRename(name, f);
    if (a === 'del') {
      for (const b of inside) await moveBoard(b.id, null);
      subs.forEach(x => {
        x.parent = f.parent;
        if (!x.parent) delete x.parent;
      });
      appState.folders = appState.folders.filter(x => x !== f);
      await saveLib();
      return refreshBoards();
    }
    if (name.isContentEditable) return;
    f.open = !f.open;
    wrap.classList.toggle('open', f.open);
    saveLib();
  };
  draggable(child(wrap, '.node-head'), 'folder', f.id);
  child(wrap, '.node-head').oncontextmenu = e => rowMenu(e, 'folder', f, name);
  dropZone(child(wrap, '.node-head'), 'board', id =>
    moveBoard(id, f.id).then(() => {
      f.open = true;
    }),
  );
  dropZone(child(wrap, '.node-head'), 'folder', id => {
    if (!putFolder(id, f)) chirp("A folder can't go inside itself ✦", 2500);
  });
  return wrap;
}

export function projectNode(p: Project): HTMLElement {
  const fs = foldersIn(p.id);
  if (fs.some(holdsBoard)) p.open = true;
  const { wrap, name } = treeNode(p, 'project', fs.length, fs.map(folderNode), [
    ['add', 'New folder in this project', '+'],
    ['ren', 'Rename', '✎'],
  ]);
  child(wrap, '.node-head').onclick = async e => {
    const a = e.target instanceof Element ? e.target.closest<HTMLElement>('.f-btn')?.dataset.a : undefined;
    if (a === 'add') {
      const f = makeFolder(uniqueName(appState.folders, 'New folder'), p.id);
      p.open = true;
      await saveLib();
      await refreshBoards();
      return renameNewest('.node.folder', f);
    }
    if (a === 'ren') return inlineRename(name, p);
    if (a === 'del') {
      fs.forEach(f => {
        f.project = null;
      });
      appState.projects = appState.projects.filter(x => x !== p);
      await saveLib();
      return refreshBoards();
    }
    if (name.isContentEditable) return;
    p.open = !p.open;
    wrap.classList.toggle('open', p.open);
    saveLib();
  };
  child(wrap, '.node-head').oncontextmenu = e => rowMenu(e, 'project', p, name);
  dropZone(child(wrap, '.node-head'), 'folder', id => {
    putFolder(id, null, p.id);
    p.open = true;
  });
  return wrap;
}

// the row buttons' icons, drawn once the icon set has loaded
export function initRowIcons() {
  FBTN = { add: Icon('plus'), ren: Icon('edit'), del: Icon('close') };
}
