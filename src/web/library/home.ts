// @ts-nocheck
import { esc, renderAll } from '../canvas/render.ts';
import { COLORS } from '../core/base.ts';
import { $, stage } from '../core/dom.ts';
import { resetHistory } from '../core/history.ts';
import { dueIndex } from '../features/due.ts';
import { findClose } from '../features/find.ts';
import { draggable, dropZone, inlineRename, nestBoard, newBoardIn } from './nesting.ts';
import { FBTN, refreshBoards, renameBoard, rowMenu, uniqueName } from './rowMenu.ts';
import {
  boardsIn,
  boardsUnder,
  folderChain,
  foldersIn,
  hasParent,
  looseBoards,
  looseFolders,
  makeFolder,
  makeProject,
  moveBoard,
  putFolder,
  saveLib,
  subFolders,
} from './tree.ts';
import { renderChat } from '../myra/chat.ts';
import { chatOpen } from '../myra/chatWindow.ts';
import { chirp } from '../settings/licenses.ts';
import { stopPlacing } from '../tools/place.ts';
import { closeColor, renderPalette } from '../ui/colorPicker.ts';
import { applyToolbar } from '../ui/toolbarConfig.ts';
import { refreshVNotes, vnFull } from '../vault/notes.ts';
import { appState, session } from '../core/state.ts';
// and check again whenever you come back to the app

// ---------- home: zoom out to see every project, then a project's folders, then a folder's boards ----------
export let homeAt = null;
// null = closed, { level: 'all' } | { level: 'project', id } | { level: 'folder', id }
export const where = () => {
  const f = appState.folders.find(x => x.id === session.board?.folder),
    p = f && appState.projects.find(x => x.id === f.project);
  return { f, p };
};

export function renderCrumbs() {
  if (!session.board) return;
  const { f, p } = where(),
    el = $('crumbs');
  const chainF = f ? folderChain(f) : [];
  el.innerHTML =
    (p ? `<button data-go="project:${p.id}"></button>` : '') +
    chainF.map((x, i) => `${p || i ? '<i>/</i>' : ''}<button data-go="folder:${x.id}"></button>`).join('');
  const btns = [...el.querySelectorAll('button')];
  if (p) {
    btns[0].textContent = p.name;
    btns[0].title = p.name;
  }
  chainF.forEach((x, i) => {
    const bt = btns[i + (p ? 1 : 0)];
    bt.textContent = x.name;
    bt.title = x.name;
  });
  // inside a canvas: the boards it lives in, so you can climb back out
  const chain = [];
  let up = session.board.parent;
  while (up && chain.length < 4) {
    const pb = appState.boardList.find(x => x.id === up);
    if (!pb) break;
    chain.unshift(pb);
    up = pb.parent;
  }
  chain.forEach(pb => {
    el.insertAdjacentHTML(
      'beforeend',
      `${el.children.length ? '<i>/</i>' : ''}<button data-board="${pb.id}"></button>`,
    );
    const bt = el.lastElementChild;
    bt.textContent = pb.name;
    bt.title = 'Back to ' + pb.name;
  });
}

export function openHome(go = 'all') {
  const [level, id] = go.split(':');
  findClose();
  homeAt = { level, id };
  $('home').classList.add('on');
  stage.classList.add('at-home');
  stopPlacing();
  refreshBoards();
}

export function closeHome() {
  if (!homeAt) return;
  homeAt = null;
  $('home').classList.remove('on');
  stage.classList.remove('at-home');
  refreshBoards();
}

export const miniCache = new Map();

export async function mini(id) {
  // a tiny map of the board: every card as a little colored block
  if (!miniCache.has(id))
    miniCache.set(
      id,
      Fenmyr.load(id).then(b => {
        const cs = (b && b.cards) || [];
        if (!cs.length) return '';
        const x0 = Math.min(...cs.map(c => c.x)),
          y0 = Math.min(...cs.map(c => c.y)),
          x1 = Math.max(...cs.map(c => c.x + c.w)),
          y1 = Math.max(...cs.map(c => c.y + c.h));
        const fill = c =>
          c.type === 'swatch'
            ? c.hex
            : c.type === 'image'
              ? '#d9cfe0'
              : c.type === 'title'
                ? 'transparent'
                : COLORS[c.color] || '#fff';
        return (
          `<svg viewBox="${x0 - 40} ${y0 - 40} ${x1 - x0 + 80} ${y1 - y0 + 80}" preserveAspectRatio="xMidYMid meet">` +
          cs
            .map(c =>
              c.type === 'title'
                ? `<rect x="${c.x}" y="${c.y + c.h * 0.25}" width="${Math.min(c.w, 260)}" height="${c.h * 0.5}" rx="8" fill="#3b342d" opacity=".75"/>`
                : `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="14" fill="${fill(c)}" stroke="rgba(120,80,120,.12)" stroke-width="3" transform="rotate(${c.r || 0} ${c.x + c.w / 2} ${c.y + c.h / 2})"/>`,
            )
            .join('') +
          '</svg>'
        );
      }),
    );
  return miniCache.get(id);
}

