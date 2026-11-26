// The "Myra sees" strip on a prototype board names the four documents a build is sent. In Node: which chips a board
// gets, in what order, and that none of them changes what a message goes with. In the app: a prototype whose project
// has a repo shows Repo rules and Repo design; a rules card with words adds Board rules between them; the card's Ignore
// switch turns Repo rules to "Repo rules · ignored", dashed like a chip that is left out; pressing Board rules opens that
// card; typing in the card, deleting it and closing it follow into the strip with no other input; an ordinary board in
// the same project shows none, and a prototype with no repo shows only the board's own. Each chip says what it is in a
// tooltip that is whole and reached from the keyboard, and is named by its aria-label, never a title.
import assert from 'node:assert';
import fs from 'node:fs';
import type { Card, CardOf } from '../src/shared/model.ts';
import { capture, chipsOf, NO_FLIPS, type SeesInput } from '../src/web/myra/sees.ts';
import { launch } from './support/launch.ts';
import { check } from './support/modelKit.ts';
import { freshRepo } from './support/prototype.ts';
import { still } from './support/settled.ts';
import { tipKit } from './support/tipSeen.ts';

const none = { text: '', ignoreRepo: false };
const input = (more: Partial<SeesInput> = {}): SeesInput => ({
  sel: ['a'],
  one: null,
  vaults: [],
  web: true,
  added: [],
  guides: null,
  ...more,
});
const names = (i: SeesInput) =>
  chipsOf(i, NO_FLIPS).map(c => (c.kind === 'guide' ? `${c.from}-${c.role}${c.ignored ? '-ignored' : ''}` : c.kind));

assert.deepStrictEqual(names(input()), ['board', 'selection', 'web'], 'an ordinary board has no guide chips');
assert.deepStrictEqual(
  names(input({ guides: { repo: true, board: { rules: none, design: none } } })),
  ['board', 'repo-rules', 'repo-design', 'selection', 'web'],
  'a repo gives its two files, after the board and before the selection',
);
assert.deepStrictEqual(
  names(
    input({
      guides: {
        repo: true,
        board: { rules: { text: 'r', ignoreRepo: true }, design: { text: 'd', ignoreRepo: false } },
      },
    }),
  ),
  ['board', 'repo-rules-ignored', 'board-rules', 'repo-design', 'board-design', 'selection', 'web'],
  'the rules, then the design, each the repo’s file and then the board’s own',
);
assert.deepStrictEqual(
  names(input({ guides: { repo: false, board: { rules: none, design: { text: 'd', ignoreRepo: true } } } })),
  ['board', 'board-design', 'selection', 'web'],
  'with no repo there is no repo file to show, ignored or not',
);
assert.deepStrictEqual(
  capture(input({ guides: { repo: true, board: { rules: { text: 'r', ignoreRepo: true }, design: none } } }), NO_FLIPS),
  capture(input(), NO_FLIPS),
  'a message goes with the same things whatever the guide chips say',
);
console.log('PROTO GUIDE CHIPS (Node) OK');

const { work, repo } = freshRepo('fenmyr-guide-chips-');
const note: Card = { id: 'n0', type: 'note', x: 0, y: 0, w: 220, h: 140, text: 'A note' };
const doc = (id: string, x: number, y: number, more: Partial<CardOf<'doc'>> = {}): CardOf<'doc'> => ({
  id,
  type: 'doc',
  x,
  y,
  w: 240,
  h: 52,
  ...more,
});
const l = await launch({
  boards: [{ id: 'plain', name: 'Plain', cards: [note], links: [], tray: [] }],
  open: 'plain',
  claude: true,
});
const { page } = l;
const { shown } = tipKit(page);

