import { still } from '../tests/support/settled.ts';
import type { Group, Step } from './visual-myra.ts';

// The New project dialog over the board, as + Project opens it. The base has no dialog and no way to open one from here,
// so its step does nothing and the base shows the board alone.
const dialog =
  (search = ''): Step =>
  async page => {
    if (!(await page.evaluate(() => 'openNewProject' in window.__fenmyr))) return;
    await page.evaluate(() => window.__fenmyr.openNewProject());
    if (search) await page.fill('#npSearch', search);
    await still(page);
  };

export const NEW_PROJECT_GROUPS: Record<string, Group> = {
  'new-project': {
    states: [
      ['dialog', dialog()],
      ['search', dialog('map')],
    ],
  },
  'new-project-dark': { settings: { theme: 'dark' }, states: [['dialog', dialog()]] },
  'new-project-phone': { phone: true, states: [['dialog', dialog()]] },
};
