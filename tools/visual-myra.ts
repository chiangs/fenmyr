import type { Page } from 'playwright';
import { type Board, settle } from '../tests/support/launch.ts';
import { longText, pasteIntoChat } from '../tests/support/paste.ts';

export type Step = (page: Page) => Promise<void>;
// width: the window's, for the prototype screen at each of its layouts; proto: open a prototype board first; env: for
// the app, such as a stand-in Claude Code first on PATH; version: run the app as that version, such as a beta
export type Group = {
  version?: string;
  settings?: Record<string, unknown>;
  env?: Record<string, string>;
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

// typing /template lists the picker's templates above her input; a checkout without the command lists nothing, so the
// state is listed as meant
const template: Group = {
  states: [
    [
      'menu',
      async page => {
        await page.evaluate(() =>
          document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null,
        );
        await page.click('#mPill');
        await page.fill('#mcInput', '/template');
      },
    ],
  ],
};

// the slash menu and the shared dialog in dark: both had a white background there, with light words on it, so the states
// are listed as meant
const popupsDark: Group = {
  settings: { theme: 'dark' },
  states: [
    [
      'slash',
      async page => {
        await page.evaluate(() =>
          document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null,
        );
        await page.click('#mPill');
        await page.fill('#mcInput', '/');
      },
    ],
    [
      'dialog',
      async page => {
        await page.evaluate(() => {
          void window.__fenmyr.saveWithDialog(null);
        });
        await page.waitForSelector('.tdlg h3');
      },
    ],
  ],
};

// The pill under her input, its open menu, and the Effort flyout beside it, with Sonnet 5.5 at Medium chosen so the menu
// shows its tick and the Effort row has a level. A checkout without the picker has no pill: the steps leave the open
// chat as it is, and the states are listed as meant.
const SONNET = { provider: 'claude-code', id: 'claude-sonnet-5-5', effort: 'medium' };
const openChat: Step = async page => {
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.click('#mPill');
  await page.mouse.move(1, 1);
};
// a local model such as Ollama's, listed after the Claude ones as a provider will, and chosen: the pill and its row in the
// open menu take as much of their width as they have and are cut with an ellipsis. Esc steps back out of a menu and its
// flyout left open, and only while one is, since Esc in the chat alone closes the chat.
const LOCAL = 'qwen3-coder-30b-a3b-instruct-q4_K_M';
const longName: Step = async page => {
  for (let i = 0; i < 2 && (await page.locator('#mcModelMenu').count()); i++) await page.keyboard.press('Escape');
  await page.evaluate(id => {
    const real = window.Fenmyr.models;
    window.Fenmyr.models = async () =>
      (await real()).map(p => ({ ...p, models: [...p.models, { id, name: id, efforts: ['low', 'medium', 'high'] }] }));
  }, LOCAL);
  const pill = page.locator('#mcModel');
  if (!(await pill.count())) return;
  await pill.click();
  await page.locator('#mcModelMenu [data-model]', { hasText: LOCAL }).click();
  await pill.click();
  await page.waitForSelector('#mcModelMenu', { timeout: 2000 }).catch(() => undefined);
  await page.mouse.move(1, 1);
};
const modelPicker = (settings: Record<string, unknown>, more: [string, Step][] = []): Group => ({
  settings: { ...settings, myraModel: SONNET },
  states: [
    ['pill', openChat],
    [
      'menu',
      async page => {
        const pill = page.locator('#mcModel');
        if (await pill.count()) await pill.click();
        await page.waitForSelector('#mcModelMenu', { timeout: 2000 }).catch(() => undefined);
        await page.mouse.move(1, 1);
      },
    ],
    [
      'effort',
      async page => {
        const row = page.locator('#mcModelMenu .mm-effort');
        if (await row.count()) await row.click();
        await page.waitForSelector('.mc-modelfly', { timeout: 2000 }).catch(() => undefined);
        await page.mouse.move(1, 1);
      },
    ],
    ...more,
  ],
});
// the narrowest the chat is placed (CHAT.minW in src/web/myra/chatRules.ts), which no window gives on a desktop, so the
// width is set the way the chat sets it
const narrow: Group = {
  settings: { myraModel: SONNET },
  states: [
    [
      'pill',
      async page => {
        await openChat(page);
        await page.evaluate(() => document.getElementById('myra')?.style.setProperty('--chat-w', '320px'));
      },
    ],
    ['long', longName],
  ],
};

// A question that never comes back, so she is working on it for as long as the state is shown: the send button is Stop
// with words typed in the box, then Ctrl+. stops her and the question is marked. A checkout without Stop shows the arrow
// where the square is, and her working where she has stopped, so the states are listed as meant.
const working: Step = async page => {
  await page.evaluate(() => {
    window.Fenmyr.connections = async () => ({ claude: true, mobbin: false, higgsfield: false });
    window.Fenmyr.ask = () => new Promise(() => {});
    window.Fenmyr.askStop = async () => true;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.click('#mPill');
  await page.evaluate(() => {
    void window.__fenmyr.ask('Group these by theme', false, undefined, true);
  });
  await page.fill('#mcInput', 'and name each group');
  await page.mouse.move(1, 1);
};
const stopped: Step = async page => {
  await page.focus('#mcInput');
  await page.keyboard.press('Control+.');
  await page.mouse.move(1, 1);
};
const stopping = (settings: Record<string, unknown>): Group => ({
  settings,
  states: [
    ['working', working],
    ['stopped', stopped],
  ],
});

export const MYRA_GROUPS = {
  stop: stopping({}),
  'stop-dark': stopping({ theme: 'dark' }),
  reply,
  sees,
  panels,
  offer,
  plan,
  template,
  'popups-dark': popupsDark,
  'model-picker': modelPicker({}, [['long', longName]]),
  'model-picker-dark': modelPicker({ theme: 'dark' }),
  'model-picker-clear': modelPicker({ theme: 'light', lightTheme: 'clear' }),
  'model-picker-lantern': modelPicker({ theme: 'dark', darkTheme: 'lantern' }),
  'model-picker-narrow': narrow,
};