// Three boards, saved as a person's would be: a prototype in a project with a repo, an ordinary board in the same
// project that holds a rules card, and a prototype in a project with no repo.
await page.evaluate(
  async ({ repo, note, rules }) => {
    await window.Fenmyr.saveFolders({
      projects: [
        { id: 'p1', name: 'Acme', open: true, repo: { path: repo } },
        { id: 'p2', name: 'Loose', open: true },
      ],
      folders: [
        { id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true },
        { id: 'pg', name: 'Sketches', project: 'p2', kind: 'prototyping', open: true },
      ],
      order: {},
    });
    const made = await window.Fenmyr.protoCreate({ root: repo, name: 'Checkout', stack: 'react' });
    const base = { links: [], tray: [] };
    await window.Fenmyr.save({
      ...base,
      id: 'pb',
      name: 'Checkout',
      folder: 'pf',
      kind: 'prototype',
      proto: made,
      cards: [note],
    });
    await window.Fenmyr.save({ ...base, id: 'ord', name: 'Ordinary', folder: 'pf', cards: [note, rules] });
    await window.Fenmyr.save({
      ...base,
      id: 'pnr',
      name: 'No repo',
      folder: 'pg',
      kind: 'prototype',
      proto: made,
      cards: [note, { ...rules, id: 'nr', body: 'Square corners.', role: 'design' }],
    });
    await window.__fenmyr.refreshBoards();
  },
  { repo, note, rules: doc('or', 0, 200, { text: 'Rules', body: 'Never use gradients.', role: 'rules' }) },
);
const open = (id: string) => page.evaluate(id => window.__fenmyr.openBoard(id), id);
// The open board changed the way a build's write changes it, in place and then saved: cards added, cards removed by id,
// and the Ignore switch set on or off on cards by id.
type Edit = { add?: CardOf<'doc'>[]; remove?: string[]; ignore?: Record<string, boolean> };
const change = ({ add = [], remove = [], ignore = {} }: Edit) =>
  page.evaluate(
    edit =>
      window.__fenmyr.changeBoard('pb', b => {
        for (const id of edit.remove)
          b.cards.splice(
            b.cards.findIndex(c => c.id === id),
            1,
          );
        b.cards.push(...edit.add);
        for (const c of b.cards)
          if (c.type === 'doc' && c.id in edit.ignore) {
            if (edit.ignore[c.id]) c.ignoreRepo = true;
            else delete c.ignoreRepo;
          }
        return true;
      }),
    { add, remove, ignore },
  );

await open('pb');
await page.waitForFunction(() => window.__fenmyr?.curBoard()?.id === 'pb');
// a prototype's chat is open beside its preview
await page.waitForFunction(() => document.getElementById('mChat')?.checkVisibility({ visibilityProperty: true }));
await still(page);

type Look = {
  label: string;
  tip: string;
  aria: string | null;
  title: string | null;
  out: boolean;
  dashed: boolean;
  tag: string;
  flips: number;
};
const GUIDE = '#mcSees .mcs-chip.guide';
const chips = (): Promise<Look[]> =>
  page.evaluate(
    sel =>
      [...document.querySelectorAll<HTMLElement>(sel)].map(e => ({
        label: e.textContent?.trim() ?? '',
        tip: e.dataset.tip ?? '',
        aria: e.getAttribute('aria-label'),
        title: e.getAttribute('title'),
        out: e.classList.contains('out'),
        dashed: getComputedStyle(e).borderTopStyle === 'dashed',
        tag: e.localName,
        flips: e.querySelectorAll('.mcs-x, [data-flip]').length + (e.hasAttribute('data-flip') ? 1 : 0),
      })),
    GUIDE,
  );
const labels = async () => (await chips()).map(c => c.label);
// the strip says so once it does, with no input but the change
const until = (want: string[]) =>
  page.waitForFunction(
    ([sel, want]) => JSON.stringify([...document.querySelectorAll(sel ?? '')].map(e => e.textContent?.trim())) === want,
    [GUIDE, JSON.stringify(want)],
  );

const REPO_RULES = 'prototypes/myra.md goes with every build of this prototype';
const REPO_DESIGN = 'prototypes/design.md goes with every build of this prototype';
const BOARD_RULES = 'This board’s rules go with every build, and win where they differ from the repo’s';
const BOARD_DESIGN = 'This board’s design goes with every build, and wins where it differs from the repo’s';

