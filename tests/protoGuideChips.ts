// The "Myra sees" strip on a prototype board has one chip for each of the rules and the design, saying where its text
// comes from. In the app: a prototype whose project has a repo shows "Repo rules" and "Repo design"; a card with words
// makes the chip "Repo + board ..." and a button that opens the card; Ignore on a card with words makes it "Board ...",
// and on one with none makes it "Repo ... · ignored", dashed like a chip that is left out and not a button; typing in
// the card, deleting it and closing it follow into the strip with no other input; a prototype with no repo shows
// "Board ..." for a document the board has words for and nothing for one it has not, Ignore or not; an ordinary board in
// the same project shows none. Each chip says what it is in a tooltip that is whole and reached from the keyboard, and
// is named by its aria-label, never a title, and the strip stays two rows at the narrowest chat, so + Add is in view.
// protoGuideCases.ts checks which chips a board gets, in Node.
import assert from 'node:assert';
import fs from 'node:fs';
import type { Card, CardOf } from '../src/shared/model.ts';
import { BOARD_ONLY, ROLES, ROWS, type Role, type Row } from './support/guideRows.ts';
import { launch } from './support/launch.ts';
import { check } from './support/modelKit.ts';
import { freshRepo } from './support/prototype.ts';
import { still } from './support/settled.ts';
import { tipKit } from './support/tipSeen.ts';

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
// project that holds a rules card, and a prototype in a project with no repo, whose design card says Ignore and whose
// rules card has no words and says Ignore.
await page.evaluate(
  async ({ repo, note, rules, noRepo }) => {
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
      cards: [note, ...noRepo],
    });
    await window.__fenmyr.refreshBoards();
  },
  {
    repo,
    note,
    rules: doc('or', 0, 200, { text: 'Rules', body: 'Never use gradients.', role: 'rules' }),
    noRepo: [
      doc('nd', 300, 200, { text: 'Design', body: 'Square corners.', role: 'design', ignoreRepo: true }),
      doc('nr', 0, 200, { text: 'Rules', role: 'rules', ignoreRepo: true }),
    ],
  },
);
const open = (id: string) => page.evaluate(id => window.__fenmyr.openBoard(id), id);
// A board changed the way a build's write changes it, in place and then saved: cards removed by id, then cards added.
type Edit = { add?: CardOf<'doc'>[]; remove?: string[] };
const change = ({ add = [], remove = [] }: Edit, board = 'pb') =>
  page.evaluate(
    ({ add, remove, board }) =>
      window.__fenmyr.changeBoard(board, b => {
        for (const id of remove)
          b.cards.splice(
            b.cards.findIndex(c => c.id === id),
            1,
          );
        b.cards.push(...add);
        return true;
      }),
    { add, remove, board },
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

const card = (role: Role, more: Partial<CardOf<'doc'>>) =>
  doc(`g-${role}`, role === 'rules' ? 0 : 300, 200, { text: role === 'rules' ? 'Rules' : 'Design', role, ...more });
// The strip with this document's card as the row says, and the other document with no card at all.
async function show(role: Role, row: Row) {
  const had = await page.evaluate(() => window.__fenmyr.curBoard()?.cards.map(c => c.id) ?? []);
  await change({
    remove: ROLES.map(r => `g-${r}`).filter(id => had.includes(id)),
    add: row.card ? [card(role, row.card)] : [],
  });
  await until(ROLES.map(r => (r === role ? row.label : ROWS[r].repo.label)));
}

await check('a prototype with a repo and no rules or design cards shows Repo rules and Repo design', async () => {
  await until(['Repo rules', 'Repo design']);
  const now = await chips();
  assert.deepStrictEqual(
    now.map(c => c.tip),
    [ROWS.rules.repo.tip, ROWS.design.repo.tip],
  );
  assert.deepStrictEqual(
    now.map(c => c.aria),
    now.map(c => c.tip),
    'each is named as its tooltip says',
  );
  assert(
    now.every(c => c.title === null && !c.out && c.flips === 0 && c.tag === 'span'),
    'no title, none left out, no × or +, and none a button',
  );
});

for (const role of ROLES)
  for (const row of Object.values(ROWS[role]))
    await check(`the ${role} chip for ${row.what} says “${row.label}”`, async () => {
      await show(role, row);
      const at = role === 'rules' ? 0 : 1;
      const chip = (await chips())[at];
      assert.strictEqual(chip?.label, row.label);
      assert.strictEqual(chip?.tip, row.tip);
      assert.strictEqual(
        chip?.tag,
        row.press ? 'button' : 'span',
        row.press ? 'pressed to open its card' : 'information',
      );
      if (row.press) {
        assert(chip?.aria?.startsWith(row.tip), 'named by what it says');
        assert(chip?.aria?.endsWith(`Press to open the ${role} card`), `and by what pressing it does: ${chip?.aria}`);
      } else assert.strictEqual(chip?.aria, row.tip, 'named by what it says');
      assert.strictEqual(chip?.title, null, 'no title');
      assert.strictEqual(chip?.flips, 0, 'no × or +');
      assert.strictEqual(
        chip?.out,
        row.dashed,
        'left out only when the repo’s file is ignored and nothing replaces it',
      );
      assert.strictEqual(chip?.dashed, row.dashed, row.dashed ? 'dashed, like a chip that is left out' : 'solid');
      const other = (await chips())[1 - at];
      assert(!other?.out && !other?.dashed, 'the other document’s chip is not affected');
    });

await check(
  'with the board’s words and no Ignore, the chip is one chip and not a repo chip and a board chip',
  async () => {
    await show('rules', ROWS.rules.both);
    await change({ add: [card('design', { body: 'Square corners.' })] });
    await until(['Repo + board rules', 'Repo + board design']);
    // a card with no words is not a document the board has
    await change({ remove: ['g-design'], add: [card('design', { body: '  ' })] });
    await until(['Repo + board rules', 'Repo design']);
    await change({ remove: ['g-design'] });
  },
);

await check('the strip stays two rows in the narrowest chat, so + Add is in view', async () => {
  await show('rules', ROWS.rules.both);
  await change({ add: [card('design', { body: 'Square corners.' })] });
  await until(['Repo + board rules', 'Repo + board design']);
  await page.evaluate(() => document.getElementById('myra')?.style.setProperty('--chat-w', '320px'));
  await still(page);
  const strip = await page.evaluate(() => {
    const sees = document.getElementById('mcSees');
    const add = sees?.querySelector<HTMLElement>('.mcs-add')?.getBoundingClientRect();
    const box = sees?.getBoundingClientRect();
    return {
      scrolls: (sees?.scrollHeight ?? 0) > (sees?.clientHeight ?? 0),
      add:
        add && box
          ? { top: add.top >= box.top, bottom: add.bottom <= box.bottom, right: add.right <= box.right }
          : null,
    };
  });
  await page.evaluate(() => document.getElementById('myra')?.style.removeProperty('--chat-w'));
  assert.strictEqual(strip.scrolls, false, 'it has nothing to scroll to');
  assert.deepStrictEqual(strip.add, { top: true, bottom: true, right: true }, '+ Add is whole inside it');
});

await check('pressing a chip with the board’s words opens that card', async () => {
  await show('rules', ROWS.rules.both);
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
  assert.strictEqual((await chips())[0]?.tag, 'span', 'with no words it is information again');
  await page.keyboard.type('Keep it short.');
  await until(['Repo + board rules', 'Repo design']);
  await page.click('#dvClose');
  await page.waitForFunction(() => !document.getElementById('docview')?.classList.contains('on'));
  await still(page);
  assert.deepStrictEqual(await labels(), ['Repo + board rules', 'Repo design'], 'closed, the same');
  const typed = await page.evaluate(() => {
    const b = window.__fenmyr.curBoard();
    const rules = b?.cards.find(c => c.id === 'g-rules');
    return rules?.type === 'doc' ? rules.body : undefined;
  });
  assert.strictEqual(typed, 'Keep it short.', 'it is what the card holds');
});

await check('deleting the card takes the board’s words out of the chip', async () => {
  await change({ remove: ['g-rules'] });
  await until(['Repo rules', 'Repo design']);
});

await check('every chip’s tooltip is whole and reached from the keyboard', async () => {
  // The chips sit near the window's right edge, where a tooltip centred on its chip would leave the window, so it is kept
  // inside it instead: whole, 8 px below its chip, in the chat's colours, after the shared delay.
  async function whole(what: string, key: Role, text: string, focus: boolean) {
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
  // every case for each document, in the narrowest chat, where the strip wraps and the longest sentence is longest
  await page.evaluate(() => document.getElementById('myra')?.style.setProperty('--chat-w', '320px'));
  await still(page);
  for (const role of ROLES)
    for (const row of Object.values(ROWS[role])) {
      await show(role, row);
      await whole(`${row.label}`, role, row.tip, true);
    }
  await show('rules', ROWS.rules.ignored);
  await change({ add: [card('design', { body: 'Square corners.' })] });
  await until(['Repo rules · ignored', 'Repo + board design']);
  await whole('the pointer shows one too', 'design', ROWS.design.both.tip, false);
  const shot = process.env.TIPS_SHOTS;
  if (shot) {
    fs.mkdirSync(shot, { recursive: true });
    await whole('for the picture', 'rules', ROWS.rules.ignored.tip, true);
    await page.screenshot({ path: `${shot}/guide-repo-rules-ignored.png` });
  }
  await page.evaluate(() => document.getElementById('myra')?.style.removeProperty('--chat-w'));
});

await check('an ordinary board in the same project shows none of it', async () => {
  await open('ord');
  await page.waitForFunction(() => window.__fenmyr?.curBoard()?.id === 'ord');
  await still(page);
  assert.deepStrictEqual(await labels(), [], 'even with a rules card on it');
  assert.strictEqual(await page.locator('#mcSees .mcs-chip.board').count(), 1, 'the board chip is there');
});

await check('a prototype with no repo shows only what the board says, and no repo file to ignore', async () => {
  await open('pnr');
  await page.waitForFunction(() => window.__fenmyr?.curBoard()?.id === 'pnr');
  // the design card says Ignore and has words, and the rules card says Ignore and has none, and neither has a repo file
  await until(['Board design']);
  const [design] = await chips();
  assert.strictEqual(design?.tip, BOARD_ONLY.design, 'the board’s words alone, not “the repo’s file is ignored”');
  assert.strictEqual(design?.tag, 'button', 'pressed to open its card');
  assert(!design?.out && !design?.dashed, 'and not left out');
  assert.strictEqual(design?.aria, `${BOARD_ONLY.design}. Press to open the design card`);
  // words in the rules card give it a chip of its own, with or without Ignore
  await change({ remove: ['nr'], add: [card('rules', { body: 'Use British English.' })] }, 'pnr');
  await until(['Board rules', 'Board design']);
  const [rules] = await chips();
  assert.strictEqual(rules?.tip, BOARD_ONLY.rules);
  assert.strictEqual(rules?.tag, 'button');
  assert(!rules?.out && !rules?.dashed);
  await change({ remove: ['g-rules'] }, 'pnr');
  await until(['Board design']);
});

fs.rmSync(work, { recursive: true, force: true });
assert.deepStrictEqual(l.errors, [], 'no page errors');
await l.close();
console.log('PROTO GUIDE CHIPS OK');
