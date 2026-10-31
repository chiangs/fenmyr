// @ts-nocheck
import { esc } from '../canvas/render.ts';
import { uid } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { dueForget } from '../features/due.ts';
import { closeHome, homeAt, openBoard, renderCrumbs, renderHome, where } from './home.ts';
import { draggable, dropZone, inlineRename, loadLib, nestBoard, newBoardIn, reorderZone } from './nesting.ts';
import {
  boardsIn,
  boardsUnder,
  byName,
  folderChain,
  foldersIn,
  holdsBoard,
  looseBoards,
  looseFolders,
  makeFolder,
  moveBoard,
  putFolder,
  saveLib,
  subFolders,
  tint,
} from './tree.ts';
import { newBoard } from '../model/boards.ts';
import { chirp, say } from '../settings/licenses.ts';
import { editVaultAccess } from '../vault/vaults.ts';
import { appState, session } from '../core/state.ts';

// ---------- right-click in the left box: duplicate or delete a board, folder or project ----------
// copying a board also copies the canvases inside it, so the copy doesn't share them
async function copyBoard(id, into = {}) {
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

async function dropBoard(id) {
  for (const k of appState.boardList.filter(x => x.parent === id)) await dropBoard(k.id);
  await Fenmyr.remove(id);
  dueForget(id);
}

async function duplicate(kind, obj) {
  if (kind === 'board') {
    const c = await copyBoard(obj.id, { name: obj.name + ' copy' });
    await refreshBoards();
    if (c) chirp(`Made “${c.name}” ✦`, 3500);
    return;
  }
  // copy a folder, the folders inside it and all their boards
  const copyFolder = async (f0, name, project, parent) => {
    const f = { id: uid(), name, project, open: true };
    if (parent) f.parent = parent;
    appState.folders.push(f);
    await saveLib();
    for (const b of boardsIn(f0.id)) await copyBoard(b.id, { folder: f.id });
    for (const x of subFolders(f0.id)) await copyFolder(x, x.name, project, f.id);
  };
  if (kind === 'folder') await copyFolder(obj, obj.name + ' copy', obj.project || null, obj.parent || null);
  if (kind === 'project') {
    const p = { id: uid(), name: obj.name + ' copy', color: obj.color, open: true };
    appState.projects.push(p);
    await saveLib();
    for (const f0 of foldersIn(obj.id)) await copyFolder(f0, f0.name, p.id, null);
  }
  await refreshBoards();
  chirp(`Made “${obj.name} copy” ✦`, 3500);
}

async function destroy(kind, obj) {
  const all = f => [f, ...subFolders(f.id).flatMap(all)]; // a folder and every folder inside it
  const gone = kind === 'folder' ? all(obj) : kind === 'project' ? foldersIn(obj.id).flatMap(all) : [];
  const ids = kind === 'board' ? [obj.id] : gone.flatMap(f => boardsIn(f.id).map(b => b.id));
  for (const id of ids) await dropBoard(id);
  appState.folders = appState.folders.filter(f => !gone.includes(f));
  if (kind === 'project') appState.projects = appState.projects.filter(p => p !== obj);
  await saveLib();
  await refreshBoards();
  if (session.board && ids.includes(session.board.id)) {
    let list = await Fenmyr.list();
    if (!list.length) {
      const b = newBoard('My first board');
      await Fenmyr.save(b);
      list = await Fenmyr.list();
    }
    await openBoard(list[0].id);
  }
}

// Move to…: a little map of projects and folders; pick where it goes
function moveMenu(m, kind, obj) {
  const here = kind === 'board' ? obj.folder || null : obj.parent ? 'f:' + obj.parent : obj.project || null,
    row = (id, label, depth, icon) =>
      `<button class="mv-row${id === here ? ' here' : ''}" data-to="${id ?? ''}" style="padding-left:${12 + depth * 16}px">${icon}<span>${esc(label)}</span>${id === here ? '<em>here</em>' : ''}</button>`;
  const FIC = '<i class="fic"></i>',
    PIC = c => `<i class="pic" style="background:${tint(c)}"></i>`;
  let h = `<div class="mv-head">Move “${esc(obj.name)}” to…</div><div class="mv-list">`;
  const tree = (f, d) => {
    if (kind === 'folder' && f.id === obj.id) return;
    h += row(kind === 'board' ? f.id : 'f:' + f.id, f.name, d, FIC);
    subFolders(f.id).forEach(x => tree(x, d + 1));
  };
  if (kind === 'board') {
    appState.projects.forEach(p => {
      h += `<div class="mv-group" style="padding-left:12px">${PIC(p.color)}<span>${esc(p.name)}</span></div>`;
      foldersIn(p.id).forEach(f => tree(f, 1));
      if (!foldersIn(p.id).length) h += '<div class="mv-none">no folders yet</div>';
    });
    looseFolders().forEach(f => tree(f, 0));
    h += row(null, 'Not in a folder', 0, '<i class="mv-dot"></i>');
  } else {
    appState.projects.forEach(p => {
      h += row(p.id, p.name, 0, PIC(p.color));
      foldersIn(p.id).forEach(f => tree(f, 1));
    });
    looseFolders().forEach(f => tree(f, 0));
    h += row(null, 'Not in a project', 0, '<i class="mv-dot"></i>');
  }
  m.innerHTML = h + '</div>';
  m.classList.add('mv');
  const r = m.getBoundingClientRect();
  if (r.bottom > innerHeight - 10) m.style.top = Math.max(10, innerHeight - r.height - 10) + 'px';
  m.onclick = async ev => {
    const b = ev.target.closest('[data-to]');
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
    } else if (to && to.startsWith('f:')) {
      const into = appState.folders.find(x => x.id === to.slice(2));
      if (!putFolder(obj.id, into)) return chirp("A folder can't go inside itself ✦", 2500);
    } else {
      putFolder(obj.id, null, to);
      const p = appState.projects.find(x => x.id === to);
      if (p) p.open = true;
    }
    await saveLib();
    await refreshBoards();
    const dest =
      appState.folders.find(x => x.id === to || 'f:' + x.id === to) || appState.projects.find(x => x.id === to);
    chirp(
      `Moved “${obj.name}” ${dest ? 'to “' + dest.name + '”' : kind === 'board' ? 'out of its folder' : 'out of its project'} ✦`,
      3500,
    );
  };
}

