// The scenes tools/dark-sweep.ts walks through on the board in dark-board.ts, one after the other, each built on the
// last. A rule whose element no scene shows is blind, so a new area of the stylesheet needs a scene here first.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright';
import { ROOT } from '../tests/support/launch.ts';
import { freshRepo, openPrototype } from '../tests/support/prototype.ts';

// Escape, then a pause: while the chat is open its strip redraws on a key's release, one timer later, with whatever is
// selected then, so a selection made straight after Escape would be in the strip in one run and not in the next
const pressEscape = async (page: Page) => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
};

export type Scene = { name: string; run: (page: Page) => Promise<void>; done?: (page: Page) => Promise<void> };

const SELECTED = (id: string) => async (page: Page) => {
  await page.evaluate(card => window.__fenmyr.selectOnly([card]), id);
  await page.mouse.move(1439, 899);
};
// a popover opened from the selection bar (or from the document toolbar), with its card selected
const OPEN = (card: string, trigger: string) => async (page: Page) => {
  await pressEscape(page);
  await SELECTED(card)(page);
  // a trigger the bar folds away (the More button on a narrow bar) is skipped: that scene just shows what is open
  await page
    .locator(`#selbar ${trigger}`)
    .first()
    .click({ timeout: 1500 })
    .catch(() => undefined);
};
const pops = (card: string, names: string[]) =>
  names.map(name => ({ name: `${card} ${name}`, run: OPEN(card, `[data-pop="${name}"]`) }));
// a project with a folder and three boards, so the sidebar and the home screen have rows and tiles to show
const SEED_LIBRARY = (page: Page) =>
  page.evaluate(async () => {
    const boards = [
      ['oa', 'Alpha', 'of'],
      ['ob', 'Bravo', 'of'],
      ['oc', 'Charlie', ''],
    ];
    for (const [id, name, folder] of boards) await Fenmyr.save({ id: id ?? '', name, folder, cards: [], links: [] });
    await Fenmyr.saveFolders({
      projects: [{ id: 'pj', name: 'Project one', color: 'sky', open: true }],
      folders: [{ id: 'of', name: 'Order folder', project: 'pj', open: true }],
    });
    await window.__fenmyr.refreshBoards();
  });
// the row or tile's menu, then its Rename; the events are sent to them because the side panel can lie over a home tile
const MENU_RENAME = (target: string, item: string) => async (page: Page) => {
  await page.locator(target).first().dispatchEvent('contextmenu');
  await page.locator(item).first().dispatchEvent('click');
};
const TAB = (name: string) => (page: Page) => page.locator(`#setTabs [data-tab="${name}"]`).click({ timeout: 1500 });
// the top bar is covered when a card sits under it, so the view is moved until one does, and put back after
let savedView = { x: 0, y: 0, z: 1 };
let wasCovered = false;
// a widget lifted off the side panel, held with the button down, which shows the slots it can drop into
const LIFT = async (page: Page) => {
  const box = await page.locator('.side .box:not([data-box="boards"]) > header').first().boundingBox();
  if (!box) throw new Error('no widget header to lift');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 60, { steps: 6 });
};
// a vault with a board that may read it, for the chips under Settings, Connections
const VAULT = async (page: Page) => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-sweep-vault-'));
  fs.cpSync(path.join(ROOT, 'tests/sample-vault'), vault, { recursive: true });
  await page.evaluate(async dir => {
    const v = await Fenmyr.vaultAdd(dir);
    const board = window.__fenmyr.board;
    board.vaultAccess = [{ vault: v.id, folders: ['Projects'], ai: true, write: false, writeTo: 'Myra' }];
    await Fenmyr.save(board);
    document.dispatchEvent(new Event('fenmyr:vault-use'));
  }, vault);
};
const DOC_POPS = ['style', 'font', 'color', 'hl', 'align', 'link', 'more'];

