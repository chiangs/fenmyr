import type { Page } from 'playwright';
import { wireframeBoard } from '../tests/fixtures/boards.ts';
import type { Group, Step } from './visual-myra.ts';

// The picker open on the Sign in screen: selecting it opens the picker, and Pieces does on a base where it doesn't, or
// on a phone. A base without the picker has no button, so its step does nothing there.
const openPieces = async (page: Page) => {
  await page.evaluate(() => window.__fenmyr.selectOnly(['signin']));
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    if (document.getElementById('piecePick')?.hidden)
      document.querySelector<HTMLElement>('#selbar [data-pieces]')?.click();
  });
  await page.mouse.move(5, 450);
};
const pieces: Step = async page => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  await openPieces(page);
};

// The Sign in button's box with its Size ▾ open, or the whole button with Align ▾ open. A base without the dropdown
// shows the selection alone.
const openDropdown =
  (ids: string[], pop: string): Step =>
  async page => {
    await page.evaluate(i => window.__fenmyr.selectOnly(i), ids);
    await page.waitForTimeout(150);
    await page.evaluate(p => document.querySelector<HTMLElement>(`#selbar [data-pop="${p}"]`)?.click(), pop);
    await page.mouse.move(5, 450);
  };

// The wireframe board as later Phase 8 PRs change it: at rest, with the screen tool in hand, a screen selected, a
// piece's Size ▾ and Align ▾ open, a heading's Type ▾ open, an icon selected, the Pieces picker and its Icons view
// beside it, and an empty screen's hint zoomed in.
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
    ['size', openDropdown(['go0'], 'place')],
    ['align', openDropdown(['go0', 'go1'], 'align')],
    ['text', openDropdown(['head0'], 'type')],
    [
      'icon',
      async page => {
        await page.keyboard.press('Escape');
        await page.evaluate(() => window.__fenmyr.selectOnly(['nav1']));
        await page.mouse.move(5, 450);
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

// On a phone: the + sheet on Basics, which holds the Wireframe button, then the button chosen, with the Wireframe row
// in the dock. A base without the button keeps the sheet open on its second step.
const phoneAdd: Step = async page => {
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#piecePick [data-pk-close]')?.click();
    window.__fenmyr.selectOnly([]);
    document.querySelector<HTMLElement>('[data-sheet="add"]')?.click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector<HTMLElement>('#shTabs [data-t="0"]')?.click());
};
const phoneScreen: Step = async page => {
  await page.evaluate(() => document.querySelector<HTMLElement>('#shBody [data-add="frame"]')?.click());
  await page.waitForTimeout(300);
};

export const WIREFRAME_GROUPS = {
  wireframe,
  'wireframe-dark': { board: wireframeBoard, settings: { theme: 'dark' }, states: [['pieces', pieces]] },
  'wireframe-phone': {
    board: wireframeBoard,
    phone: true,
    states: [
      ['pieces', pieces],
      ['add', phoneAdd],
      ['screen', phoneScreen],
    ],
  },
} satisfies Record<string, Group>;