export async function renameBoard(b, v) {
  if (!v) return;
  if (session.board && session.board.id === b.id) {
    session.board.name = v;
    $('boardName').value = v;
    save();
  } else {
    const bb = await Fenmyr.load(b.id);
    if (bb) {
      bb.name = v;
      await Fenmyr.save(bb);
    }
  }
}

export function rowMenu(e, kind, obj, nameEl) {
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
  m.style.left = e.clientX + 'px';
  m.style.top = e.clientY + 'px';
  m.innerHTML = `${nameEl ? '<button data-m="ren">Rename</button>' : ''}${kind !== 'project' ? '<button data-m="move">Move to…</button>' : ''}${kind === 'board' && obj.parent ? '<button data-m="out">Make it its own board</button>' : ''}${kind !== 'folder' && Fenmyr.native ? '<button data-m="vault">Vault access…</button>' : ''}<button data-m="dup">Duplicate</button><span class="rm-sep"></span><button data-m="del" class="danger">Delete</button>`;
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  if (r.bottom > innerHeight - 10) m.style.top = innerHeight - r.height - 10 + 'px';
  m.onclick = async ev => {
    const a = ev.target.closest('[data-m]')?.dataset.m;
    if (!a) return;
    if (a === 'ren') {
      m.remove();
      return inlineRename(nameEl, obj, kind === 'board' ? v => renameBoard(obj, v) : undefined);
    }
    if (a === 'dup') {
      m.remove();
      return duplicate(kind, obj);
    }
    if (a === 'vault') {
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
      // ask first: deleting can't be undone
      const what =
        kind === 'board'
          ? n > 1
            ? `and the ${n - 1} canvas${n > 2 ? 'es' : ''} inside it`
            : ''
          : n
            ? `and the ${n} board${n === 1 ? '' : 's'} inside it`
            : '';
      m.innerHTML = `<p>Delete “${esc(obj.name)}” ${what}? This can't be undone.</p><div><button data-m="yes" class="danger solid">Delete</button><button data-m="no">Cancel</button></div>`;
      return;
    }
    if (a === 'yes') {
      m.remove();
      return destroy(kind, obj);
    }
    if (a === 'no') m.remove();
  };
  setTimeout(() =>
    addEventListener(
      'pointerdown',
      function off(ev) {
        if (!m.contains(ev.target)) {
          m.remove();
          removeEventListener('pointerdown', off, true);
        }
      },
      true,
    ),
  );
}
export let FBTN;

