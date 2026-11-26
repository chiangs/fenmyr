// A build's block says what the builder was given and what that took of the model's context. Part one, from a record
// as the chat keeps it: the first line lists what was read and the share of the context it took, and holds what each
// part cost, and the window, in a tooltip a keyboard reaches; a line follows for each thing left out to fit, marked as
// something to look at; and Select these cards selects those cards on the board. A record from before reads how
// many cards it read, as it did. Part two, live: a whole-board build through the stand-in builder keeps the same on its
// record, against the window of a model nobody chose.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ChatAction, ChatMsg } from '../src/shared/chat.ts';
import type { ContextUse } from '../src/shared/contextFit.ts';
import type { Card } from '../src/shared/model.ts';
import { buildStandIn } from './support/buildStandIn.ts';
import { launch } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';
import { still } from './support/settled.ts';
import { tipKit } from './support/tipSeen.ts';

const { repo } = freshRepo('fenmyr-build-context-');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]).toString();
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');

const l = await launch({ claude: true });
const standIn = buildStandIn(l);
const { page } = l;
const { seen } = tipKit(page);

type Block = {
  lines: string[];
  marks: string[];
  tip: string;
  focusable: boolean;
  described: string;
  buttons: string[];
};
const blocks = (): Promise<Block[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('#mcList .mc-msg.bare')].map(m => {
      const first = m.querySelector<HTMLElement>('.m-summary li');
      return {
        lines: [...m.querySelectorAll('.m-summary li')].map(li => li.textContent ?? ''),
        marks: [...m.querySelectorAll<HTMLElement>('.m-summary li')].map(li => li.dataset.mark ?? ''),
        tip: first?.dataset.tip ?? '',
        focusable: first?.tabIndex === 0,
        described: first?.getAttribute('aria-description') ?? '',
        buttons: [...m.querySelectorAll('.m-acts button')].map(b => b.textContent ?? ''),
      };
    }),
  );
const selected = () => page.evaluate(() => window.__fenmyr.sel.toSorted());

const note = (id: string, x: number, text: string): Card => ({ id, type: 'note', x, y: 0, w: 220, h: 120, text });
const cards: Card[] = [
  note('n1', 0, 'Checkout: show the total first'),
  note('n2', 260, 'Card fields'),
  note('n3', 520, 'Coupon codes'),
  note('n4', 780, 'Receipts by email'),
  { id: 'scr', type: 'frame', x: 1040, y: 0, w: 393, h: 852, device: 'iPhone', radius: 44, name: 'Pay screen' },
];

// 12 cards and 2 pictures of 9,000 and 9,568 tokens, with the request and design.md, take 20,068 of 1,000,000
const use: ContextUse = {
  window: 1_000_000,
  parts: [
    { kind: 'request', tokens: 300 },
    { kind: 'cards', tokens: 9_000, count: 12 },
    { kind: 'pictures', tokens: 9_568, count: 2 },
    { kind: 'design', tokens: 1_200 },
  ],
  left: ['n3', 'n4'],
  pictures: [],
  shortened: [],
  unseen: ['scr'],
  tooBig: [],
};
const T = Date.UTC(2026, 10, 2, 9, 30);
type BuildAct = Extract<ChatAction, { kind: 'build' }>;
const record = (build: string, cardCount: number, start: BuildAct['start']): BuildAct => ({
  kind: 'build',
  board: 'pb',
  build,
  request: 'Make the checkout form.',
  cards: cardCount,
  start,
  end: {
    kind: 'built',
    at: T + 50_000,
    files: [{ kind: 'text', path: 'src/App.tsx', added: 3, removed: 1 }],
    outside: [],
    from: [],
    check: { kind: 'ran', count: 0, errors: [] },
  },
});
const SNAPSHOT = 'a'.repeat(40);
const chat: ChatMsg[] = [
  { who: 'me', text: 'Make the checkout form.', t: T },
  { who: 'myra', text: 'Writing it now.', t: T + 1000 },
  { who: 'myra', text: '', t: T + 2000, acts: [record('with', 12, { at: T + 2000, snapshot: SNAPSHOT, use })] },
  { who: 'me', text: 'And again.', t: T + 60_000 },
  { who: 'myra', text: '', t: T + 62_000, acts: [record('without', 4, { at: T + 62_000, snapshot: SNAPSHOT })] },
];

