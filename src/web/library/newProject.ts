import { queryWords } from '../core/base.ts';
import { appState } from '../core/state.ts';
import { iconOf, matchesSearch, runTemplate, type TemplateEntry, templateEntries } from '../features/templateList.ts';
import { say } from '../myra/say.ts';
import { child, closestTo, esc, htmlIn } from '../ui/dom.ts';
import { showDialog } from '../ui/popover.ts';
import { createBoard, createExample, createFirstFolder, createProject, type Place, uniqueName } from './create.ts';
import { loadLib } from './nesting.ts';
import { refreshBoards } from './rowMenu.ts';
import { boardsIn, foldersIn, saveLib } from './tree.ts';

type Start = { kind: 'blank' } | { kind: 'example' } | { kind: 'template'; entry: TemplateEntry };
type Row = { name: string; line: string; group: string; icon: string; start: Start };

const NAME_MAX = 60;

const FIRST: Row[] = [
  {
    name: 'Blank board',
    line: 'An empty board, ready for anything',
    group: 'Start',
    icon: 'board-only',
    start: { kind: 'blank' },
  },
  {
    name: 'Starter',
    line: 'The example board, “My first board”, to look around in',
    group: 'Start',
    icon: 'sparkle',
    start: { kind: 'example' },
  },
];

// The template menu's own rows, so a template added there is offered here. The prototype is left out: it needs a repo
// linked to its project, and a new project has none.
const rowsNow = (): Row[] => [
  ...FIRST,
  ...templateEntries()
    .filter(e => e.kind !== 'prototype')
    .map(
      (entry): Row => ({
        name: entry.name,
        line: entry.line,
        group: entry.group,
        icon: iconOf(entry),
        start: { kind: 'template', entry },
      }),
    ),
];

const rowHtml = (r: Row, i: number) => {
  const n = String(i),
    icon = Icon(r.icon),
    name = esc(r.name),
    line = esc(r.line);
  return `<button type="button" class="np-row" id="npRow${n}" data-i="${n}" role="option" aria-selected="false" tabindex="-1"><span class="np-e">${icon}</span><span class="np-t"><b>${name}</b><small>${line}</small></span></button>`;
};

const listHtml = (all: Row[]) =>
  all
    .map((r, i) => {
      const group = esc(r.group),
        head = r.group === all[i - 1]?.group ? '' : `<div class="np-h">${group}</div>`;
      return head + rowHtml(r, i);
    })
    .join('');

async function begin(start: Start, name: string) {
  const p = await createProject(name),
    f = await createFirstFolder(p),
    at: Place = { project: p.id, folder: f.id };
  switch (start.kind) {
    case 'blank':
      await createBoard(at, { open: 'name' });
      return;
    case 'example':
      await createExample(at);
      return;
    case 'template':
      await runTemplate(start.entry, at);
      return;
    default: {
      const unhandled: never = start;
      return unhandled;
    }
  }
}

// A start that failed can leave a project, or a project and its Boards folder, with no board in them. The library is read
// again from disk, so what only reached memory is gone, and what was saved is taken back. A saved board means only opening
// it failed, so the project is kept. Says whether anything was left.
async function takeBack(had: Set<string>): Promise<boolean> {
  try {
    await loadLib();
    const made = appState.projects.filter(p => !had.has(p.id)),
      folders = made.flatMap(p => foldersIn(p.id));
    if (!made.length) return false;
    if (folders.some(f => boardsIn(f.id).length)) return true;
    appState.projects = appState.projects.filter(p => !made.includes(p));
    appState.folders = appState.folders.filter(f => !folders.includes(f));
    await saveLib();
    return false;
  } catch {
    return true;
  } finally {
    await refreshBoards().catch(() => {});
  }
}

const failure = (name: string, e: unknown, left: boolean) => {
  const why = (e instanceof Error ? e.message : String(e)).replace(/\.$/, '');
  return left
    ? `Could not finish the project “${name}”: ${why}. What was made is still in All projects.`
    : `Could not make the project “${name}”: ${why}. Nothing was kept, so you can try again.`;
};

type Opened = { name: string; asked: string };

