import type { Page } from 'playwright';
import type { Group, Step } from './visual-myra.ts';

// A new prototype board with its rules and design cards, and the doc view of its rules. A checkout from before the
// cards makes a new prototype with Myra's notes only, so each step that needs a card leaves the screen as it is there.
// The board opens with every card in view, folding the code column for room, and Myra's bouncing stamp is taken off so
// no frame of it is caught.
const newPrototype: Step = async page => {
  await page.evaluate(() =>
    document.querySelector<HTMLElement>('#boards .node.folder.proto .node-head [data-a="add"]')?.click(),
  );
  await page.fill('#npName', 'Guides');
  await page.click('#npOk');
  await page.waitForFunction(() => window.__fenmyr.curBoard()?.name === 'Guides');
  await page.evaluate(() => {
    const H = window.__fenmyr;
    H.board.cards = H.board.cards.filter(c => c.type !== 'stamp');
    H.renderAll();
  });
};

const rulesId = (page: Page) =>
  page.evaluate(() => {
    const b = window.__fenmyr.curBoard();
    return b?.cards.find(c => c.type === 'doc' && c.role === 'rules')?.id ?? null;
  });

const openRules: Step = async page => {
  const id = await rulesId(page);
  if (!id) return;
  // on its icon, away from its title, which a double-click would edit
  await page.locator(`#cards [data-id="${id}"]`).dblclick({ position: { x: 12, y: 15 } });
  await page.waitForSelector('#docview.on');
};

const ignore: Step = async page => {
  if (await page.locator('#dvIgnore').count()) await page.locator('#dvIgnore').click();
};

const closeDoc: Step = async page => {
  if (await page.locator('#docview.on').count()) await page.click('#dvBack');
};

const states: [string, Step][] = [
  ['board', newPrototype],
  ['rules', openRules],
  ['rules-ignored', ignore],
  ['board-ignored', closeDoc],
];

export const GUIDES_GROUPS: Record<string, Group> = {
  guides: { proto: true, states },
  'guides-dark': { proto: true, settings: { theme: 'dark' }, states },
};
