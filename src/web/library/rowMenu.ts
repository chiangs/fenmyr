import type { Folder, Project } from '../../shared/model.ts';

export type Kind = 'board' | 'folder' | 'project';
// a row in the left box: a board, folder or project, each using the fields it has
export type Thing = {
  id: string;
  name: string;
  color?: string;
  open?: boolean;
  folder?: string | null;
  parent?: string | null;
  project?: string | null;
};

import { uid } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { appState, session } from '../core/state.ts';
import { dueForget } from '../features/due.ts';
import { chirp, say } from '../myra/say.ts';
import { offerRename } from '../repo/codeFolder.ts';
import { linkRepo } from '../repo/link.ts';
import { newPrototypingFolder } from '../repo/prototypes.ts';
import { child, esc } from '../ui/dom.ts';
import { keepOnScreen, removeOnOutsidePress } from '../ui/popover.ts';
import { editVaultAccess } from '../vault/vaults.ts';
import { confirmDelete } from './confirmDelete.ts';
import { renderCrumbs, where } from './crumbs.ts';
import { homeAt, renderHome } from './home.ts';
import { dropZone, inlineRename, loadLib } from './nesting.ts';
import { leaveForDelete } from './nextBoard.ts';
import { boardRow, folderNode, initRowIcons, projectNode } from './sidebarRows.ts';
import {
  boardsIn,
  boardsUnder,
  byName,
  folderChain,
  foldersIn,
  looseBoards,
  looseFolders,
  moveBoard,
  putFolder,
  saveLib,
  subFolders,
  tint,
} from './tree.ts';

// ---------- right-click in the left box: duplicate or delete a board, folder or project ----------
// copying a board also copies the canvases inside it, so the copy doesn't share them
async function copyBoard(id: string, into: { name?: string; parent?: string; folder?: string | null } = {}) {
  const b = await Fenmyr.load(id);
  if (!b) return null;
  const c = JSON.parse(JSON.stringify(b));
  c.id = uid();
  Object.assign(c, into);
  for (const k of c.cards)
    if (k.type === 'canvas' && k.board) {
      const kid = await copyBoard(k.board, { parent: c.id, folder: c.folder || null });
      if (kid) k.board = kid.id;
    }
  await Fenmyr.save(c);
  return c;
}

async function dropBoard(id: string) {
  for (const k of appState.boardList.filter(x => x.parent === id)) await dropBoard(k.id);
  await Fenmyr.remove(id);
  dueForget(id);
}

async function duplicate(kind: Kind, obj: Thing) {
  if (kind === 'board') {
    const c = await copyBoard(obj.id, { name: `${obj.name} copy` });
    await refreshBoards();
    if (c) chirp(`Made “${c.name}” ✦`, 3500);
    return;
  }
  // copy a folder, the folders inside it and all their boards
  const copyFolder = async (f0: Folder, name: string, project: string | null, parent: string | null) => {
    const f: Folder = { id: uid(), name, project, open: true };
    if (parent) f.parent = parent;
    appState.folders.push(f);
    await saveLib();
    for (const b of boardsIn(f0.id)) await copyBoard(b.id, { folder: f.id });
    for (const x of subFolders(f0.id)) await copyFolder(x, x.name, project, f.id);
  };
  if (kind === 'folder') await copyFolder(obj, `${obj.name} copy`, obj.project || null, obj.parent || null);
  if (kind === 'project') {
    const p: Project = { id: uid(), name: `${obj.name} copy`, open: true, ...(obj.color ? { color: obj.color } : {}) };
    appState.projects.push(p);
    await saveLib();
    for (const f0 of foldersIn(obj.id)) await copyFolder(f0, f0.name, p.id, null);
  }
  await refreshBoards();
  chirp(`Made “${obj.name} copy” ✦`, 3500);
}

