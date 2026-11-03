import type { Folder, Project } from '../../shared/model.ts';
import type { BoardSummary } from '../../shared/ops.ts';
import { colorHex } from '../core/base.ts';
import { $, stage } from '../core/dom.ts';
import { appState, session } from '../core/state.ts';
import { findClose } from '../features/find.ts';
import { chirp } from '../settings/licenses.ts';
import { stopPlacing } from '../tools/place.ts';
import { child, esc, removeOnOutsidePress } from '../ui/dom.ts';
import { ago, mini, miniCache, plural, tile } from './homeTiles.ts';
import { draggable, dropZone, inlineRename, nestBoard, newBoardIn } from './nesting.ts';
import { openBoard } from './openBoard.ts';
import { refreshBoards, renameBoard, rowMenu, uniqueName } from './rowMenu.ts';
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

// and check again whenever you come back to the app

// ---------- home: zoom out to see every project, then a project's folders, then a folder's boards ----------
type HomeAt = { level: 'all'; id?: undefined } | { level: 'project' | 'folder'; id: string };
// null means Home is closed
let coverFor: Project | null = null;
export let homeAt: HomeAt | null = null;
export function openHome(go = 'all') {
  const [level, id] = go.split(':');
  findClose(undefined);
  homeAt = (level === 'project' || level === 'folder') && id ? { level, id } : { level: 'all' };
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

export function renderHome(): void {
  if (!homeAt) return;
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
    renderHome();
    return;
  }
  const chainF = f ? folderChain(f) : [];
  crumbs.innerHTML =
    `<button data-go="all">All projects</button>` +
    (p ? `<i>/</i><button data-go="project:${p.id}"></button>` : '') +
    chainF.map(x => `<i>/</i><button data-go="folder:${x.id}"></button>`).join('');
  const cb = crumbs.querySelectorAll('button');
  const projectCrumb = cb[1];
  if (p && projectCrumb) projectCrumb.textContent = p.name;
  chainF.forEach((x, i) => {
    const b = cb[i + (p ? 2 : 1)];
    if (b) b.textContent = x.name;
  });
  $('home').classList.toggle('deep', level !== 'all');
  $('homeTitle').textContent = f ? f.name : p ? p.name : 'Your projects';
  $('homeSub').textContent = f
    ? [subFolders(f.id).length ? plural(subFolders(f.id).length, 'folder') : '', plural(boardsIn(f.id).length, 'board')]
        .filter(Boolean)
        .join(' · ')
    : p
      ? plural(foldersIn(p.id).length, 'folder')
      : 'Every project, with its folders and boards inside.';
  const add = (label: string, run: () => unknown) => {
    const a = document.createElement('button');
    a.className = 'tile add';
    a.innerHTML = `<span>+</span>${label}`;
    a.onclick = run;
    grid.appendChild(a);
  };
  const projectTile = (pp: Project) => {
    const fs = foldersIn(pp.id),
      nb = fs.reduce((n, x) => n + boardsUnder(x), 0);
    const t = tile(
      'project',
      pp,
      `${plural(fs.length, 'folder')} · ${plural(nb, 'board')}`,
      () => openHome(`project:${pp.id}`),
      [['ren', 'Rename', '✎']],
    );
    const art = child(t, '.tile-art'),
      folderChips = fs
        .slice(0, 3)
        .map(x => {
          const name = esc(x.name);
          return `<span class="mf"><i></i>${name}</span>`;
        })
        .join(''),
      chips = `<div class="chips">${folderChips}</div>`;
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
          art.style.background = colorHex(pp.color);
        }
      });
    } else {
      art.style.background = colorHex(pp.color);
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
        const c = ev.target instanceof Element ? ev.target.closest<HTMLElement>('[data-c]')?.dataset.c : undefined;
        m.remove();
        if (c === 'pick') {
          coverFor = pp;
          const pick = $('coverPick');
          if (pick instanceof HTMLInputElement) pick.value = '';
          pick.click();
        }
        if (c === 'board') {
          delete pp.cover;
          saveLib().then(refreshBoards);
        }
      };
      removeOnOutsidePress(m);
    };
    child(t, '[data-a="ren"]').onclick = () => inlineRename(child(t, '.tile-meta b'), pp);
    t.oncontextmenu = e => rowMenu(e, 'project', pp, child(t, '.tile-meta b'));
    dropZone(t, 'folder', fid => putFolder(fid, null, pp.id));
    return t;
  };
  const folderTile = (ff: Folder) => {
    const bs = boardsIn(ff.id),
      ns = subFolders(ff.id).length,
      t = tile(
        'folder',
        ff,
        [ns ? plural(ns, 'folder') : '', plural(bs.length, 'board')].filter(Boolean).join(' · '),
        () => openHome(`folder:${ff.id}`),
        [['ren', 'Rename', '✎']],
      );
    const art = child(t, '.tile-art');
    art.innerHTML =
      '<div class="back"></div><div class="tab"></div><div class="peek"></div><div class="front"><span class="face"><b></b><i></i><b></b></span></div>';
    const shown = bs.slice(0, 3);
    child(art, '.peek').style.setProperty('--mid', String((shown.length - 1) / 2));
    shown.forEach(async (b, i) => {
      const d = document.createElement('div');
      d.className = 'paper';
      d.style.setProperty('--i', String(i));
      d.style.zIndex = i === Math.floor((shown.length - 1) / 2) ? '3' : '1';
      d.innerHTML = await mini(b.id);
      child(art, '.peek').appendChild(d);
    });
    child(t, '[data-a="ren"]').onclick = () => inlineRename(child(t, '.tile-meta b'), ff);
    t.oncontextmenu = e => rowMenu(e, 'folder', ff, child(t, '.tile-meta b'));
    draggable(t, 'folder', ff.id);
    dropZone(t, 'board', bid => moveBoard(bid, ff.id));
    dropZone(t, 'folder', fid => {
      if (fid !== ff.id && !putFolder(fid, ff)) chirp("A folder can't go inside itself ✦", 2500);
    });
    return t;
  };
  const boardTile = (b: BoardSummary) => {
    const t = tile(
      'board',
      b,
      b.updated ? `edited ${ago(b.updated)}` : '',
      () => {
        closeHome();
        openBoard(b.id);
      },
      [['ren', 'Rename', '✎']],
    );
    child(t, '[data-a="ren"]').onclick = () => inlineRename(child(t, '.tile-meta b'), b, v => renameBoard(b, v));
    mini(b.id).then(svg => {
      child(t, '.tile-art').innerHTML = svg || '<em>empty board</em>';
    });
    draggable(t, 'board', b.id);
    dropZone(t, 'board', id => nestBoard(id, b.id));
    t.oncontextmenu = e => rowMenu(e, 'board', b, child(t, '.tile-meta b'));
    return t;
  };
  const section = (label: string) => {
    const h = document.createElement('div');
    h.className = 'home-sec';
    h.textContent = label;
    grid.appendChild(h);
  };
  if (level === 'all') {
    appState.projects.forEach(pp => {
      grid.appendChild(projectTile(pp));
    });
    add('New project', async () => {
      const pp = makeProject(uniqueName(appState.projects, 'New project'));
      await saveLib();
      await refreshBoards();
      const t = [...grid.querySelectorAll('.tile.project')].pop();
      if (t) inlineRename(child(t, '.tile-meta b'), pp);
    });
    if (looseFolders().length) {
      section('Folders not in a project · drag onto a project to file');
      looseFolders().forEach(ff => {
        grid.appendChild(folderTile(ff));
      });
    }
    if (looseBoards().length) {
      section('Boards not in a folder');
      looseBoards().forEach(b => {
        grid.appendChild(boardTile(b));
      });
    }
  } else if (level === 'project' && p) {
    foldersIn(p.id).forEach(ff => {
      grid.appendChild(folderTile(ff));
    });
    add('New folder', async () => {
      const ff = makeFolder(uniqueName(appState.folders, 'New folder'), p.id);
      await saveLib();
      await refreshBoards();
      const t = [...grid.querySelectorAll('.tile.folder')].pop();
      if (t) inlineRename(child(t, '.tile-meta b'), ff);
    });
    if (looseBoards().length) {
      section('Boards not in a folder · drag onto a folder to file');
      looseBoards().forEach(b => {
        grid.appendChild(boardTile(b));
      });
    }
  } else if (f) {
    subFolders(f.id).forEach(ff => {
      grid.appendChild(folderTile(ff));
    });
    boardsIn(f.id).forEach(b => {
      grid.appendChild(boardTile(b));
    });
    add('New board', () => newBoardIn(f.id));
    add('New folder', async () => {
      const ff = makeFolder(uniqueName(appState.folders, 'New folder'), f.project || null);
      ff.parent = f.id;
      await saveLib();
      await refreshBoards();
      const t = [...grid.querySelectorAll('.tile.folder')].pop();
      if (t) inlineRename(child(t, '.tile-meta b'), ff);
    });
  }
}