function tile(kind, obj, sub, onOpen, btns = []) {
  const t = document.createElement('div');
  t.className = 'tile ' + kind;
  t.style.rotate = (((obj.id.charCodeAt(0) + obj.id.charCodeAt(1)) % 5) - 2) * 0.6 + 'deg';
  t.innerHTML = `<div class="tile-art"></div><div class="tile-meta"><b></b><small>${sub}</small>${btns.map(([a, tt, s]) => `<button class="f-btn" data-a="${a}" title="${tt}">${FBTN[a] || s}</button>`).join('')}</div>`;
  t.querySelector('.tile-meta b').textContent = obj.name;
  t.onclick = e => {
    if (e.target.closest('.f-btn') || t.querySelector('.tile-meta b').isContentEditable) return;
    onOpen();
  };
  return t;
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function renderHome() {
  const { level, id } = homeAt,
    grid = $('homeGrid'),
    crumbs = $('homeCrumbs');
  grid.innerHTML = '';
  miniCache.clear();
  const p =
    level === 'project'
      ? appState.projects.find(x => x.id === id)
      : level === 'folder'
        ? appState.projects.find(x => x.id === appState.folders.find(f => f.id === id)?.project)
        : null;
  const f = level === 'folder' ? appState.folders.find(x => x.id === id) : null;
  if ((level === 'project' && !p) || (level === 'folder' && !f)) {
    homeAt = { level: 'all' };
    return renderHome();
  }
  const chainF = f ? folderChain(f) : [];
  crumbs.innerHTML =
    `<button data-go="all">All projects</button>` +
    (p ? `<i>/</i><button data-go="project:${p.id}"></button>` : '') +
    chainF.map(x => `<i>/</i><button data-go="folder:${x.id}"></button>`).join('');
  const cb = crumbs.querySelectorAll('button');
  if (p) cb[1].textContent = p.name;
  chainF.forEach((x, i) => (cb[i + (p ? 2 : 1)].textContent = x.name));
  $('home').classList.toggle('deep', level !== 'all');
  $('homeTitle').textContent = f ? f.name : p ? p.name : 'Your projects';
  $('homeSub').textContent = f
    ? [subFolders(f.id).length ? plural(subFolders(f.id).length, 'folder') : '', plural(boardsIn(f.id).length, 'board')]
        .filter(Boolean)
        .join(' · ')
    : p
      ? plural(foldersIn(p.id).length, 'folder')
      : 'Every project, with its folders and boards inside.';
  const add = (label, run) => {
    const a = document.createElement('button');
    a.className = 'tile add';
    a.innerHTML = `<span>+</span>${label}`;
    a.onclick = run;
    grid.appendChild(a);
  };
  const projectTile = pp => {
    const fs = foldersIn(pp.id),
      nb = fs.reduce((n, x) => n + boardsUnder(x), 0);
    const t = tile(
      'project',
      pp,
      `${plural(fs.length, 'folder')} · ${plural(nb, 'board')}`,
      () => openHome('project:' + pp.id),
      [['ren', 'Rename', '✎']],
    );
    const art = t.querySelector('.tile-art'),
      chips = `<div class="chips">${fs
        .slice(0, 3)
        .map(x => `<span class="mf"><i></i>${esc(x.name)}</span>`)
        .join('')}</div>`;
    const first = fs.map(x => boardsIn(x.id)[0]).find(Boolean);
    if (pp.cover) {
      art.classList.add('cover');
      art.style.background = `url('${pp.cover}')`;
      art.innerHTML = chips;
    } else if (first) {
      art.classList.add('peekboard');
      art.innerHTML = chips;
      mini(first.id).then(svg => {
        if (svg) art.insertAdjacentHTML('afterbegin', svg);
        else {
          art.classList.remove('peekboard');
          art.style.background = COLORS[pp.color] || COLORS.pink;
        }
      });
    } else {
      art.style.background = COLORS[pp.color] || COLORS.pink;
      art.innerHTML = fs.length ? chips : '<em>empty project</em>';
    }
    const cb = document.createElement('button');
    cb.className = 'cover-btn';
    cb.textContent = 'Cover';
    t.appendChild(cb);
    cb.onclick = e => {
      e.stopPropagation();
      t.querySelector('.cover-menu')?.remove();
      const m = document.createElement('div');
      m.className = 'cover-menu';
      m.innerHTML = `<button data-c="pick">Choose an image…</button><button data-c="board">Use the first board</button>`;
      t.appendChild(m);
      m.onclick = ev => {
        ev.stopPropagation();
        const c = ev.target.closest('[data-c]')?.dataset.c;
        m.remove();
        if (c === 'pick') {
          coverFor = pp;
          $('coverPick').value = '';
          $('coverPick').click();
        }
        if (c === 'board') {
          delete pp.cover;
          saveLib().then(refreshBoards);
        }
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
    };
    t.querySelector('[data-a="ren"]').onclick = () => inlineRename(t.querySelector('.tile-meta b'), pp);
    t.oncontextmenu = e => rowMenu(e, 'project', pp, t.querySelector('.tile-meta b'));
    dropZone(t, 'folder', fid => putFolder(fid, null, pp.id));
    return t;
  };
  const folderTile = ff => {
    const bs = boardsIn(ff.id),
      ns = subFolders(ff.id).length,
      t = tile(
        'folder',
        ff,
        [ns ? plural(ns, 'folder') : '', plural(bs.length, 'board')].filter(Boolean).join(' · '),
        () => openHome('folder:' + ff.id),
        [['ren', 'Rename', '✎']],
      );
    const art = t.querySelector('.tile-art');
    art.innerHTML =
      '<div class="back"></div><div class="tab"></div><div class="peek"></div><div class="front"><span class="face"><b></b><i></i><b></b></span></div>';
    const shown = bs.slice(0, 3);
    art.querySelector('.peek').style.setProperty('--mid', (shown.length - 1) / 2);
    shown.forEach(async (b, i) => {
      const d = document.createElement('div');
      d.className = 'paper';
      d.style.setProperty('--i', i);
      d.style.zIndex = i === Math.floor((shown.length - 1) / 2) ? 3 : 1;
      d.innerHTML = await mini(b.id);
      art.querySelector('.peek').appendChild(d);
    });
    t.querySelector('[data-a="ren"]').onclick = () => inlineRename(t.querySelector('.tile-meta b'), ff);
    t.oncontextmenu = e => rowMenu(e, 'folder', ff, t.querySelector('.tile-meta b'));
    draggable(t, 'folder', ff.id);
    dropZone(t, 'board', bid => moveBoard(bid, ff.id));
    dropZone(t, 'folder', fid => {
      if (fid !== ff.id && !putFolder(fid, ff)) chirp("A folder can't go inside itself ✦", 2500);
    });
    return t;
  };
  const boardTile = b => {
    const t = tile(
      'board',
      b,
      b.updated ? 'edited ' + ago(b.updated) : '',
      () => {
        closeHome();
        openBoard(b.id);
      },
      [['ren', 'Rename', '✎']],
    );
    t.querySelector('[data-a="ren"]').onclick = () =>
      inlineRename(t.querySelector('.tile-meta b'), b, v => renameBoard(b, v));
    mini(b.id).then(svg => (t.querySelector('.tile-art').innerHTML = svg || '<em>empty board</em>'));
    draggable(t, 'board', b.id);
    dropZone(t, 'board', id => nestBoard(id, b.id));
    t.oncontextmenu = e => rowMenu(e, 'board', b, t.querySelector('.tile-meta b'));
    return t;
  };
  const section = label => {
    const h = document.createElement('div');
    h.className = 'home-sec';
    h.textContent = label;
    grid.appendChild(h);
  };
  if (level === 'all') {
    appState.projects.forEach(pp => grid.appendChild(projectTile(pp)));
    add('New project', async () => {
      const pp = makeProject(uniqueName(appState.projects, 'New project'));
      await saveLib();
      await refreshBoards();
      const t = [...grid.querySelectorAll('.tile.project')].pop();
      inlineRename(t.querySelector('.tile-meta b'), pp);
    });
    if (looseFolders().length) {
      section('Folders not in a project · drag onto a project to file');
      looseFolders().forEach(ff => grid.appendChild(folderTile(ff)));
    }
    if (looseBoards().length) {
      section('Boards not in a folder');
      looseBoards().forEach(b => grid.appendChild(boardTile(b)));
    }
  } else if (level === 'project') {
    foldersIn(p.id).forEach(ff => grid.appendChild(folderTile(ff)));
    add('New folder', async () => {
      const ff = makeFolder(uniqueName(appState.folders, 'New folder'), p.id);
      await saveLib();
      await refreshBoards();
      const t = [...grid.querySelectorAll('.tile.folder')].pop();
      inlineRename(t.querySelector('.tile-meta b'), ff);
    });
    if (looseBoards().length) {
      section('Boards not in a folder · drag onto a folder to file');
      looseBoards().forEach(b => grid.appendChild(boardTile(b)));
    }
  } else {
    subFolders(f.id).forEach(ff => grid.appendChild(folderTile(ff)));
    boardsIn(f.id).forEach(b => grid.appendChild(boardTile(b)));
    add('New board', () => newBoardIn(f.id));
    add('New folder', async () => {
      const ff = makeFolder(uniqueName(appState.folders, 'New folder'), f.project || null);
      ff.parent = f.id;
      await saveLib();
      await refreshBoards();
      const t = [...grid.querySelectorAll('.tile.folder')].pop();
      if (t) inlineRename(t.querySelector('.tile-meta b'), ff);
    });
  }
}

const ago = t => {
  const s = Date.now() / 1000 - t,
    m = s / 60,
    h = m / 60,
    d = h / 24;
  return s < 90
    ? 'just now'
    : m < 60
      ? Math.round(m) + 'm ago'
      : h < 24
        ? Math.round(h) + 'h ago'
        : Math.round(d) + 'd ago';
};

// a project's cover image: shrunk to a tidy size and saved with the library
let coverFor = null;

export async function openBoard(id) {
  // an edit still waiting to save belongs to the board you're leaving: save it first
  if (appState.saveT && session.board) {
    clearTimeout(appState.saveT);
    appState.saveT = 0;
    session.board.view = session.view;
    await Fenmyr.save(session.board);
  }
  const b = await Fenmyr.load(id);
  if (!b) return;
  miniCache.clear();
  vnFull.clear();
  appState.histOpen = false;
  findClose();
  session.board = b;
  if (chatOpen()) setTimeout(renderChat, 0);
  session.board.palette = session.board.palette || [];
  setTimeout(resetHistory, 0);
  session.view = Object.assign({ x: 160, y: 140, z: 1 }, b.view);
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
  $('boardName').value = session.board.name;
  renderAll();
  refreshBoards();
  refreshVNotes();
  applyToolbar();
  try {
    localStorage.setItem('fenmyr:last', id);
  } catch (e) {}
  dueIndex();
}
export function init7() {
  $('crumbs').onclick = async e => {
    const pb = e.target.closest('[data-board]')?.dataset.board;
    if (pb) {
      session.board.view = session.view;
      await Fenmyr.save(session.board);
      return openBoard(pb);
    }
    const g = e.target.closest('[data-go]')?.dataset.go;
    if (g) openHome(g);
  };

  $('homeBtn').onclick = () => openHome('all');

  $('brand').onclick = () => openHome('all');

  $('homeBack').onclick = () => {
    if (!homeAt) return;
    const f = homeAt.level === 'folder' && appState.folders.find(x => x.id === homeAt.id);
    openHome(
      f && hasParent(f)
        ? 'folder:' + f.parent
        : f && f.project && appState.projects.some(p => p.id === f.project)
          ? 'project:' + f.project
          : 'all',
    );
  };

  $('homeCrumbs').onclick = e => {
    const g = e.target.closest('[data-go]')?.dataset.go;
    if (g) openHome(g);
  };

  $('homeClose').onclick = closeHome;

  $('coverPick').onchange = () => {
    const file = $('coverPick').files[0],
      p = coverFor;
    if (!file || !p) return;
    const rd = new FileReader();
    rd.onload = () => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, 720 / im.width),
          cv = document.createElement('canvas');
        cv.width = im.width * k;
        cv.height = im.height * k;
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        p.cover = cv.toDataURL('image/jpeg', 0.86);
        saveLib().then(refreshBoards);
      };
      im.src = rd.result;
    };
    rd.readAsDataURL(file);
  };

  appState.saveT = 0;
}
