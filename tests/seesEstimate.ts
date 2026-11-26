// The "Board" chip in the "Myra sees" strip says, before a message is sent, how much of the model's context it would take
// and whether the board would be trimmed, so the person can narrow it first. In the real app, with no model chosen, so
// the window is 200,000 tokens. A board that fits says its share in the chip's tooltip, and the tooltip is whole; the
// text and files added to the message add what they weigh to it, to the token. A board too big to go whole turns the chip
// to "Board · trimmed" and the tooltip counts the cards that would be shortened and left out, the same cards a send then
// shortens and leaves out (the stand-in Claude Code keeps the board it was given). Selecting cards changes the estimate,
// and so does a model with a bigger window. A prototype adds what a build from the cards would take, from the pictures,
// the cards, and design.md and myra.md as its newest build was sent them, and says when a build would leave some out.
// With the chat closed nothing is worked out.
import assert from 'node:assert';
import fs from 'node:fs';
import type { ChatAction } from '../src/shared/chat.ts';
import type { Card } from '../src/shared/model.ts';
import { launch } from './support/launch.ts';
import { check, modelKit } from './support/modelKit.ts';
import { pasteIntoChat } from './support/paste.ts';
import { freshRepo } from './support/prototype.ts';
import { still } from './support/settled.ts';
import { tipKit } from './support/tipSeen.ts';

// `words` long, whatever the note number
const note = (i: number, words: number): Card => ({
  id: `n${i}`,
  type: 'note',
  x: (i % 10) * 260,
  y: Math.floor(i / 10) * 180,
  w: 220,
  h: 140,
  text: `Note ${i}: `.padEnd(words, 'abcdefghij'),
});
const board = (id: string, cards: Card[]) => ({ id, name: id, cards, links: [], tray: [] });

const LONG = 1_500;
const small = [note(0, 80), note(1, 80), note(2, 80)];
// 600 notes at the 300-character cut, every sixtieth 1,500 long: too big to go whole even shortened, as in chatFit
const huge = Array.from({ length: 600 }, (_, i) => note(i, i % 60 === 7 ? LONG : 300));
const longOnes = huge.filter((_, i) => i % 60 === 7).map(c => c.id);

// A prototype of 22 pictures, 3 notes and the design the builder was sent before: a build reads 20 pictures at 4,784
// tokens, so it takes more than the quarter of the window a build may fill
const { work, repo } = freshRepo('fenmyr-estimate-');
const proto = [
  ...Array.from(
    { length: 22 },
    (_, i): Card => ({ id: `im${i}`, type: 'image', x: i * 40, y: 400, w: 120, h: 90, src: 'stamps/myra-happy.png' }),
  ),
  note(0, 80),
  note(1, 80),
  note(2, 80),
];
const T = Date.UTC(2026, 10, 2, 9, 30);
const before: ChatAction = {
  kind: 'build',
  board: 'pb',
  build: 'b1',
  request: 'Make it.',
  cards: 3,
  start: {
    at: T,
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

const l = await launch({ boards: [board('small', small), board('huge', huge)], open: 'small', claude: true });
const { page } = l;
const { pickModel, ask, sentAbout } = modelKit(l);
const { seen, shown } = tipKit(page);

const BASE = 'The board always goes with your message';
const CHIP = '#mcSees .mcs-chip.board';
type Chip = {
  tip: string;
  label: string;
  aria: string | null;
  trimmed: boolean;
  title: string | null;
  role: string | null;
};
const chip = (): Promise<Chip> =>
  page.evaluate(sel => {
    const el = document.querySelector<HTMLElement>(sel);
    return {
      tip: el?.dataset.tip ?? '',
      label: el?.textContent ?? '',
      aria: el?.getAttribute('aria-label') ?? null,
      trimmed: !!el?.classList.contains('trimmed'),
      title: el?.getAttribute('title') ?? null,
      role: el?.getAttribute('role') ?? null,
    };
  }, CHIP);
// the estimate is worked out when the page is idle: it is in once the tip says so, and is a new one once it differs
// from `was`
const estimated = async (was = '') => {
  await page.waitForFunction(
    ([sel, was]) => {
      const tip = document.querySelector<HTMLElement>(sel ?? '')?.dataset.tip ?? '';
      return tip.includes('Your next message:') && tip !== was;
    },
    [CHIP, was],
  );
  return chip();
};
// the share of the context the tip gives the next message, in whole percent
function share(tip: string): number {
  const m = /Your next message: (?:under 1|about ([\d,]+))% of the context/.exec(tip);
  assert(m, `the tip gives a share: ${tip}`);
  return Number((m[1] ?? '0').replace(/,/g, ''));
}
const lines = (tip: string) => tip.split('\n');
const idleAsks = () => page.evaluate(() => Number(Reflect.get(window, 'idleAsks')));
const idle = () => page.evaluate(() => new Promise<void>(done => requestIdleCallback(() => done())));
const open = (id: string) => page.evaluate(id => window.__fenmyr.openBoard(id), id);
const openChat = async () => {
  await page.click('#mPill');
  await page.waitForFunction(() => document.getElementById('mChat')?.checkVisibility({ visibilityProperty: true }));
  await still(page);
};
const addFiles = (files: { name: string; type: string; text: string }[]) =>
  page.evaluate(files => {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(new File([f.text], f.name, { type: f.type }));
    document
      .getElementById('mcInput')
      ?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  }, files);
// selectOnly doesn't draw the strip, which a click does: applyToolbar draws it again
const pick = (ids: string[]) =>
  page.evaluate(ids => {
    window.__fenmyr.selectOnly(ids);
    window.__fenmyr.applyToolbar();
  }, ids);
const resize = async (w: number, h: number) => {
  await l.app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]?.setSize(s.w, s.h), { w, h });
  await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [w, h]);
  await still(page);
};
const chips = () => page.locator('#mcSees [data-chip="added"]').count();

