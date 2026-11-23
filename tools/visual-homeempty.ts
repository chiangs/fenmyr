import { still } from '../tests/support/settled.ts';
import type { Group, Step } from './visual-myra.ts';

// Home with nothing in a level: no project at all, a project with no folder, and a folder with no board. The base shows
// the same pages with a count where this branch says what to do. The step saves the library it needs, so the harness's one
// board stays loose and every level is empty by what it holds, not by what the board is.
const home =
  (at: string, projects: boolean): Step =>
  async page => {
    await page.evaluate(
      async ([go, withProjects]) => {
        const library = withProjects
          ? {
              projects: [
                { id: 'p1', name: 'Shop', open: true },
                { id: 'p2', name: 'Garden', open: true },
              ],
              folders: [{ id: 'f1', name: 'Boards', project: 'p1', open: true }],
              order: {},
            }
          : { projects: [], folders: [], order: {} };
        await window.Fenmyr.saveFolders(library);
        window.__fenmyr.openHome(go);
        await window.__fenmyr.refreshBoards();
      },
      [at, projects] as const,
    );
    await still(page);
  };

export const HOME_EMPTY_GROUPS: Record<string, Group> = {
  'home-empty': {
    states: [
      ['project', home('project:p2', true)],
      ['folder', home('folder:f1', true)],
    ],
  },
  'home-empty-dark': { settings: { theme: 'dark' }, states: [['all', home('all', false)]] },
  'home-empty-phone': { phone: true, states: [['folder', home('folder:f1', true)]] },
};