// the left box: a small tree (projects ▸ folders ▸ boards)
function boardRow(b) {
  const r = document.createElement('div');
  r.className = 'board-row' + (session.board && b.id === session.board.id ? ' on' : '');
  r.innerHTML = `<i style="background:${tint(b.color)}"></i><span></span>`;
  r.querySelector('span').textContent = b.name;
  // one click opens the board; a double-click renames it right here (so wait a beat to tell them apart)
  let tap = 0;
  const name = r.querySelector('span');
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
  kids.forEach(k => sub.appendChild(boardRow(k)));
  frag.appendChild(r);
  frag.appendChild(sub);
  return frag;
}

function treeNode(obj, kind, count, kids, btns) {
  const wrap = document.createElement('div');
  wrap.className = 'node ' + kind + (obj.open ? ' open' : '');
  wrap.innerHTML = `<div class="node-head"><span class="chev">▶</span><span class="${kind === 'project' ? 'pic' : 'fic'}"></span><span class="fname"></span><small>${count}</small>${btns.map(([a, t, s]) => `<button class="f-btn" data-a="${a}" title="${t}">${FBTN[a] || s}</button>`).join('')}</div><div class="node-body"></div>`;
  if (kind === 'project') wrap.querySelector('.pic').style.background = tint(obj.color);
  const name = wrap.querySelector('.fname'),
    body = wrap.querySelector('.node-body');
  name.textContent = obj.name;
  kids.forEach(k => body.appendChild(k));
  if (!kids.length)
    body.innerHTML = `<div class="folder-empty">${kind === 'project' ? 'No folders yet' : 'Drag boards in here'}</div>`;
  name.ondblclick = e => {
    e.stopPropagation();
    inlineRename(name, obj);
  };
  return { wrap, name };
}

