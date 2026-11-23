// What the tests of creating a project, folder or board seed and read back: a small library, what the page saved of it,
// and what the person is left looking at.
import type { Page } from 'playwright';
import type { Folder, Project } from '../../src/shared/model.ts';
import { parseLibrary } from '../../src/shared/model.ts';
import type { BoardSummary } from '../../src/shared/ops.ts';

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'A note' };
const boardIn = (id: string, folder?: string) => ({
  id,
  name: id,
  folder,
  cards: [{ ...note }],
  links: [],
  tray: [],
  view: { x: 300, y: 200, z: 1 },
});

// Shop (Ideas), Garden (Plants, Tools) and Empty; a board in Ideas, one in Plants, and one in no folder
const PROJECTS: Project[] = [
  { id: 'p1', name: 'Shop', open: true },
  { id: 'p2', name: 'Garden', open: true },
  { id: 'p3', name: 'Empty', open: true },
];
const FOLDERS: Folder[] = [
  { id: 'f1', name: 'Ideas', project: 'p1', open: true },
  { id: 'f2', name: 'Plants', project: 'p2', open: true },
  { id: 'f3', name: 'Tools', project: 'p2', open: true },
];
export const SEEDED = [boardIn('a', 'f1'), boardIn('b', 'f2'), boardIn('loose')];

export async function seedLibrary(page: Page) {
  await page.evaluate(
    async ([projects, folders]) => {
      await window.Fenmyr.saveFolders({ projects, folders, order: {} });
      await window.__fenmyr.refreshBoards();
    },
    [PROJECTS, FOLDERS] as const,
  );
}

export type Stored = { projects: Project[]; folders: Folder[]; boards: BoardSummary[] };

export async function stored(page: Page): Promise<Stored> {
  const lib = parseLibrary(await page.evaluate(() => Fenmyr.folders()));
  return { projects: lib.projects, folders: lib.folders, boards: await page.evaluate(() => Fenmyr.list()) };
}

type Kinds = { project: Project; folder: Folder; board: BoardSummary };
const LISTS: { [K in keyof Kinds]: (s: Stored) => Kinds[K][] } = {
  project: s => s.projects,
  folder: s => s.folders,
  board: s => s.boards,
};

// Runs `act` and returns the one project, folder or board it saved. `act` finishes first, so what the page does after
// the save (opening, renaming) is done too; a click alone could not say when that is.
export async function makes<K extends keyof Kinds>(
  page: Page,
  kind: K,
  act: () => Promise<unknown>,
): Promise<Kinds[K]> {
  const before = new Set(LISTS[kind](await stored(page)).map(x => x.id));
  await act();
  const fresh = LISTS[kind](await stored(page)).filter(x => !before.has(x.id)),
    [only] = fresh;
  if (!only || fresh.length !== 1) throw new Error(`expected one new ${kind}, found ${fresh.length}`);
  return only;
}

// Runs the button's own handler and waits for it to finish. A click can't say when the work behind it is done, and
// something that must not happen can only be checked once it is. `label` picks among buttons that share a selector.
export const press = (page: Page, selector: string, label = '') =>
  page.evaluate(
    async ([sel, text]) => {
      const el = [...document.querySelectorAll(sel)].find(e => e.textContent?.includes(text));
      if (el instanceof HTMLElement) await el.onclick?.call(el, new PointerEvent('click'));
      else throw new Error(`nothing matches ${sel} ${text}`);
    },
    [selector, label] as const,
  );

// What the person sees after: the open board, whether Home covers it, what has the keyboard, and any name being typed
export const look = (page: Page) =>
  page.evaluate(() => {
    const open = window.__fenmyr.curBoard(),
      field = document.activeElement,
      typing = field instanceof HTMLInputElement && field.id === 'boardName';
    return {
      board: open.name,
      folder: open.folder ?? null,
      home: !!document.getElementById('home')?.classList.contains('on'),
      nameSelected:
        typing && field.value.length > 0 && field.selectionStart === 0 && field.selectionEnd === field.value.length,
      nameFocused: typing,
      renaming: [...document.querySelectorAll('[contenteditable="true"]')].map(e => e.textContent ?? ''),
    };
  });