async function destroy(kind: Kind, obj: Thing) {
  const all = (f: Folder): Folder[] => [f, ...subFolders(f.id).flatMap(all)]; // a folder and every folder inside it
  const gone = kind === 'folder' ? all(obj) : kind === 'project' ? foldersIn(obj.id).flatMap(all) : [];
  const ids = kind === 'board' ? [obj.id] : gone.flatMap(f => boardsIn(f.id).map(b => b.id));
  const current = session.board?.id;
  if (current && ids.includes(current)) await leaveForDelete(new Set(ids), current);
  for (const id of ids) await dropBoard(id);
  appState.folders = appState.folders.filter(f => !gone.includes(f));
  if (kind === 'project') appState.projects = appState.projects.filter(p => p !== obj);
  await saveLib();
  await refreshBoards();
}

// Move to…: a little map of projects and folders; pick where it goes
function moveMenu(m: HTMLElement, kind: Kind, obj: Thing) {
  const here = kind === 'board' ? obj.folder || null : obj.parent ? `f:${obj.parent}` : obj.project || null,
    row = (id: string | null, label: string, depth: number, icon: string) => {
      const isHere = id === here,
        cls = isHere ? ' here' : '',
        to = id ?? '',
        pad = 12 + depth * 16,
        name = esc(label),
        mark = isHere ? '<em>here</em>' : '';
      return `<button class="mv-row${cls}" data-to="${to}" style="padding-left:${pad}px">${icon}<span>${name}</span>${mark}</button>`;
    };
  const FIC = '<i class="fic"></i>',
    PIC = (c = '') => {
      const shade = tint(c);
      return `<i class="pic" style="background:${shade}"></i>`;
    };
  const title = esc(obj.name);
  let h = `<div class="mv-head">Move “${title}” to…</div><div class="mv-list">`;
  const tree = (f: Folder, d: number) => {
    if (kind === 'folder' && f.id === obj.id) return;
    h += row(kind === 'board' ? f.id : `f:${f.id}`, f.name, d, FIC);
    subFolders(f.id).forEach(x => {
      tree(x, d + 1);
    });
  };
  if (kind === 'board') {
    appState.projects.forEach(p => {
      const pic = PIC(p.color),
        name = esc(p.name);
      h += `<div class="mv-group" style="padding-left:12px">${pic}<span>${name}</span></div>`;
      foldersIn(p.id).forEach(f => {
        tree(f, 1);
      });
      if (!foldersIn(p.id).length) h += '<div class="mv-none">no folders yet</div>';
    });
    looseFolders().forEach(f => {
      tree(f, 0);
    });
    h += row(null, 'Not in a folder', 0, '<i class="mv-dot"></i>');
  } else {
    appState.projects.forEach(p => {
      h += row(p.id, p.name, 0, PIC(p.color));
      foldersIn(p.id).forEach(f => {
        tree(f, 1);
      });
    });
    looseFolders().forEach(f => {
      tree(f, 0);
    });
    h += row(null, 'Not in a project', 0, '<i class="mv-dot"></i>');
  }
  m.innerHTML = `${h}</div>`;
  m.classList.add('mv');
  keepOnScreen(m);
  m.onclick = async ev => {
    const b = ev.target instanceof Element ? ev.target.closest<HTMLElement>('[data-to]') : null;
    if (!b) return;
    const to = b.dataset.to || null;
    m.remove();
    if (to === here && !(kind === 'board' && obj.parent)) return;
    if (kind === 'board') {
      await moveBoard(obj.id, to);
      const f = appState.folders.find(x => x.id === to);
      if (f) {
        f.open = true;
        const p = appState.projects.find(x => x.id === f.project);
        if (p) p.open = true;
      }
    } else if (to?.startsWith('f:')) {
      const into = appState.folders.find(x => x.id === to.slice(2));
      putFolder(obj.id, into ?? null);
    } else {
      putFolder(obj.id, null, to);
      const p = appState.projects.find(x => x.id === to);
      if (p) p.open = true;
    }
    await saveLib();
    await refreshBoards();
    const dest =
      appState.folders.find(x => x.id === to || `f:${x.id}` === to) || appState.projects.find(x => x.id === to);
    chirp(
      `Moved “${obj.name}” ${dest ? `to “${dest.name}”` : kind === 'board' ? 'out of its folder' : 'out of its project'} ✦`,
      3500,
    );
  };
}