export function init7() {
  $('crumbs').onclick = async e => {
    const pb = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-board]')?.dataset.board : undefined;
    if (pb) {
      session.board.view = session.view;
      await Fenmyr.save(session.board);
      return openBoard(pb);
    }
    const g = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-go]')?.dataset.go : undefined;
    if (g) openHome(g);
  };

  $('homeBtn').onclick = () => openHome('all');

  $('brand').onclick = () => openHome('all');

  $('homeBack').onclick = () => {
    if (!homeAt) return;
    const at = homeAt;
    const f = at.level === 'folder' ? appState.folders.find(x => x.id === at.id) : undefined;
    openHome(
      f && hasParent(f)
        ? `folder:${f.parent}`
        : f?.project && appState.projects.some(p => p.id === f.project)
          ? `project:${f.project}`
          : 'all',
    );
  };

  $('homeCrumbs').onclick = e => {
    const g = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-go]')?.dataset.go : undefined;
    if (g) openHome(g);
  };

  $('homeClose').onclick = closeHome;

  $('coverPick').onchange = () => {
    const pick = $('coverPick');
    const file = pick instanceof HTMLInputElement ? pick.files?.[0] : undefined,
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
        cv.getContext('2d')?.drawImage(im, 0, 0, cv.width, cv.height);
        p.cover = cv.toDataURL('image/jpeg', 0.86);
        saveLib().then(refreshBoards);
      };
      im.src = String(rd.result);
    };
    rd.readAsDataURL(file);
  };

  appState.saveT = undefined;
}
