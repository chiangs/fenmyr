import type { Board, Folder, Project } from '../../shared/model.ts';
import type { Proto } from '../../shared/repos.ts';
import { appState } from '../core/state.ts';
import { closeHome } from '../library/home.ts';
import { newBoardIn } from '../library/nesting.ts';
import { openBoard } from '../library/openBoard.ts';
import { refreshBoards, uniqueName } from '../library/rowMenu.ts';
import { makeFolder, saveLib } from '../library/tree.ts';
import { newBoard } from '../model/boards.ts';
import { chirp } from '../settings/licenses.ts';
import { child, esc } from '../ui/dom.ts';
import { showDialog } from '../ui/popover.ts';
import { linkRepo } from './link.ts';

const projectOf = (f: Folder) => appState.projects.find(p => p.id === f.project);

// Prototypes live in prototyping folders, and their code in the project's repo, so a project needs a repo first.
export async function newPrototypingFolder(p: Project) {
  if (!p.repo) {
    chirp(`Link “${p.name}” to a repo first. Its prototypes are saved there ✦`, 4000);
    return linkRepo(p);
  }
  const f = makeFolder(uniqueName(appState.folders, 'Prototypes'), p.id);
  f.kind = 'prototyping';
  await saveLib();
  await refreshBoards();
  return f;
}

type Wish = { name: string; stack: Proto['stack']; purpose?: string; device?: Proto['device'] };

// A prototype board and its own folder of code in the repo, opened.
export async function createPrototype(f: Folder, root: string, w: Wish) {
  const made = await Fenmyr.protoCreate({ root, name: w.name, stack: w.stack });
  const proto: Proto = {
    ...made,
    ...(w.purpose ? { purpose: w.purpose } : {}),
    ...(w.device ? { device: w.device } : {}),
  };
  const b: Board = { ...newBoard(w.name), kind: 'prototype', proto, folder: f.id };
  await Fenmyr.save(b);
  await refreshBoards();
  // made from a folder's home, it opens in place of the home, as a new board does
  closeHome();
  await openBoard(b.id);
  chirp(`Made “${w.name}”. Its code is in ${proto.dir} ✦`, 4000);
  return b;
}

// A repo that already holds prototypes, newly linked: each one no board in the project uses yet gets a board in the
// project's prototyping folder.
export async function adoptPrototypes(p: Project) {
  const root = p.repo?.path,
    f = appState.folders.find(x => x.project === p.id && x.kind === 'prototyping');
  if (!root || !f) return;
  const mine = new Set(appState.folders.filter(x => x.project === p.id).map(x => x.id)),
    used = new Set(
      appState.boardList.flatMap(b => (b.kind === 'prototype' && b.folder && mine.has(b.folder) ? [b.dir] : [])),
    );
  const found = (await Fenmyr.protoFind({ root }).catch(() => [])).filter(x => !used.has(x.dir));
  if (!found.length) return;
  for (const x of found)
    await Fenmyr.save({ ...newBoard(x.name), kind: 'prototype', proto: { dir: x.dir, stack: x.stack }, folder: f.id });
  await refreshBoards();
  const what = found.length === 1 ? 'a prototype' : `${found.length} prototypes`;
  chirp(`I found ${what} already in prototypes/ and gave each a board in “${f.name}” ✦`, 6000);
}

// What adding a board to a folder means: a prototype in a prototyping folder, which holds nothing else, and an
// ordinary board everywhere else.
export const addBoardTo = (f: Folder) => (f.kind === 'prototyping' ? newPrototypeIn(f) : newBoardIn(f.id));

// Name and stack, then createPrototype.
function newPrototypeIn(f: Folder) {
  const p = projectOf(f);
  if (!p?.repo) {
    if (p) linkRepo(p);
    return chirp('This project needs a repo before it can hold prototypes ✦', 4000);
  }
  const root = p.repo.path,
    title = esc(`New prototype in “${f.name}”`);
  const d = showDialog(`<div class="tdlg" role="dialog"><h3>${title}</h3>
    <label>Name<input id="npName" placeholder="Checkout flow"></label>
    <div class="tdlg-row"><span>Code</span><div class="seg" id="npStack"><button data-v="react" class="on">React</button><button data-v="html">Plain HTML</button></div></div>
    <p class="set-note" id="npNote">React suits screens with state and reusable parts. Plain HTML suits a simple page anyone can edit.</p>
    <p class="rl-problem" id="npProblem"></p>
    <div class="tdlg-btns"><button class="set-btn" id="npNo">Cancel</button><button class="set-btn hot" id="npOk">Create</button></div></div>`);
  let stack: 'react' | 'html' = 'react';
  const name = child(d, '#npName', HTMLInputElement);
  name.focus();
  const create = async () => {
    try {
      await createPrototype(f, root, { name: name.value.trim() || 'Untitled prototype', stack });
      d.remove();
    } catch (e) {
      child(d, '#npProblem').textContent = e instanceof Error ? e.message : String(e);
    }
  };
  d.onclick = e => {
    const t = e.target instanceof HTMLElement ? e.target : null;
    if (e.target === d || t?.id === 'npNo') return d.remove();
    if (t?.id === 'npOk') return create();
    if (t?.dataset.v === 'react' || t?.dataset.v === 'html') {
      stack = t.dataset.v;
      for (const b of d.querySelectorAll('#npStack button')) b.classList.toggle('on', b === t);
    }
  };
  d.onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Escape') d.remove();
    if (e.key === 'Enter') create();
  };
}