try {
  const dir = await page.evaluate(
    async ({ repo, cards, chat }) => {
      await window.Fenmyr.saveFolders({
        projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
        folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
        order: {},
      });
      const proto = await window.Fenmyr.protoCreate({ root: repo, name: 'Checkout', stack: 'react' });
      // the stored chat is the record's own words, read back by the app as a board file is
      await window.Fenmyr.save({
        id: 'pb',
        name: 'Checkout',
        folder: 'pf',
        kind: 'prototype',
        proto: { ...proto, build: 'without' },
        cards,
        links: [],
        tray: [],
        chat,
      });
      await window.__fenmyr.refreshBoards();
      await window.__fenmyr.openBoard('pb');
      return proto.dir;
    },
    { repo, cards, chat },
  );
  assert(dir, 'the prototype was made');
  git('add', '-A');
  git('commit', '-qm', 'start');
  await page.waitForFunction(() => document.querySelectorAll('#mcList .mc-msg.bare').length === 2);
  await still(page);

  const [first, old] = await blocks();
  assert(first && old, 'both blocks are drawn');
  assert.deepStrictEqual(
    first.lines,
    [
      'Read 12 cards, 2 pictures and design.md · about 2% of the context',
      '2 cards were left out to fit',
      '1 screen wasn’t in view, so its layout went without a picture',
      'src/App.tsx +3 −1',
      'Preview runs · no errors',
    ],
    'the first line says what was read and how much of the context it took, a line follows for what was left out',
  );
  assert.deepStrictEqual(
    first.marks,
    ['done', 'bad', 'bad', 'done', 'done'],
    'the lines about what was left out are marked, the rest are as they were',
  );
  assert.strictEqual(
    first.tip,
    [
      'The request · about 300 tokens',
      '12 cards · about 9,000 tokens',
      '2 pictures · about 9,568 tokens',
      'design.md · about 1,200 tokens',
      'Of a 1,000,000-token context',
    ].join('\n'),
    'the first line’s tooltip lists what each part cost and the window it was against',
  );
  assert(first.focusable, 'the keyboard reaches that line');
  assert.strictEqual(first.described, first.tip, 'and a screen reader hears the same');
  assert.deepStrictEqual(first.buttons, ['Select these cards'], 'the block offers to select what was left out');
  assert.deepStrictEqual(old.lines.slice(0, 1), ['Read 4 cards'], 'a record without it reads how many cards it read');
  assert.strictEqual(old.tip, '', 'with no tooltip');
  assert.deepStrictEqual(old.buttons, [], 'and nothing to select');
  await seen('the first line’s tooltip', '#mcList .m-summary.build li[data-tip]', {
    at: 'above',
    surface: 'chat',
    delay: '0.25s',
    shot: 'build-context-tip',
  });
  await seen('and from the keyboard', '#mcList .m-summary.build li[data-tip]', {
    at: 'above',
    surface: 'chat',
    delay: '0.25s',
    focus: true,
  });

  await page.evaluate(() => window.__fenmyr.selectOnly(['n1']));
  await page.locator('#mcList button', { hasText: 'Select these cards' }).click();
  assert.deepStrictEqual(await selected(), ['n3', 'n4', 'scr'], 'Select these cards selects exactly those cards');
  assert.deepStrictEqual((await blocks())[0]?.buttons, ['Select these cards'], 'and the block keeps its button');

  // a whole-board build, nothing selected, through the stand-in builder
  await page.evaluate(() => window.__fenmyr.selectOnly([]));
  standIn.next({ files: { 'src/App.tsx': 'export const App = () => <h1>Built</h1>;\n' }, reply: 'Built it.' });
  await page.evaluate(() =>
    window.__fenmyr.applyMyra({ say: 'On it.', build: { request: 'Build the lot.' } }, 'Build the lot.'),
  );
  await page.waitForFunction(() =>
    [...document.querySelectorAll('#mcList .mc-msg')].some(m => m.firstChild?.textContent === 'Built it.'),
  );
  // the record is on disk with what the host sent, which is the window of a model nobody chose
  await page.waitForFunction(async () => {
    const b = await window.Fenmyr.load('pb');
    return b?.chat?.some(m => m.acts?.some(a => a.kind === 'build' && a.request === 'Build the lot.' && a.start?.use));
  });
  const stored: { chat?: { acts?: { kind: string; request?: string; start?: { use?: ContextUse } }[] }[] } = JSON.parse(
    fs.readFileSync(path.join(l.data, 'fenmyr', 'boards', 'pb.json'), 'utf8'),
  );
  const live = stored.chat?.flatMap(m => m.acts ?? []).find(a => a.kind === 'build' && a.request === 'Build the lot.');
  assert.strictEqual(live?.start?.use?.window, 200_000, 'the record keeps the window the host fitted to');
  assert(
    live?.start?.use?.parts.some(p => p.kind === 'cards' && p.count === 5),
    'and what the cards took',
  );
  const [, , built] = await blocks();
  assert.match(built?.lines[0] ?? '', /^Read 5 cards.* · (about \d+%|under 1%) of the context$/, 'the block reads it');
  assert.deepStrictEqual(l.errors, []);
  console.log('BUILD CONTEXT LINE OK');
} finally {
  await l.close();
}
