import type { Page } from 'playwright';
import { type Board, settle } from '../tests/support/launch.ts';
import { longText, pasteIntoChat } from '../tests/support/paste.ts';

export type Step = (page: Page) => Promise<void>;
// width: the window's, for the prototype screen at each of its layouts; proto: open a prototype board first
export type Group = {
  settings?: Record<string, unknown>;
  board?: () => Board;
  phone?: boolean;
  width?: number;
  proto?: boolean;
  states: [string, Step][];
};

// a reply that changed the board, under her words in the open chat
const CHANGED = {
  say: 'I’ve sorted these into phases.',
  collections: [{ name: 'Phases', kanban: true, columns: ['To do', 'Doing', 'Done'] }],
  edit: [
    { id: 'todo', in: 'Phases' },
    { id: 'doc', in: 'Phases' },
    { id: 'note', in: 'Phases' },
    { id: 't1', text: 'Reworded by Myra' },
    { id: 't2', text: 'Also reworded' },
  ],
  remove: ['myranote'],
  next: ['Name the columns', 'Add due dates', 'Sum up each phase'],
  pages: [{ url: 'https://example.com/planning', title: 'Planning in phases' }],
};
// the notes she was given for it, with the web on, so what she read shows under her reply
const note = (rel: string, title: string) => ({
  vault: 'Notes',
  vaultId: 'v1',
  rel,
  title,
  tags: [],
  props: undefined,
  excerpt: title,
  text: title,
});
const READ = { asked: true, used: [note('Roadmap.md', 'Roadmap'), note('Retro.md', 'Retro notes')], web: true };
// a 1×1 picture for the files added to a message
const DOT = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const reply: Group = {
  states: [
    [
      'chat',
      async page => {
        await page.evaluate(() =>
          document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null,
        );
        await page.evaluate(([r, ctx]) => window.__fenmyr.applyMyra(r, 'q', ctx), [CHANGED, READ] as const);
        await settle(page, 1000);
        await page.keyboard.press('Escape');
        await page.click('#mPill');
      },
    ],
  ],
};
// what goes with the next message: the board, two selected cards, and the web left out
const sees: Group = {
  settings: { webAccess: true },
  states: [
    [
      'chat',
      async page => {
        await page.evaluate(() =>
          document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null,
        );
        await page.evaluate(() => window.__fenmyr.selectOnly(['note', 'todo']));
        await page.click('#mPill');
        const web = page.locator('#mcSees [data-chip="web"] .mcs-x');
        if (await web.count()) await web.click();
        // the resting look, not the hovered one
        await page.mouse.move(1, 1);
      },
    ],
    [
      'added',
      async page => {
        const input = page.locator('#mcFile');
        if (await input.count())
          await input.setInputFiles([
            { name: 'moodboard.png', mimeType: 'image/png', buffer: Buffer.from(DOT, 'base64') },
            { name: 'brief.md', mimeType: 'text/markdown', buffer: Buffer.from('The brief') },
          ]);
        const add = page.locator('#mcSees .mcs-add');
        if (await add.count()) await add.click();
        await page.mouse.move(1, 1);
      },
    ],
  ],
};
const panels: Group = {
  states: [
    [
      'doc-editor',
      async page => {
        await page.locator('#cards .card.doc').dblclick();
        await page.waitForSelector('.dv-prose');
      },
    ],
    [
      'myra-chat',
      async page => {
        await page.keyboard.press('Escape');
        await page.click('#mPill');
      },
    ],
    [
      'myra-draft',
      async page => {
        await page.fill('#mcInput', 'Group these by theme\nthen name each group\nand keep it short');
        await page.keyboard.press('Escape');
      },
    ],
    [
      'myra-expand',
      async page => {
        await page.click('#mPill');
        const expand = page.locator('#mcExpand');
        if (await expand.count()) await expand.click();
        await pasteIntoChat(page, longText(100));
      },
    ],
  ],
};

// a reply big enough to wait as a plan: a kanban of twelve cards, and a note removed
const BIG = {
  say: 'I’ve sorted these into phases.',
  collections: [{ name: 'Phases', kanban: true, columns: ['To do', 'Doing', 'Done'] }],
  add: Array.from({ length: 12 }, (_, i) => ({ type: 'note', text: `Task ${i + 1}`, in: 'Phases', column: i % 3 })),
  remove: ['myranote'],
  next: ['Name the columns', 'Add due dates'],
};
// It waits as a plan in the open chat, with its preview on the board, which shows alone once the chat closes, then
// lands with Do it. A checkout without plans has no answerMyra, so it shows the open chat and the state is listed as
// meant; one without the preview shows the board as it is.
const plan: Group = {
  states: [
    [
      'chat',
      async page => {
        await page.evaluate(() =>
          document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null,
        );
        await page.click('#mPill');
        await page.evaluate(async r => {
          const hooks: Record<string, unknown> = { ...window.__fenmyr };
          if (typeof hooks.answerMyra === 'function') await window.__fenmyr.answerMyra(r, 'q');
        }, BIG);
        await page.mouse.move(1, 1);
      },
    ],
    [
      'board',
      async page => {
        await page.keyboard.press('Escape');
        await settle(page, 600);
        await page.mouse.move(1, 1);
      },
    ],
    [
      'done',
      async page => {
        if (!(await page.locator('#mcInput').isVisible())) await page.click('#mPill');
        const doIt = page.locator('#mcList .m-acts button:text-is("Do it")');
        if (await doIt.count()) await doIt.click();
        // past her glow on what she made
        await settle(page, 2500);
        await page.mouse.move(1, 1);
      },
    ],
  ],
};

// her offer of a prototype board for a request that needs code, on a board in no project, then in one with no repo
const OFFER = {
  say: 'That needs code, so I’d make it a prototype board.',
  offerPrototype: { name: 'Checkout', device: 'phone', from: ['note', 'todo'], build: 'Build the checkout' },
};
const offer: Group = {
  states: [
    [
      'chat',
      async page => {
        await page.evaluate(() =>
          document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null,
        );
        await page.evaluate(r => window.__fenmyr.applyMyra(r, 'q'), OFFER);
        await settle(page, 1000);
        await page.keyboard.press('Escape');
        await page.click('#mPill');
      },
    ],
    [
      'norepo',
      async page => {
        await page.evaluate(async () => {
          await window.Fenmyr.saveFolders({
            projects: [{ id: 'vs', name: 'Shop', open: true }],
            folders: [{ id: 'vsf', name: 'Ideas', project: 'vs', open: true }],
            order: {},
          });
          await window.__fenmyr.refreshBoards();
          await window.__fenmyr.moveBoard('every', 'vsf');
        });
        await settle(page, 500);
        await page.keyboard.press('Escape');
        await page.click('#mPill');
      },
    ],
  ],
};

export const MYRA_GROUPS = { reply, sees, panels, offer, plan };
