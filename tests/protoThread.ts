// A prototype board keeps one chat: New chat is gone, /clear answers instead of clearing, chats put away before this
// open read-only without changing the board, the thread keeps its last 500 messages whatever Settings says, and Clear
// all chats still clears it.
import assert from 'node:assert';
import fs from 'node:fs';
import type { ChatMsg, SavedChat } from '../src/shared/chat.ts';
import { launch, settle } from './support/launch.ts';
import { freshRepo, openPrototype } from './support/prototype.ts';

const T = Date.UTC(2026, 3, 2, 10);
const thread: ChatMsg[] = [
  { who: 'me', text: 'Add a coupon field', t: T + 60_000 },
  { who: 'myra', text: 'I added the coupon field under the total.', t: T + 61_000 },
];
const earlier: SavedChat[] = [
  {
    id: 'old1',
    title: 'Make the pay button bigger',
    t: T + 1000,
    msgs: [
      { who: 'me', text: 'Make the pay button bigger', t: T },
      {
        who: 'myra',
        text: 'The pay button is bigger now.',
        t: T + 1000,
        acts: [
          { kind: 'commit', board: 'pb', message: 'Make the pay button bigger' },
          { kind: 'next', text: 'Add a coupon field' },
        ],
      },
    ],
  },
  {
    id: 'old2',
    title: 'Use a darker blue',
    t: T - 1000,
    msgs: [
      { who: 'me', text: 'Use a darker blue', t: T - 2000 },
      { who: 'myra', text: 'The blue is darker.', t: T - 1000 },
    ],
  },
];

const { work, repo } = freshRepo('fenmyr-proto-thread-');
const note = { id: 'n1', type: 'note', x: 40, y: 40, w: 220, h: 120, text: 'People miss the promo field' };
const l = await launch({
  boards: [{ id: 'plain', name: 'Plain', cards: [note], links: [], tray: [] }],
  settings: { chatMax: '20' },
  open: 'plain',
});
const { page } = l;

const board = () =>
  page.evaluate(() => {
    const b = window.__fenmyr.curBoard();
    return { chat: b.chat ?? [], chats: b.chats ?? [] };
  });
const onDisk = () =>
  page.evaluate(async () => {
    const b = await window.Fenmyr.load('pb');
    return { chat: b?.chat ?? [], chats: b?.chats ?? [] };
  });
const shown = () => page.evaluate(() => document.getElementById('mcList')?.innerText ?? '');
const send = async (text: string) => {
  await page.fill('#mcInput', text);
  await page.keyboard.press('Control+Enter');
  await settle(page, 300);
};