export async function renameBoard(b: { id: string }, v: string) {
  if (!v) return;
  if (session.board && session.board.id === b.id) {
    session.board.name = v;
    const field = $('boardName');
    if (field instanceof HTMLInputElement) field.value = v;
    save();
    return offerRename(session.board);
  }
  const bb = await Fenmyr.load(b.id);
  if (!bb) return;
  bb.name = v;
  await Fenmyr.save(bb);
  offerRename(bb);
}

export function rowMenu(e: MouseEvent, kind: Kind, obj: Thing, nameEl?: HTMLElement) {
  e.preventDefault();
  e.stopPropagation();
  $('rowMenu')?.remove();
  const n =
    kind === 'board'
      ? 1 + appState.boardList.filter(x => x.parent === obj.id).length
      : kind === 'folder'
        ? boardsUnder(obj)
        : foldersIn(obj.id).reduce((t, f) => t + boardsUnder(f), 0);
  const m = document.createElement('div');
  m.id = 'rowMenu';
  m.className = 'row-menu';
  m.style.left = `${e.clientX}px`;
  m.style.top = `${e.clientY}px`;
  const project = kind === 'project' ? appState.projects.find(x => x.id === obj.id) : undefined,
    repoLabel = project?.repo ? 'Repo…' : 'Link a repo…',
    repoItem = `<button data-m="repo">${repoLabel}</button><button data-m="protoFolder">New prototyping folder</button>`;
  const items =
    (nameEl ? '<button data-m="ren">Rename</button>' : '') +
    (kind !== 'project' ? '<button data-m="move">Move to…</button>' : '') +
    (kind === 'board' && obj.parent ? '<button data-m="out">Make it its own board</button>' : '') +
    (kind !== 'folder' && Fenmyr.native ? '<button data-m="vault">Vault access…</button>' : '') +
    (kind === 'project' && Fenmyr.native ? repoItem : '');
  m.innerHTML = `${items}<button data-m="dup">Duplicate</button><span class="rm-sep"></span><button data-m="del" class="danger">Delete</button>`;
  document.body.appendChild(m);
  keepOnScreen(m);
  m.onclick = async ev => {
    const a = ev.target instanceof Element ? ev.target.closest<HTMLElement>('[data-m]')?.dataset.m : undefined;
    if (!a) return;
    if (a === 'ren') {
      m.remove();
      return nameEl && inlineRename(nameEl, obj, kind === 'board' ? v => renameBoard(obj, v) : undefined);
    }
    if (a === 'dup') {
      m.remove();
      return duplicate(kind, obj);
    }
    if ((a === 'repo' || a === 'protoFolder') && project) {
      m.remove();
      return a === 'repo' ? linkRepo(project) : newPrototypingFolder(project);
    }
    if (a === 'vault' && kind !== 'folder') {
      m.remove();
      return editVaultAccess(kind, obj);
    }
    if (a === 'move') return moveMenu(m, kind, obj);
    if (a === 'out') {
      m.remove();
      const pb = appState.boardList.find(x => x.id === obj.parent);
      await moveBoard(obj.id, pb ? pb.folder || null : null);
      await refreshBoards();
      return chirp(`“${obj.name}” is its own board now ✦`, 3000);
    }
    if (a === 'del') {
      m.classList.add('confirm');
      m.innerHTML = confirmDelete(kind, obj, n);
      keepOnScreen(m);
      return;
    }
    if (a === 'yes') {
      m.remove();
      return destroy(kind, obj);
    }
    if (a === 'no') m.remove();
  };
  removeOnOutsidePress(m);
}
export const uniqueName = (arr: { name: string }[], base: string) => {
  let n = base,
    k = 2;
  while (byName(arr, n)) n = `${base} ${k++}`;
  return n;
};