await check('a prototype with a repo and no rules or design cards shows the two repo files', async () => {
  await until(['Repo rules', 'Repo design']);
  const now = await chips();
  assert.deepStrictEqual(
    now.map(c => c.tip),
    [REPO_RULES, REPO_DESIGN],
  );
  assert.deepStrictEqual(
    now.map(c => c.aria),
    [REPO_RULES, REPO_DESIGN],
    'each is named as its tooltip says',
  );
  assert(
    now.every(c => c.title === null && !c.out && c.flips === 0 && c.tag === 'span'),
    'no title, none left out, no × or +, and none a button',
  );
});

await check('a rules card with words adds Board rules between the two, and a design card Board design', async () => {
  await change({ add: [doc('rl', 0, 200, { text: 'Rules', body: 'Use British English.', role: 'rules' })] });
  await until(['Repo rules', 'Board rules', 'Repo design']);
  const rules = (await chips())[1];
  assert.strictEqual(rules?.tip, BOARD_RULES);
  assert.strictEqual(rules?.tag, 'button', 'the board’s own is pressed to open its card');
  assert(rules?.aria?.startsWith(BOARD_RULES), 'and named by what it says');
  assert(/open/i.test(rules?.aria ?? ''), `and by what pressing it does: ${rules?.aria}`);
  assert.strictEqual(rules?.flips, 0, 'with no × or +');
  const design = doc('dg', 300, 200, { text: 'Design', body: 'Square corners.', role: 'design' });
  await change({ add: [design] });
  await until(['Repo rules', 'Board rules', 'Repo design', 'Board design']);
  assert.strictEqual((await chips())[3]?.tip, BOARD_DESIGN);
  // a card with no words is not a document the board has
  await change({ remove: ['dg'], add: [{ ...design, body: '  ' }] });
  await until(['Repo rules', 'Board rules', 'Repo design']);
  await change({ remove: ['dg'] });
});

await check(
  'Ignore turns the repo’s rules to “Repo rules · ignored”, dashed, and leaves the design alone',
  async () => {
    await change({ ignore: { rl: true } });
    await until(['Repo rules · ignored', 'Board rules', 'Repo design']);
    const [rules, , design] = await chips();
    assert(rules?.out && rules.dashed, 'it takes the look of a chip that is left out: dashed');
    assert.strictEqual(rules.tip, 'prototypes/myra.md is ignored: this board’s rules replace it');
    assert.strictEqual(rules.aria, rules.tip);
    assert.strictEqual(rules.flips, 0, 'and offers no + to put it back');
    assert(!design?.out && !design?.dashed, 'Repo design is not');
    await change({ ignore: { rl: false } });
    await until(['Repo rules', 'Board rules', 'Repo design']);
  },
);

await check('pressing Board rules opens that card', async () => {
  await page.click(`${GUIDE}[data-open-guide="rules"]`);
  await page.waitForFunction(() => document.getElementById('docview')?.classList.contains('on'));
  assert.strictEqual(await page.inputValue('#dvTitle'), 'Rules', 'the rules card is open');
});

await check('typing in the open card, and closing it, follow into the strip', async () => {
  const body = page.locator('#dvBody .ProseMirror');
  await body.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await until(['Repo rules', 'Repo design']);
  await page.keyboard.type('Keep it short.');
  await until(['Repo rules', 'Board rules', 'Repo design']);
  await page.click('#dvClose');
  await page.waitForFunction(() => !document.getElementById('docview')?.classList.contains('on'));
  await still(page);
  assert.deepStrictEqual(await labels(), ['Repo rules', 'Board rules', 'Repo design'], 'closed, the same');
  const typed = await page.evaluate(() => {
    const b = window.__fenmyr.curBoard();
    const rules = b?.cards.find(c => c.id === 'rl');
    return rules?.type === 'doc' ? rules.body : undefined;
  });
  assert.strictEqual(typed, 'Keep it short.', 'it is what the card holds');
});

