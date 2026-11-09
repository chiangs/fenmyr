import type { Card, Project } from '../../shared/model.ts';
import { freshCopies } from '../canvas/clipboard.ts';
import { appState, session } from '../core/state.ts';
import { refreshBoards, uniqueName } from '../library/rowMenu.ts';
import { makeProject, saveLib } from '../library/tree.ts';
import { chirp } from '../myra/say.ts';
import { child, closestTo, esc } from '../ui/dom.ts';
import { showDialog } from '../ui/popover.ts';
import { scope } from '../ui/toolbar.ts';
import { linkRepo } from './link.ts';
import { newPrototypeIn, newPrototypingFolder, type Seed } from './prototypes.ts';

// Starting a prototype from anywhere, in one go: the project's repo (linked first if it has none), its prototyping
// folder (made if it has none), then the prototype's name. Every way in starts here.
async function startPrototype(first: Project, seed?: Seed): Promise<void> {
  const p = appState.projects.find(x => x.id === first.id) ?? first;
  if (!p.repo) return linkRepo(p, () => startPrototype(p, seed));
  const f =
    appState.folders.find(x => x.project === p.id && x.kind === 'prototyping') ?? (await newPrototypingFolder(p));
  if (f) newPrototypeIn(f, seed);
}

// Prototype this: copies of these cards (frames bring their pieces) start a new prototype, in this board's project
export const prototypeThis = (cards: Card[]) => startPrototypeHere(freshCopies(cards));

// the project the person is in, or one they choose
export function startPrototypeHere(seed?: Seed) {
  const here = scope().p;
  if (here) {
    startPrototype(here, seed);
    return;
  }
  pickProject(p => startPrototype(p, seed));
}

// Which project a prototype is for: one of theirs, or a new one, which then goes on to `then`. Cancel does nothing.
export function pickProject(then: (p: Project) => unknown) {
  const rows = appState.projects
    .map(p => {
      const id = esc(p.id),
        name = esc(p.name),
        note = p.repo ? '' : '<small>sets up a repo first</small>';
      return `<button class="set-btn" data-project="${id}">${name}${note}</button>`;
    })
    .join('');
  const d = showDialog(`<div class="tdlg sp" role="dialog"><h3>Which project is it for?</h3>
    <p class="set-note">A prototype’s code lives in its project’s repo.</p>
    <div class="sp-list">${rows}<button class="set-btn" data-project="new">A new project</button></div>
    <div class="tdlg-btns"><button class="set-btn" data-project="">Cancel</button></div></div>`);
  child(d, '.sp-list button').focus();
  d.onclick = async e => {
    const id = closestTo(e.target, '[data-project]')?.dataset.project;
    if (e.target !== d && id === undefined) return;
    d.remove();
    if (!id) return;
    if (id !== 'new') {
      const p = appState.projects.find(x => x.id === id);
      return p ? then(p) : undefined;
    }
    const made = makeProject(uniqueName(appState.projects, 'New project'));
    await saveLib();
    await refreshBoards();
    return then(made);
  };
  d.onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Escape') d.remove();
  };
}

const TIPPED = 'fenmyr:prototypeTip';

// A board's second wireframe screen: Myra mentions prototypes, once per project (or once for boards in none)
export function frameTip() {
  const b = session.board;
  if (b.kind === 'prototype' || b.cards.filter(c => c.type === 'frame').length < 2) return;
  const where = scope().p?.id ?? 'none';
  let told: unknown = [];
  try {
    told = JSON.parse(localStorage.getItem(TIPPED) || '[]');
  } catch {}
  const seen = Array.isArray(told) ? told.filter(x => typeof x === 'string') : [];
  if (seen.includes(where)) return;
  try {
    localStorage.setItem(TIPPED, JSON.stringify([...seen, where]));
  } catch {}
  chirp('Want to see these working? I can turn them into a clickable prototype ✦', 12000, [
    {
      label: 'Prototype these screens',
      cls: 'next',
      run: () => prototypeThis(session.board.cards.filter(c => c.type === 'frame')),
    },
    { label: 'Not now', ghost: true, run: () => {} },
  ]);
}