// each ask for an idle callback is counted, so a check can say none was made
await page.evaluate(() => {
  const real = window.requestIdleCallback.bind(window);
  Reflect.set(window, 'idleAsks', 0);
  window.requestIdleCallback = (cb, options) => {
    Reflect.set(window, 'idleAsks', Number(Reflect.get(window, 'idleAsks')) + 1);
    return real(cb, options);
  };
});

await check('with the chat closed nothing is worked out, and the chip says only what it always did', async () => {
  const asks = await idleAsks();
  // the strip is drawn again, as it is when the toolbar changes, with the chat closed and a card selected
  await pick(['n0']);
  assert.strictEqual(await idleAsks(), asks, 'no idle callback was asked for');
  await idle();
  const now = await chip();
  assert.strictEqual(now.tip, BASE, 'the tooltip is the base sentence');
  assert.strictEqual(now.trimmed, false);
  await pick([]);
});

await openChat();
let small0 = '';
await check('a board that fits gives its share, and the chip is as it was, with a tooltip', async () => {
  const now = await estimated();
  small0 = now.tip;
  assert.deepStrictEqual(lines(now.tip).slice(0, 1), [BASE], 'the base sentence comes first');
  assert.strictEqual(lines(now.tip).length, 2, 'then one line, since nothing is trimmed and it is not a prototype');
  assert.match(lines(now.tip)[1] ?? '', /^Your next message: (under 1|about \d+)% of the context$/);
  assert.strictEqual(now.label, 'Board', 'the chip reads Board');
  assert.strictEqual(now.trimmed, false, 'and is not marked trimmed');
  assert.strictEqual(now.aria, now.tip, 'a screen reader hears the same');
  assert.strictEqual(now.role, 'group', 'on a control that has a name to hear');
  assert.strictEqual(now.title, null, 'with no title that would show a second tooltip');
  await seen('the board chip’s tooltip', CHIP, {
    at: 'below',
    surface: 'chat',
    delay: '0.25s',
    shot: 'board-chip-small',
  });
  await seen('and the keyboard’s focus shows it', CHIP, { at: 'below', surface: 'chat', delay: '0.25s', focus: true });
});