try {
  const newChatOnPlain = await page.evaluate(
    () => getComputedStyle(document.getElementById('mcNew') ?? document.body).display,
  );
  assert.notStrictEqual(newChatOnPlain, 'none', 'an ordinary board has New chat');

  // a prototype from before this phase: its chat and the chats New chat put away then
  await openPrototype(page, repo);
  await page.evaluate(
    async ({ thread, earlier }) => {
      await window.__fenmyr.openBoard('plain');
      const b = await window.Fenmyr.load('pb');
      if (!b) throw new Error('no prototype board');
      await window.Fenmyr.save({ ...b, chat: thread, chats: earlier });
      await window.__fenmyr.openBoard('pb');
    },
    { thread, earlier },
  );
  await page.waitForFunction(() => window.__fenmyr?.curBoard()?.id === 'pb');
  await settle(page, 600);
  assert.deepStrictEqual(await board(), { chat: thread, chats: earlier }, 'the older prototype loads as it was saved');
  assert.match(await shown(), /I added the coupon field under the total\./, 'and its chat reads in the dock');

  assert.strictEqual(
    await page.evaluate(() => getComputedStyle(document.getElementById('mcNew') ?? document.body).display),
    'none',
    'a prototype has no New chat',
  );
  await page.evaluate(() => document.getElementById('mcNew')?.click());
  await settle(page, 200);
  assert.deepStrictEqual(
    await board(),
    { chat: thread, chats: earlier },
    'and clicking it from a script changes nothing',
  );

  await send('/clear');
  const cleared = await board();
  assert.deepStrictEqual(cleared.chat.slice(0, -1), thread, '/clear keeps every message');
  assert.deepStrictEqual(
    cleared.chat.at(-1)?.text,
    'I keep one chat for each prototype, so how it was built stays in one place.',
    'and she says why',
  );
  assert.deepStrictEqual(cleared.chats, earlier, 'and puts nothing away');

  const before = await board();
  assert.ok(await page.isVisible('#mcHist'), 'Earlier chats shows the chat put away before');
  await page.click('#mcHist');
  await settle(page, 200);
  assert.match(await shown(), /Make the pay button bigger/, 'it lists that chat');
  await page.click('#mcList .mh-open');
  await settle(page, 200);
  const reading = await page.evaluate(() => ({
    text: document.getElementById('mcList')?.innerText ?? '',
    buttons: document.querySelectorAll('#mcList .m-acts button').length,
    focus: document.activeElement?.textContent,
  }));
  assert.match(reading.text, /From before this prototype kept one chat\./, 'opening it says where it is from');
  assert.match(
    reading.text,
    /Make the pay button bigger[\s\S]*The pay button is bigger now\./,
    'and draws its messages',
  );
  assert.ok(!reading.text.includes('I added the coupon field'), 'in place of the thread');
  assert.strictEqual(reading.buttons, 0, 'with none of her buttons');
  assert.strictEqual(reading.focus, '← Back to this chat', 'and the cursor on the way back');
  assert.deepStrictEqual(await board(), before, 'the board keeps its chat and its earlier chats');
  // past the 400 ms save timer, so a write the open started would have landed
  await page.waitForTimeout(800);
  assert.deepStrictEqual(await onDisk(), before, 'and its file is not rewritten');

  await send('/help');
  const back = await shown();
  assert.ok(!back.includes('From before this prototype'), 'sending a message goes back to the thread');
  assert.match(back, /I added the coupon field under the total\.[\s\S]*\/help[\s\S]*Here is what I can do/, 'with it');
  await page.click('#mcHist');
  await settle(page, 200);
  assert.strictEqual(await page.locator('#mcList .mh-row').count(), 2, 'Earlier chats opens on the list again');
  await page.click('#mcHist');

  const hint = await page.evaluate(
    () => document.querySelector('[data-seg="chatMax"]')?.closest('.set-row')?.querySelector('small')?.textContent,
  );
  assert.strictEqual(hint, 'Older messages fall off the top. A prototype keeps its last 500.', 'the setting says so');

  const say30 = () =>
    page.evaluate(async () => {
      for (let i = 0; i < 30; i++) await window.__fenmyr.applyMyra({ say: `Line ${i}.` }, 'q');
      return window.__fenmyr.curBoard().chat?.length ?? 0;
    });
  const had = (await board()).chat.length;
  assert.strictEqual(await say30(), had + 30, 'with 20 to keep in Settings, a prototype keeps all 30 new messages');
  const capped = await page.evaluate(async () => {
    const log = window.__fenmyr.curBoard().chat ?? [];
    while (log.length < 500) log.push({ who: 'myra', text: `Filler ${log.length}.`, t: Date.now() });
    const second = log[1];
    await window.__fenmyr.applyMyra({ say: 'The newest line.' }, 'q');
    return { n: log.length, oldestGone: log[0] === second, last: log.at(-1)?.text };
  });
  assert.deepStrictEqual(
    capped,
    { n: 500, oldestGone: true, last: 'The newest line.' },
    'and its last 500, letting the oldest go',
  );

  await page.evaluate(() => window.__fenmyr.openBoard('plain'));
  await page.waitForFunction(() => window.__fenmyr?.curBoard()?.id === 'plain');
  await settle(page, 300);
  assert.strictEqual(await say30(), 20, 'an ordinary board keeps the 20 Settings asks for');

  await page.evaluate(() => window.__fenmyr.openBoard('pb'));
  await page.waitForFunction(() => window.__fenmyr?.curBoard()?.id === 'pb');
  await settle(page, 300);
  await page.click('#mcHist');
  await page.click('#mcList .mh-row[data-i="1"] .mh-del');
  await page.click('#mcList .mh-row[data-i="1"] .mh-del');
  await settle(page, 200);
  assert.deepStrictEqual(
    (await board()).chats.map(c => c.id),
    ['old1'],
    'an earlier chat can still be deleted on a prototype',
  );

  await page.evaluate(() => document.getElementById('clearChats')?.click());
  await page.waitForFunction(() => document.getElementById('clearChats')?.textContent === 'Cleared ✓');
  assert.deepStrictEqual(await board(), { chat: [], chats: [] }, 'Clear all chats clears the prototype’s chats');
  assert.deepStrictEqual(await onDisk(), { chat: [], chats: [] }, 'in its file too');
  assert.match(
    await shown(),
    /^\s*← Back to this chat\s*Earlier chats on this board\s*No earlier chats\.\s*$/,
    'and none are listed',
  );

  assert.deepStrictEqual(l.errors, []);
  console.log('PROTO THREAD OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
