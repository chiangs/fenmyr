// An earlier chat read on a prototype whose own chat is empty opens at its top, and keeps the reader's place while what
// Myra sees changes: selecting a card keeps the scroll and the cursor on Back, and adding a picture keeps the scroll and
// the same chat on screen.
import assert from 'node:assert';
import fs from 'node:fs';
import type { SavedChat } from '../src/shared/chat.ts';
import { launch, settle } from './support/launch.ts';
import { freshRepo, openPrototype } from './support/prototype.ts';

const T = Date.UTC(2026, 3, 2, 10);
const earlier: SavedChat[] = [
  {
    id: 'old1',
    title: 'Old line 0.',
    t: T + 40_000,
    msgs: Array.from({ length: 40 }, (_, i) => ({
      who: i % 2 ? 'myra' : 'me',
      text: `Old line ${i}.`,
      t: T + i * 1000,
    })),
  },
];
const card = { id: 'c1', type: 'note' as const, x: 40, y: 40, w: 220, h: 120, text: 'Checkout: total first' };
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const { work, repo } = freshRepo('fenmyr-proto-reading-');
const l = await launch({ boards: [{ id: 'plain', name: 'Plain', cards: [card], links: [], tray: [] }], open: 'plain' });
const { page } = l;

const reader = () =>
  page.evaluate(() => {
    const list = document.getElementById('mcList');
    return {
      reading: !!list?.textContent?.includes('Old line 39.'),
      scrollTop: Math.round(list?.scrollTop ?? -1),
      onBack: !!document.activeElement?.matches('#mcList [data-h="back"]'),
    };
  });
const sees = () => page.locator('#mcSees .mcs-t').allTextContents();

try {
  await openPrototype(page, repo);
  await page.evaluate(
    async ({ earlier, card }) => {
      await window.__fenmyr.openBoard('plain');
      const b = await window.Fenmyr.load('pb');
      if (!b) throw new Error('no prototype board');
      await window.Fenmyr.save({ ...b, cards: [card], chat: [], chats: earlier });
      await window.__fenmyr.openBoard('pb');
    },
    { earlier, card },
  );
  await page.waitForFunction(() => window.__fenmyr?.curBoard()?.id === 'pb');
  await settle(page, 600);
  await page.click('#mcHist');
  await page.click('#mcList .mh-open');
  await settle(page, 200);
  const opened = await reader();
  assert.deepStrictEqual(opened, { reading: true, scrollTop: 0, onBack: true }, 'the earlier chat opens at its top');

  await page.evaluate(() => {
    const list = document.getElementById('mcList');
    if (list) list.scrollTop = 600;
  });
  const back = await page.$('#mcList [data-h="back"]');
  const sameBack = () => page.evaluate(b => b === document.querySelector('#mcList [data-h="back"]'), back);

  await page.evaluate(() => window.__fenmyr.selectOnly(['c1']));
  await page.keyboard.press('Shift');
  await settle(page, 200);
  assert.deepStrictEqual(await sees(), ['Note · “Checkout: total first”'], 'selecting a card changes what she sees');
  assert.deepStrictEqual(
    await reader(),
    { reading: true, scrollTop: 600, onBack: true },
    'and the earlier chat keeps its place, with the cursor still on Back',
  );

  await page.click('#mcSees .mcs-add');
  const chooser = page.waitForEvent('filechooser');
  await page.click('#rowMenu button:has-text("Picture or file…")');
  await (await chooser).setFiles([{ name: 'dot.png', mimeType: 'image/png', buffer: PNG }]);
  await settle(page, 200);
  assert.ok((await sees()).includes('dot.png'), 'adding a picture changes what she sees');
  const added = await reader();
  assert.ok(added.reading && added.scrollTop === 600, `and the earlier chat keeps its place (${added.scrollTop})`);
  assert.ok(await sameBack(), 'without being drawn again');

  assert.deepStrictEqual(l.errors, []);
  console.log('PROTO READING OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