await check('what is added to the message adds what it weighs, to the token', async () => {
  const s0 = share(small0);
  // 50,000 characters of pasted text are 20,000 tokens, a tenth of 200,000
  assert(await pasteIntoChat(page, 'p'.repeat(50_000)), 'the long paste became a chip');
  await page.waitForFunction(n => document.querySelectorAll('#mcSees [data-chip="added"]').length === n, 1);
  const withPaste = await estimated(small0);
  assert.strictEqual(share(withPaste.tip), s0 + 10, 'a paste of 50,000 characters takes 10% more');
  // 25,000 bytes of text are 10,000 tokens
  await addFiles([{ name: 'notes.txt', type: 'text/plain', text: 'a'.repeat(25_000) }]);
  await page.waitForFunction(n => document.querySelectorAll('#mcSees [data-chip="added"]').length === n, 2);
  const withFile = await estimated(withPaste.tip);
  assert.strictEqual(share(withFile.tip), s0 + 15, 'and a text file of 25,000 bytes 5% more');
  // a picture is counted at its worst, 4,784 tokens, whatever its bytes
  await addFiles([
    { name: 'a.png', type: 'image/png', text: 'x' },
    { name: 'b.png', type: 'image/png', text: 'x' },
  ]);
  await page.waitForFunction(n => document.querySelectorAll('#mcSees [data-chip="added"]').length === n, 4);
  const withPictures = await estimated(withFile.tip);
  assert([4, 5].includes(share(withPictures.tip) - share(withFile.tip)), `two pictures take 4.8%: ${withPictures.tip}`);
  assert.strictEqual(withPictures.trimmed, false, 'and the board is not trimmed for it');
  // taking them out takes their weight out
  while (await chips()) {
    await page.locator('#mcSees [data-chip="added"] .mcs-x').first().click();
    await still(page);
  }
  await page.waitForFunction(
    ([sel, want]) => document.querySelector<HTMLElement>(sel ?? '')?.dataset.tip === want,
    [CHIP, small0],
  );
});

let huge0: Chip;
await check('a board too big to go whole says so on the chip, and counts what would give', async () => {
  await open('huge');
  huge0 = await estimated(small0);
  assert.strictEqual(huge0.trimmed, true, 'the chip is marked trimmed');
  assert.strictEqual(huge0.label, 'Board · trimmed', 'and says so');
  assert.strictEqual(huge0.aria, huge0.tip);
  assert.strictEqual(lines(huge0.tip)[0], BASE);
  assert.match(lines(huge0.tip)[1] ?? '', /^Your next message: about \d+% of the context$/);
  assert.match(
    lines(huge0.tip)[2] ?? '',
    /^Too big to send whole: [\d,]+ cards would be shortened and [\d,]+ left out$/,
    'the cards that would give, as numbers',
  );
  assert.strictEqual(lines(huge0.tip).length, 3);
  await seen('the trimmed chip’s tooltip', CHIP, {
    at: 'below',
    surface: 'chat',
    delay: '0.25s',
    shot: 'board-chip-trimmed',
  });
});

let selectedTip = '';
await check('selecting cards changes the estimate, and a send does what it said', async () => {
  // a selected note keeps its words whole, so three of the long ones take more room and fewer are shortened
  await pick(longOnes.slice(0, 3));
  const picked = await estimated(huge0.tip);
  selectedTip = picked.tip;
  assert.notStrictEqual(picked.tip, huge0.tip, 'the tip is a new one');
  assert.strictEqual(picked.trimmed, true);
  const said = /(\d[\d,]*) cards? would be shortened and (\d[\d,]*) left out/.exec(picked.tip);
  assert(said, `both halves are there: ${picked.tip}`);
  const [shortened, left] = [Number(said[1]?.replace(/,/g, '')), Number(said[2]?.replace(/,/g, ''))];
  await ask('which trims');
  const prompt = (await sentAbout('which trims')).prompt;
  const sent = prompt.split('\n').find(s => s.startsWith('{"today"'));
  assert(sent, 'the prompt holds the board');
  const cutToFit: unknown = JSON.parse(sent).cutToFit;
  assert.deepStrictEqual(cutToFit, { left, shortened }, 'the send shortens and leaves out the cards the chip counted');
});

await check('a model with a bigger window takes the trim away, and Default puts it back', async () => {
  await pick([]);
  const was = await estimated(selectedTip);
  assert.strictEqual(was.trimmed, true);
  await pickModel('Opus 5.5');
  await page.waitForFunction(sel => !document.querySelector(sel ?? '')?.classList.contains('trimmed'), CHIP);
  const roomy = await estimated();
  assert.strictEqual(roomy.label, 'Board', 'a million tokens hold the board');
  assert(!roomy.tip.includes('Too big'), 'with no line about it');
  assert(share(roomy.tip) < share(was.tip), 'and its share of the window is smaller');
  await pickModel('Default');
  await page.waitForFunction(sel => document.querySelector(sel ?? '')?.classList.contains('trimmed'), CHIP);
  assert.strictEqual((await chip()).label, 'Board · trimmed');
});