await check('deleting the card takes Board rules away', async () => {
  await change({ remove: ['rl'] });
  await until(['Repo rules', 'Repo design']);
});

await check('every chip’s tooltip is whole and reached from the keyboard', async () => {
  await change({
    add: [
      doc('rl', 0, 200, { text: 'Rules', body: 'Use British English.', role: 'rules', ignoreRepo: true }),
      doc('dg', 300, 200, { text: 'Design', body: 'Square corners.', role: 'design' }),
    ],
  });
  await until(['Repo rules · ignored', 'Board rules', 'Repo design', 'Board design']);
  const want = [
    ['repo-rules', 'prototypes/myra.md is ignored: this board’s rules replace it'],
    ['board-rules', BOARD_RULES],
    ['repo-design', REPO_DESIGN],
    ['board-design', BOARD_DESIGN],
  ] as const;
  // The chips sit near the window's right edge, where a tooltip centred on its chip would leave the window, so it is kept
  // inside it instead: whole, 8 px below its chip, in the chat's colours, after the shared delay.
  async function whole(what: string, key: string, text: string, focus: boolean) {
    const tip = await shown(`${GUIDE}[data-guide="${key}"]`, 'chat', focus);
    const gap = Math.round(tip.tip.y - (tip.host.y + tip.host.height));
    assert.strictEqual(tip.opacity, 1, `${what}: it shows`);
    assert.strictEqual(tip.text, text, `${what}: it says so`);
    assert(tip.paintsLike.bg && tip.paintsLike.ink, `${what}: the chat's colours`);
    assert.strictEqual(tip.delay, '0.25s', `${what}: the shared delay`);
    assert.strictEqual(gap, 8, `${what}: 8 px below its chip, not ${gap}`);
    assert.deepStrictEqual(tip.clippedBy, [], `${what}: cut by ${tip.clippedBy.join(', ')}`);
    assert(
      tip.tip.x >= 0 && tip.tip.x + tip.tip.width <= tip.window.width,
      `${what}: inside the ${tip.window.width} px window, at ${JSON.stringify(tip.tip)}`,
    );
  }
  for (const [key, text] of want) await whole(`the ${key} tooltip from the keyboard`, key, text, true);
  await whole('the pointer shows one too', 'board-design', BOARD_DESIGN, false);
  const shot = process.env.TIPS_SHOTS;
  if (shot) {
    fs.mkdirSync(shot, { recursive: true });
    await whole('for the picture', 'repo-rules', want[0][1], true);
    await page.screenshot({ path: `${shot}/guide-repo-rules-ignored.png` });
  }
  // in the narrowest chat the strip wraps, and a tooltip is still whole
  await page.evaluate(() => document.getElementById('myra')?.style.setProperty('--chat-w', '320px'));
  await still(page);
  for (const [key, text] of want) await whole(`${key} in a 320 px chat`, key, text, true);
  await page.evaluate(() => document.getElementById('myra')?.style.removeProperty('--chat-w'));
});

await check('an ordinary board in the same project shows none of the four', async () => {
  await open('ord');
  await page.waitForFunction(() => window.__fenmyr?.curBoard()?.id === 'ord');
  await still(page);
  assert.deepStrictEqual(await labels(), [], 'even with a rules card on it');
  assert.strictEqual(await page.locator('#mcSees .mcs-chip.board').count(), 1, 'the board chip is there');
});

await check('a prototype with no repo shows only what the board says', async () => {
  await open('pnr');
  await page.waitForFunction(() => window.__fenmyr?.curBoard()?.id === 'pnr');
  await until(['Board design']);
});

fs.rmSync(work, { recursive: true, force: true });
assert.deepStrictEqual(l.errors, [], 'no page errors');
await l.close();
console.log('PROTO GUIDE CHIPS OK');
