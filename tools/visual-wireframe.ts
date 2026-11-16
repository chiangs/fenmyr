import { wireframeBoard } from '../tests/fixtures/boards.ts';
import type { Group } from './visual-myra.ts';

// The wireframe board as later Phase 8 PRs change it: at rest, with the screen tool in hand, and a screen selected.
const wireframe: Group = {
  board: wireframeBoard,
  states: [
    ['board', async () => {}],
    [
      'tool',
      async page => {
        await page.evaluate(() =>
          document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null,
        );
        await page.keyboard.press('w');
        // the ghost rides the pointer, so it waits on bare board below the screens
        await page.mouse.move(760, 600);
      },
    ],
    [
      'screen',
      async page => {
        await page.keyboard.press('Escape');
        await page.evaluate(() => window.__fenmyr.selectOnly(['signin']));
      },
    ],
  ],
};

export const WIREFRAME_GROUPS = { wireframe };
