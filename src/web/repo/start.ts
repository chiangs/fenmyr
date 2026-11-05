import type { Project } from '../../shared/model.ts';
import { appState } from '../core/state.ts';
import { refreshBoards, uniqueName } from '../library/rowMenu.ts';
import { makeProject, saveLib } from '../library/tree.ts';
import { child, closestTo, esc } from '../ui/dom.ts';
import { showDialog } from '../ui/popover.ts';
import { scope } from '../ui/toolbar.ts';
import { linkRepo } from './link.ts';
import { newPrototypeIn, newPrototypingFolder } from './prototypes.ts';

// Starting a prototype from anywhere, in one go: the project's repo (linked first if it has none), its prototyping
// folder (made if it has none), then the prototype's name. Every way in starts here.
async function startPrototype(first: Project): Promise<void> {
  const p = appState.projects.find(x => x.id === first.id) ?? first;
  if (!p.repo) return linkRepo(p, () => startPrototype(p));
  const f =
    appState.folders.find(x => x.project === p.id && x.kind === 'prototyping') ?? (await newPrototypingFolder(p));
  if (f) newPrototypeIn(f);
}

// the project the person is in, or one they choose
export function startPrototypeHere() {
  const here = scope().p;
  if (here) {
    startPrototype(here);
    return;
  }
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
      return p ? startPrototype(p) : undefined;
    }
    const made = makeProject(uniqueName(appState.projects, 'New project'));
    await saveLib();
    await refreshBoards();
    return startPrototype(made);
  };
  d.onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Escape') d.remove();
  };
}