function folderNode(f) {
  const inside = boardsIn(f.id),
    subs = subFolders(f.id);
  if (holdsBoard(f)) f.open = true;
  const { wrap, name } = treeNode(
    f,
    'folder',
    inside.length + subs.length,
    [...subs.map(folderNode), ...inside.map(boardRow)],
    [
      ['add', 'New board in this folder', '+'],
      ['ren', 'Rename', '✎'],
    ],
  );
  wrap.querySelector('.node-head').onclick = async e => {
    const a = e.target.closest('.f-btn')?.dataset.a;
    if (a === 'add') return newBoardIn(f.id);
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
  draggable(wrap.querySelector('.node-head'), 'folder', f.id);
  wrap.querySelector('.node-head').oncontextmenu = e => rowMenu(e, 'folder', f, name);
  dropZone(wrap.querySelector('.node-head'), 'board', id =>
    moveBoard(id, f.id).then(() => {
      f.open = true;
    }),
  );
  dropZone(wrap.querySelector('.node-head'), 'folder', id => {
    if (!putFolder(id, f)) chirp("A folder can't go inside itself ✦", 2500);
  });
  return wrap;
}

function projectNode(p) {
  const fs = foldersIn(p.id);
  if (fs.some(holdsBoard)) p.open = true;
  const { wrap, name } = treeNode(p, 'project', fs.length, fs.map(folderNode), [
    ['add', 'New folder in this project', '+'],
    ['ren', 'Rename', '✎'],
  ]);
  wrap.querySelector('.node-head').onclick = async e => {
    const a = e.target.closest('.f-btn')?.dataset.a;
    if (a === 'add') {
      const f = makeFolder(uniqueName(appState.folders, 'New folder'), p.id);
      p.open = true;
      await saveLib();
      await refreshBoards();
      return renameNewest('.node.folder', f);
    }
    if (a === 'ren') return inlineRename(name, p);
    if (a === 'del') {
      fs.forEach(f => (f.project = null));
      appState.projects = appState.projects.filter(x => x !== p);
      await saveLib();
      return refreshBoards();
    }
    if (name.isContentEditable) return;
    p.open = !p.open;
    wrap.classList.toggle('open', p.open);
    saveLib();
  };
  wrap.querySelector('.node-head').oncontextmenu = e => rowMenu(e, 'project', p, name);
  dropZone(wrap.querySelector('.node-head'), 'folder', id => {
    putFolder(id, null, p.id);
    p.open = true;
  });
  return wrap;
}

export const uniqueName = (arr, base) => {
  let n = base,
    k = 2;
  while (byName(arr, n)) n = base + ' ' + k++;
  return n;
};

export function renameNewest(sel, obj) {
  const el = [...document.querySelectorAll(`#boards ${sel}`)].find(
    n => n.querySelector('.fname').textContent === obj.name,
  );
  if (el) inlineRename(el.querySelector('.fname'), obj);
}

export async function refreshBoards() {
  if (document.querySelector('#boards [contenteditable="true"], .home [contenteditable="true"]')) return; // don't redraw under someone typing a name
  await loadLib();
  const el = $('boards');
  el.innerHTML = '';
  // inside a project (on Home or on one of its boards) the left box shows just that project; in All projects it shows everything
  const sf = homeAt
    ? homeAt.level === 'folder'
      ? appState.folders.find(x => x.id === homeAt.id)
      : null
    : appState.folders.find(x => x.id === session.board?.folder);
  const sp =
    homeAt?.level === 'project'
      ? appState.projects.find(x => x.id === homeAt.id)
      : sf && appState.projects.find(x => x.id === sf.project);
  const scoped = homeAt?.level !== 'all' && (sp || sf);
  $('treeLabel').textContent = scoped ? 'In this project' : 'Everything';
  if (scoped) {
    if (sp) {
      sp.open = true;
      el.appendChild(projectNode(sp));
    } else {
      const top = folderChain(sf)[0];
      top.open = true;
      el.appendChild(folderNode(top));
    }
    $('homeBtn').classList.add('out');
    renderCrumbs();
    if (homeAt) renderHome();
    return;
  }
  $('homeBtn').classList.remove('out');
  appState.projects.forEach(p => el.appendChild(projectNode(p)));
  looseFolders().forEach(f => el.appendChild(folderNode(f)));
  const loose = document.createElement('div');
  loose.className = 'loose-zone';
  looseBoards().forEach(b => loose.appendChild(boardRow(b)));
  el.appendChild(loose);
  dropZone(loose, 'board', id => moveBoard(id, null));
  dropZone(el, 'folder', id => putFolder(id, null, null));
  renderCrumbs();
  if (homeAt) renderHome();
}
export function init6() {
  // the little row buttons use the same line icons as the toolbar
  FBTN = { add: Icon('plus'), ren: Icon('edit'), del: Icon('close') };

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
    if (session.board && !document.querySelector('[contenteditable="true"]')) window.__boardsChanged();
  });
}