export function renameNewest(sel: string, obj: { id: string; name: string }) {
  const el = [...document.querySelectorAll(`#boards ${sel}`)].find(n => child(n, '.fname').textContent === obj.name);
  if (el) inlineRename(child(el, '.fname'), obj);
}

// A save rarely changes the sidebar. Rebuilding it only when its contents or order changed saves a repaint on every edit.
let sidebarShown = '';
const sidebarKey = () =>
  JSON.stringify([
    appState.boardList.map(b => [b.id, b.name, b.color, b.folder, b.parent]),
    appState.projects,
    appState.folders,
    appState.boardOrder,
    session.board?.id,
    session.board?.name,
  ]);
export async function refreshBoardsAfterSave() {
  if (homeAt || document.querySelector('[contenteditable="true"]')) return refreshBoards();
  await loadLib();
  if (sidebarKey() !== sidebarShown) await refreshBoards();
}

export async function refreshBoards() {
  if (document.querySelector('#boards [contenteditable="true"], .home [contenteditable="true"]')) return; // don't redraw under someone typing a name
  await loadLib();
  const el = $('boards');
  el.innerHTML = '';
  // inside a project (on Home or on one of its boards) the left box shows just that project; in All projects it shows everything
  const at = homeAt;
  const sf = at
    ? at.level === 'folder'
      ? appState.folders.find(x => x.id === at.id)
      : null
    : appState.folders.find(x => x.id === session.board?.folder);
  const sp =
    at?.level === 'project'
      ? appState.projects.find(x => x.id === at.id)
      : sf && appState.projects.find(x => x.id === sf.project);
  const scoped = at?.level !== 'all' && (sp || sf);
  $('treeLabel').textContent = scoped ? 'In this project' : 'Everything';
  if (scoped) {
    if (sp) {
      sp.open = true;
      el.appendChild(projectNode(sp));
    } else {
      const top = sf ? folderChain(sf)[0] : undefined;
      if (top) {
        top.open = true;
        el.appendChild(folderNode(top));
      }
    }
    $('homeBtn').classList.add('out');
    renderCrumbs();
    sidebarShown = sidebarKey();
    if (homeAt) renderHome();
    return;
  }
  sidebarShown = sidebarKey();
  $('homeBtn').classList.remove('out');
  appState.projects.forEach(p => {
    el.appendChild(projectNode(p));
  });
  looseFolders().forEach(f => {
    el.appendChild(folderNode(f));
  });
  const loose = document.createElement('div');
  loose.className = 'loose-zone';
  looseBoards().forEach(b => {
    loose.appendChild(boardRow(b));
  });
  el.appendChild(loose);
  dropZone(loose, 'board', id => moveBoard(id, null));
  dropZone(el, 'folder', id => putFolder(id, null, null));
  renderCrumbs();
  if (homeAt) renderHome();
}
export function init6() {
  // the little row buttons use the same line icons as the toolbar
  initRowIcons();

  // a board added from outside the app (Claude Code, a copied file): show it right away, and say where it went if it isn't in view
  window.__boardsChanged = async () => {
    const before = new Set(appState.boardList.map(b => b.id));
    await refreshBoards();
    const here = where().p,
      fresh = appState.boardList.filter(b => !before.has(b.id));
    for (const b of fresh) {
      const f = appState.folders.find(x => x.id === b.folder),
        p = f && appState.projects.find(x => x.id === f.project);
      if (p && here && p.id === here.id) say(`“${b.name}” just showed up in this project ✦`);
      else
        say(
          `“${b.name}” just showed up. You'll find it in ${p ? `your “${p.name}” project` : f ? `the “${f.name}” folder` : 'All projects'}.`,
        );
    }
  };

  addEventListener('focus', () => {
    if (session.board && !document.querySelector('[contenteditable="true"]')) window.__boardsChanged?.();
  });
}
