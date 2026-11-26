// The Board chip's tooltip counts what a build from a prototype would take, and a prototype's own rules and design cards
// are not cards in that: their words count as the board's rules and design, whatever is selected, and a card that says
// Ignore leaves out the repo's file for its document, as a build does. In the real app, with no model chosen, so the
// window is 200,000 tokens. The newest build was sent design.md at 6,000 tokens and myra.md at 4,000.
import assert from 'node:assert';
import fs from 'node:fs';
import type { ChatAction } from '../src/shared/chat.ts';
import type { Card, CardOf } from '../src/shared/model.ts';
import { launch } from './support/launch.ts';
import { check } from './support/modelKit.ts';
import { freshRepo } from './support/prototype.ts';
import { still } from './support/settled.ts';

const { work, repo } = freshRepo('fenmyr-guide-build-');
const note = (i: number): Card => ({ id: `n${i}`, type: 'note', x: i * 260, y: 0, w: 220, h: 140, text: `Note ${i}` });
// `chars` of words: 2.5 characters are a token
const doc = (
  id: string,
  role: 'rules' | 'design',
  chars: number,
  more: Partial<CardOf<'doc'>> = {},
): CardOf<'doc'> => ({
  id,
  type: 'doc',
  x: id === 'rl' ? 0 : 300,
  y: 200,
  w: 240,
  h: 52,
  text: id,
  body: 'r'.repeat(chars),
  role,
  ...more,
});
const build: ChatAction = {
  kind: 'build',
  board: 'pb',
  build: 'b1',
  request: 'Make it.',
  cards: 3,
  start: {
    at: Date.UTC(2026, 10, 2, 9, 30),
    snapshot: 'a'.repeat(40),
    use: {
      window: 200_000,
      parts: [
        { kind: 'design', tokens: 6_000 },
        { kind: 'myra', tokens: 4_000 },
      ],
      left: [],
      pictures: [],
      shortened: [],
      unseen: [],
      tooBig: [],
    },
  },
};

const l = await launch({
  boards: [{ id: 'plain', name: 'Plain', cards: [note(0)], links: [], tray: [] }],
  open: 'plain',
  claude: true,
});
const { page } = l;

await page.evaluate(
  async ({ repo, cards, chat }) => {
    await window.Fenmyr.saveFolders({
      projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
      folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
      order: {},
    });
    const proto = await window.Fenmyr.protoCreate({ root: repo, name: 'Checkout', stack: 'react' });
    await window.Fenmyr.save({
      id: 'pb',
      name: 'Checkout',
      folder: 'pf',
      kind: 'prototype',
      proto,
      cards,
      links: [],
      tray: [],
      chat,
    });
    await window.__fenmyr.refreshBoards();
    await window.__fenmyr.openBoard('pb');
  },
  {
    repo,
    // 50,000 characters are 20,000 tokens, 10% of the window
    cards: [note(0), note(1), note(2), doc('rl', 'rules', 50_000)],
    chat: [{ who: 'myra', text: '', t: 1, acts: [build] }],
  },
);
await page.waitForFunction(() => window.__fenmyr?.curBoard()?.id === 'pb');
// a prototype's chat is open beside its preview
await page.waitForFunction(() => document.getElementById('mChat')?.checkVisibility({ visibilityProperty: true }));
await still(page);

// the build's share of the window in whole percent, once the tip has been worked out for the board as it is now
const idle = () => page.evaluate(() => new Promise<void>(done => requestIdleCallback(() => done())));
const tipOf = () =>
  page.evaluate(() => document.querySelector<HTMLElement>('#mcSees .mcs-chip.board')?.dataset.tip ?? '');
async function share() {
  await idle();
  const tip = await tipOf();
  const m = /A build from these cards: (?:under 1|about ([\d,]+))% of the context/.exec(tip);
  assert(m, `the tip gives a build's share: ${tip}`);
  return Number((m[1] ?? '0').replace(/,/g, ''));
}
const pick = (ids: string[]) =>
  page.evaluate(ids => {
    window.__fenmyr.selectOnly(ids);
    window.__fenmyr.applyToolbar();
  }, ids);
const change = (edit: { add?: CardOf<'doc'>[]; ignore?: string[]; words?: Record<string, number> }) =>
  page.evaluate(
    ({ add = [], ignore = [], words = {} }) =>
      window.__fenmyr.changeBoard('pb', b => {
        b.cards.push(...add);
        for (const c of b.cards)
          if (c.type === 'doc') {
            if (ignore.includes(c.id)) c.ignoreRepo = true;
            const chars = words[c.id];
            if (chars !== undefined) c.body = 'r'.repeat(chars);
          }
        return true;
      }),
    edit,
  );
// the strip has drawn n chips that say the repo's file is ignored, whether or not the board's own words replace it
const ignored = (n: number) =>
  page.waitForFunction(
    n => document.querySelectorAll('#mcSees .mcs-chip.guide[data-tip*="is ignored"]').length === n,
    n,
  );

await check('the rules card counts as its words and not as a card, whatever is selected', async () => {
  await page.waitForFunction(() =>
    document.querySelector('#mcSees .mcs-chip.board')?.getAttribute('data-tip')?.includes('A build from'),
  );
  // nothing selected: the three notes, 3% design.md and 2% myra.md from the newest build, and 10% for the rules' words,
  // which would be 20% if the card were counted as a card as well
  assert.strictEqual(await share(), 15);
  await pick(['n0', 'n1', 'n2']);
  assert.strictEqual(await share(), 15, 'the rules go with the three notes a build is of, selected or not');
});

await check('a card that ignores the repo’s file takes it out of the count, and only its own', async () => {
  await change({ ignore: ['rl'] });
  await ignored(1);
  assert.strictEqual(await share(), 13, 'Ignore leaves out myra.md’s 2%');
  // a design card of 10,000 tokens that ignores design.md: its words in, design.md's 3% out, myra.md still out
  await change({ add: [doc('dg', 'design', 25_000, { ignoreRepo: true })] });
  await ignored(2);
  assert.strictEqual(await share(), 15);
});

await check('a card’s words changing changes the estimate with no other input', async () => {
  // the rules' words 50,000 characters longer: 20,000 tokens, 10% more
  await change({ words: { rl: 75_000 } });
  assert.strictEqual(await share(), 20);
});

fs.rmSync(work, { recursive: true, force: true });
assert.deepStrictEqual(l.errors, [], 'no page errors');
await l.close();
console.log('SEES GUIDE BUILD OK');