export const SCENES: Scene[] = [
  { name: 'board', run: SELECTED('note') },
  { name: 'text', run: SELECTED('text') },
  { name: 'note styles', run: SELECTED('notefmt') },
  { name: 'swatch', run: SELECTED('swatch') },
  { name: 'video', run: SELECTED('video') },
  {
    name: 'two cards',
    run: page => page.evaluate(() => window.__fenmyr.selectOnly(['note', 'todo'])),
  },
  {
    name: 'image crop',
    run: async page => {
      await SELECTED('image')(page);
      await page.locator('#selbar [data-sb="crop"]').click({ timeout: 1500 });
    },
    done: page => pressEscape(page),
  },
  ...pops('line', ['squig']),
  ...pops('wf', ['place']),
  { name: 'wf pieces', run: OPEN('wf', '[data-pieces]'), done: page => pressEscape(page) },
  { name: 'text font', run: OPEN('text', '[data-sbfont]') },
  { name: 'shape', run: SELECTED('shape') },
  { name: 'todo', run: SELECTED('todo') },
  ...pops('note', ['tags', 'due', 'size', 'color', 'more']),
  { name: 'note tilt', run: OPEN('note', '.sb-tilt') },
  {
    name: 'note tag add',
    run: async page => {
      await pressEscape(page);
      await SELECTED('note')(page);
      // the resize handle can lie over the chip once the note has been selected for a while, so the press is sent to the chip
      const chip = page.locator('#cards [data-id="note"] .nt-add');
      await chip.dispatchEvent('pointerdown');
      await chip.dispatchEvent('pointerup');
    },
  },
  ...pops('text', ['type', 'tfill', 'place', 'stroke', 'more']),
  ...pops('box', ['fill', 'stroke', 'corners', 'place']),
  {
    name: 'library',
    run: async page => {
      await SEED_LIBRARY(page);
      await page.waitForSelector('.node-head', { state: 'attached', timeout: 8000 });
      await page.waitForTimeout(600);
    },
  },
  {
    name: 'row menu',
    run: page => page.locator('.board-row').first().click({ button: 'right' }),
    done: page => pressEscape(page),
  },
  {
    name: 'row rename',
    run: MENU_RENAME('.board-row', '.row-menu [data-m="ren"]'),
    done: page => pressEscape(page),
  },
  {
    name: 'folder rename',
    run: MENU_RENAME('.node-head', '.row-menu [data-m="ren"]'),
    done: page => pressEscape(page),
  },
  {
    name: 'colour rename',
    run: MENU_RENAME('.pal', 'button:has-text("Rename")'),
    done: page => pressEscape(page),
  },
  {
    name: 'widget lift',
    run: LIFT,
    done: async page => {
      await pressEscape(page);
      await page.mouse.up();
    },
  },
  {
    name: 'top covered',
    run: async page => {
      savedView = await page.evaluate(() => ({ ...window.__fenmyr.view }));
      wasCovered = await page.evaluate(() => !!document.querySelector('.top')?.classList.contains('covered'));
      await page.evaluate(() => {
        const f = window.__fenmyr;
        const bar = document.querySelector('.top')?.getBoundingClientRect();
        const note = f.board.cards.find(c => c.id === 'note');
        if (!bar || !note) return;
        f.view.x = bar.left + bar.width / 2 - (note.x + note.w / 2) * f.view.z;
        f.view.y = bar.top + bar.height / 2 - (note.y + note.h / 2) * f.view.z;
        f.applyView();
      });
      await page.waitForSelector('.top.covered', { state: 'attached', timeout: 8000 });
    },
    done: async page => {
      await page.evaluate(v => {
        Object.assign(window.__fenmyr.view, v);
        window.__fenmyr.applyView();
      }, savedView);
      await page.waitForFunction(
        was => !!document.querySelector('.top')?.classList.contains('covered') === was,
        wasCovered,
        {
          timeout: 8000,
        },
      );
    },
  },
  {
    name: 'resize grip held',
    run: page =>
      page.evaluate(() => {
        for (const g of document.querySelectorAll('.rz-grip')) g.classList.add('on');
      }),
    done: page =>
      page.evaluate(() => {
        for (const g of document.querySelectorAll('.rz-grip')) g.classList.remove('on');
      }),
  },
  { name: 'settings', run: page => page.locator('#gearBtn').click() },
  { name: 'settings layout', run: TAB('layout') },
  {
    name: 'settings vaults',
    run: async page => {
      await VAULT(page);
      await TAB('connections')(page);
    },
  },
  {
    name: 'chat',
    run: async page => {
      await pressEscape(page);
      await page.locator('#mPill').click();
    },
  },
  // the strip of what Myra sees, with a card selected, and the slash menu that a "/" in her box opens
  { name: 'chat sees', run: SELECTED('note') },
  // a plan waiting in the chat shows its boxes on the board, and goes when it is cancelled
  {
    name: 'plan',
    run: async page => {
      await page.evaluate(() =>
        window.__fenmyr.answerMyra(
          {
            say: 'A new column, and one note gone.',
            collections: [{ name: 'Phases', kanban: true, columns: ['To do', 'Doing', 'Done'] }],
            add: [0, 1, 2].map(i => ({ type: 'note', text: `Task ${i + 1}`, in: 'Phases', column: i })),
            edit: [
              { id: 'lay1', text: 'Write the brief, and then read it out loud to someone who was not in the room' },
            ],
            remove: ['todo'],
          },
          'q',
        ),
      );
      await page.waitForSelector('#planPreview .pp-box.laid', { state: 'attached', timeout: 8000 });
    },
    done: page =>
      page
        .locator('#mcList button:has-text("Cancel")')
        .last()
        .dispatchEvent('click', undefined, { timeout: 1500 })
        .catch(() => undefined),
  },
  {
    name: 'chat slash',
    run: async page => {
      await page.locator('#mcInput').fill('/');
    },
  },
  // the phone layout is the window's width; the page can be told it is a phone without resizing the window
  {
    name: 'phone',
    run: async page => {
      await pressEscape(page);
      // with a card selected the bar's strip takes the hub's place
      await page.evaluate(() => {
        window.__fenmyr.selectOnly([]);
        window.__phone?.set(true);
      });
    },
  },
  {
    name: 'phone sheet',
    run: page => page.locator('[data-sheet="add"]').dispatchEvent('click'),
    done: async page => {
      await pressEscape(page);
      await page.evaluate(() => window.__phone?.set(false));
    },
  },
  {
    name: 'doc',
    run: async page => {
      await page
        .locator('#mcInput')
        .fill('', { timeout: 1000 })
        .catch(() => undefined);
      await pressEscape(page);
      await page.locator('#cards [data-id="doc"]').dblclick();
      await page.waitForSelector('.dv-prose', { timeout: 8000 });
    },
  },
  // the toolbar folds buttons away on a narrow window, so the popovers are opened by the click and not by a pointer
  ...DOC_POPS.map(name => ({
    name: `doc ${name}`,
    run: async (page: Page) => {
      await page
        .locator(`.dt-b[data-pop="${name}"]`)
        .first()
        .dispatchEvent('click', undefined, { timeout: 1500 })
        .catch(() => undefined);
    },
  })),
  {
    name: 'doc table',
    run: async page => {
      const more = page.locator('.dt-b[data-pop="more"]').first();
      await more.dispatchEvent('click');
      await page.locator('[data-ins="table"]').first().dispatchEvent('click');
      await more.dispatchEvent('click');
    },
  },
  { name: 'doc export', run: page => page.locator('#dvExport').dispatchEvent('click') },
  { name: 'doc page', run: page => page.locator('#dvPageMode').dispatchEvent('click') },
  {
    name: 'prototype',
    run: async page => {
      await pressEscape(page);
      await openPrototype(page, freshRepo('fenmyr-sweep-').repo);
      await page.waitForSelector('#prGit', { timeout: 8000 });
    },
  },
  {
    name: 'home',
    run: async page => {
      await pressEscape(page);
      await page.locator('#homeBtn').click();
    },
  },
  {
    name: 'home cover menu',
    run: page => page.locator('.tile.project .cover-btn').first().dispatchEvent('click'),
  },
  {
    name: 'home folder',
    run: page =>
      page
        .locator('.tile.project')
        .first()
        .click({ position: { x: 10, y: 10 } }),
  },
  { name: 'home rename', run: MENU_RENAME('.tile', '.row-menu [data-m="ren"]') },
  // what is left to show is what the app shows only once: what's new, Setup, the tour, and the update row once there is an
  // update; the last two are set up by hand, as the app sets them
  {
    name: 'news',
    run: page =>
      page.evaluate(async () => {
        localStorage.removeItem('fenmyr:newsSeen');
        await window.__fenmyr.maybeNews();
      }),
  },
  { name: 'setup', run: page => page.evaluate(() => window.__fenmyr.openSetup()) },
  {
    name: 'tour',
    run: page =>
      page.evaluate(() => {
        window.__fenmyr.startTour();
        document.getElementById('coachTry')?.classList.add('yay');
      }),
  },
  {
    name: 'update ready',
    run: page => page.evaluate(() => document.getElementById('setUpdate')?.classList.add('ready')),
  },
];