// `want` is a name to start from, such as the one /project was given; it is made unique like any other. Says the name the
// dialog started with beside the one asked for, so a caller can say when they differ. Nothing when a project is already
// being made, since that dialog is left as it is.
export function openNewProject(want = ''): Opened | undefined {
  const before = document.getElementById('npDlg');
  if (before?.classList.contains('busy')) return undefined;
  before?.remove();
  const all = rowsNow(),
    asked = want.trim().slice(0, NAME_MAX),
    start = uniqueName(appState.projects, asked || 'New project'),
    name = esc(start),
    rows = listHtml(all);
  const d = showDialog(
    `<div class="tdlg np" role="dialog" aria-modal="true" aria-labelledby="npTitle"><h3 id="npTitle">New project</h3>
    <label>Name<input id="npName" maxlength="${NAME_MAX}" value="${name}" autocomplete="off" spellcheck="false"></label>
    <label>First board<input id="npSearch" placeholder="Search…" autocomplete="off" spellcheck="false" aria-controls="npList"></label>
    <div class="np-list" id="npList" role="listbox">${rows}<div class="np-none" hidden>Nothing matches</div></div>
    <div class="tdlg-btns"><button class="set-btn" id="npNo">Cancel</button></div></div>`,
    'npDlg',
  );
  const nameIn = child(d, '#npName', HTMLInputElement),
    searchIn = child(d, '#npSearch', HTMLInputElement),
    buttons = htmlIn(d, '.np-row'),
    none = child(d, '.np-none');
  let at = 0,
    busy = false;

  // The highlighted row is what Enter chooses. It is -1 while nothing matches the search.
  const select = (i: number) => {
    at = i;
    buttons.forEach((b, k) => {
      b.classList.toggle('on', k === i);
      b.setAttribute('aria-selected', String(k === i));
    });
    const row = buttons[i];
    row?.scrollIntoView({ block: 'nearest' });
    for (const field of [nameIn, searchIn]) field.setAttribute('aria-activedescendant', row?.id ?? '');
  };
  const filter = () => {
    const words = queryWords(searchIn.value),
      match = all.map(r => matchesSearch(words, r.name, r.line));
    buttons.forEach((b, i) => {
      b.hidden = !match[i];
    });
    for (const h of htmlIn(d, '.np-h')) h.hidden = !all.some((r, i) => match[i] && r.group === h.textContent);
    none.hidden = match.includes(true);
    if (!match[at]) select(match.indexOf(true));
  };
  const move = (step: number) => {
    const shown = buttons.flatMap((b, i) => (b.hidden ? [] : [i])),
      next = shown[(shown.indexOf(at) + step + shown.length) % shown.length];
    if (next !== undefined) select(next);
  };

  // Once chosen, the controls are disabled and a second choice is ignored, so a second click or Enter cannot make a
  // second project. The dialog stays until the board is open, and takes the clicks that would otherwise land on the
  // page under it.
  const choose = async (i: number) => {
    const row = all[i];
    if (!row || busy) return;
    busy = true;
    d.classList.add('busy');
    for (const el of d.querySelectorAll('input, button'))
      if (el instanceof HTMLInputElement || el instanceof HTMLButtonElement) el.disabled = true;
    const had = new Set(appState.projects.map(p => p.id));
    try {
      await begin(row.start, nameIn.value);
    } catch (e) {
      say(failure(nameIn.value.trim() || 'New project', e, await takeBack(had)), 8000);
    } finally {
      d.remove();
    }
  };

  d.onclick = e => {
    const row = closestTo(e.target, '.np-row');
    if (row) return void choose(Number(row.dataset.i));
    // the second click of a double click on + Project lands on the backdrop, and is not meant to close what the first opened
    const out = (e.target === d && e.detail < 2) || closestTo(e.target, '#npNo');
    if (out && !busy) d.remove();
  };
  d.oninput = e => {
    if (e.target === searchIn) filter();
  };
  d.onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Escape') d.remove();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      move(e.key === 'ArrowDown' ? 1 : -1);
    }
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement && !e.isComposing) {
      e.preventDefault();
      void choose(at);
    }
  };
  select(0);
  nameIn.focus();
  nameIn.select();
  return { name: start, asked };
}