await check('its widest tooltip is whole in the narrowest chat and, kept inside the window, on a phone', async () => {
  const wide = await chip();
  assert.strictEqual(lines(wide.tip).length, 3, 'three lines, one of them longer than the chat is wide');
  await page.evaluate(() => document.getElementById('myra')?.style.setProperty('--chat-w', '320px'));
  await still(page);
  await seen('the tooltip in a 320 px chat', CHIP, { at: 'below', surface: 'chat', delay: '0.25s' });
  await page.evaluate(() => document.getElementById('myra')?.style.removeProperty('--chat-w'));
  await resize(390, 844);
  if (!(await page.evaluate(() => !!document.getElementById('myra')?.classList.contains('chat')))) {
    await page.click((await page.isVisible('#mPill')) ? '#mPill' : '[data-hub="myra"]');
    await page.waitForFunction(() => !!document.getElementById('myra')?.classList.contains('chat'));
  }
  await still(page);
  await estimated();
  const tip = await shown(CHIP, 'chat');
  assert.strictEqual(tip.opacity, 1, 'it shows');
  assert(tip.tip.x >= 0 && tip.tip.x + tip.tip.width <= tip.window.width, `inside the ${tip.window.width} px window`);
  assert.deepStrictEqual(tip.clippedBy, [], 'and cut by nothing');
  assert.strictEqual(Math.round(tip.tip.y - (tip.host.y + tip.host.height)), 8, '8 px below the chip');
  await page.screenshot({ path: `${process.env.TIPS_SHOTS ?? l.data}/board-chip-phone.png` });
  await resize(1440, 900);
});

await check('a prototype adds what a build from its cards would take', async () => {
  const dir = await page.evaluate(
    async ({ repo, cards, chat }) => {
      await window.Fenmyr.saveFolders({
        projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
        folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
        order: {},
      });
      const made = await window.Fenmyr.protoCreate({ root: repo, name: 'Checkout', stack: 'react' });
      await window.Fenmyr.save({
        id: 'pb',
        name: 'Checkout',
        folder: 'pf',
        kind: 'prototype',
        proto: made,
        cards,
        links: [],
        tray: [],
        chat: [{ who: 'myra', text: '', t: 1, acts: chat }],
      });
      await window.__fenmyr.refreshBoards();
      await window.__fenmyr.openBoard('pb');
      return made.dir;
    },
    { repo, cards: proto, chat: [before] },
  );
  assert(dir, 'the prototype was made');
  await page.waitForFunction(() => window.__fenmyr?.curBoard()?.id === 'pb');
  const all = await estimated(huge0.tip);
  // 20 of the 22 pictures, which is all a build takes, are 4,784 tokens each, 47.8% of the window, and design.md and
  // myra.md 5.0% more, which is more than the quarter a build may fill
  assert.match(
    lines(all.tip).at(-2) ?? '',
    /^A build from these cards: about 5[234]% of the context$/,
    'every card, the pictures up to 20, and the design the newest build was sent',
  );
  assert.strictEqual(lines(all.tip).at(-1), 'A build would leave some out to fit');
  assert.strictEqual(all.trimmed, true, 'the chip is marked trimmed for it');
  assert.strictEqual(all.label, 'Board · trimmed');
  await seen('the prototype chip’s tooltip', CHIP, {
    at: 'below',
    surface: 'chat',
    delay: '0.25s',
    shot: 'board-chip-build',
  });

  // the three notes alone: no pictures, so only design.md and myra.md, 10,000 tokens, and the notes
  await pick(['n0', 'n1', 'n2']);
  const notes = await estimated(all.tip);
  assert.strictEqual(notes.trimmed, false, 'a build from the notes fits');
  assert.strictEqual(notes.label, 'Board');
  assert.strictEqual(
    lines(notes.tip)
      .at(-1)
      ?.replace(/^A build from these cards: about (\d+)% .*$/, '$1'),
    '5',
    'and takes the 5% the newest build’s design.md and myra.md took, with the notes under 1%',
  );
  assert(!notes.tip.includes('leave some out'));
});

fs.rmSync(work, { recursive: true, force: true });
assert.deepStrictEqual(l.errors, [], 'no page errors');
await l.close();
console.log('SEES ESTIMATE OK');
