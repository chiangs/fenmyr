import type { Page } from 'playwright';
import { wireframeBoard } from '../tests/fixtures/boards.ts';
import type { Group, Step } from './visual-myra.ts';

// Pieces for the Sign in screen. A base without the picker has no button, so its step does nothing there.
const openPieces = async (page: Page) => {
  await page.evaluate(() => window.__fenmyr.selectOnly(['signin']));
  await page.waitForTimeout(150);
  await page.evaluate(() => document.querySelector<HTMLElement>('#selbar [data-pieces]')?.click());
  await page.mouse.move(5, 450);
};
const pieces: Step = async page => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  await openPieces(page);
};

// The wireframe board as later Phase 8 PRs change it: at rest, with the screen tool in hand, a screen selected, the
// Pieces picker and its Icons view beside it, and an empty screen's hint zoomed in.
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
    ['pieces', openPieces],
    [
      'icons',
      async page => {
        await page.evaluate(() => document.querySelector<HTMLElement>('#piecePick [data-pk-view="icons"]')?.click());
        await page.mouse.move(5, 450);
      },
    ],
    [
      'hint',
      async page => {
        await page.evaluate(() => {
          document.querySelector<HTMLElement>('#piecePick [data-pk-close]')?.click();
          window.__fenmyr.selectOnly([]);
          Object.assign(window.__fenmyr.view, { x: 200, y: 60, z: 0.5 });
          window.__fenmyr.applyView();
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        });
      },
    ],
  ],
};

export const WIREFRAME_GROUPS = {
  wireframe,
  'wireframe-dark': { board: wireframeBoard, settings: { theme: 'dark' }, states: [['pieces', pieces]] },
  'wireframe-phone': { board: wireframeBoard, phone: true, states: [['pieces', pieces]] },
} satisfies Record<string, Group>;
