// What opens and closes Myra's chat in the real app: Esc inside it, the fold button and a click on empty board close
// it, while clicks on cards, drags, tools and menus leave it open; focus opens it and comes back to her box; it is a
// labelled region; its top edge resizes it and the height is remembered; a closed chat with text shows a draft line.
import assert from 'node:assert';
import { openBar } from './support/bar.ts';

const { page, frames, view, check, done } = await openBar();
const isOpen = () => page.evaluate(() => !!document.getElementById('myra')?.classList.contains('chat'));
const open = async () => {
  if (!(await isOpen())) await page.click('#mPill');
  await page.waitForTimeout(400);
};
const fold = async () => {
  if (await isOpen()) await page.click('#mcClose');
  await page.waitForTimeout(400);
};
const active = () => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
// a point on empty board, clear of the chat, the cards, the widgets and the bars
const emptySpot = () =>
  page.evaluate(() => {
    for (let y = 120; y < innerHeight - 120; y += 20)
      for (let x = 300; x < innerWidth - 300; x += 20)
        if (document.elementFromPoint(x, y)?.id === 'stage') return { x, y };
    return null;
  });
const cardSpot = (id: string) =>
  page.evaluate(id => {
    const r = document.querySelector(`#cards [data-id="${id}"]`)?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }, id);
const chatHeight = () => page.evaluate(() => document.getElementById('mChat')?.getBoundingClientRect().height ?? 0);

await view(0, 0);

await check('the chat is a region named for her', async () => {
  await open();
  assert.strictEqual(await page.getByRole('region', { name: 'Myra' }).count(), 1);
});

await check('the fold button closes the chat and hands focus to her box, which does not reopen it', async () => {
  await open();
  await page.click('#mcClose');
  await page.waitForTimeout(400);
  assert.ok(!(await isOpen()), 'closed');
  assert.strictEqual(await active(), 'mPill', 'focus is on her box');
});

await check('a click on her box with the chat open leaves it open', async () => {
  await open();
  await page.evaluate(() => document.getElementById('mPill')?.click());
  await frames();
  assert.ok(await isOpen());
});

await check('a click on empty board closes the chat', async () => {
  await open();
  const at = await emptySpot();
  assert.ok(at, 'there is empty board');
  await page.mouse.click(at.x, at.y);
  await frames();
  assert.ok(!(await isOpen()));
});

await check('a click on a card selects it and leaves the chat open', async () => {
  await open();
  const at = await cardSpot('pic');
  assert.ok(at, 'the picture is on screen');
  await page.mouse.click(at.x, at.y);
  await frames();
  assert.ok(await isOpen(), 'still open');
  assert.deepStrictEqual(await page.evaluate(() => [...window.__fenmyr.sel]), ['pic'], 'the card is selected');
});

await check('a drag across empty board leaves the chat open', async () => {
  await open();
  const at = await emptySpot();
  assert.ok(at, 'there is empty board');
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 30, at.y + 20, { steps: 4 });
  await page.mouse.up();
  await frames();
  assert.ok(await isOpen());
});

await check('a right or middle click on empty board leaves the chat open', async () => {
  await open();
  const at = await emptySpot();
  assert.ok(at, 'there is empty board');
  await page.mouse.click(at.x, at.y, { button: 'middle' });
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await frames();
  await page.evaluate(() => document.getElementById('rowMenu')?.remove());
  assert.ok(await isOpen());
});

await check('a click that closes a menu leaves the chat open', async () => {
  await open();
  const card = await cardSpot('pic');
  assert.ok(card, 'the picture is on screen');
  await page.mouse.click(card.x, card.y, { button: 'right' });
  await page.waitForSelector('#rowMenu');
  await page.waitForTimeout(100); // the menu starts listening for presses outside it a tick after it opens
  const at = await emptySpot();
  assert.ok(at, 'there is empty board');
  await page.mouse.click(at.x, at.y);
  await frames();
  assert.ok(!(await page.locator('#rowMenu').count()), 'the menu is gone');
  assert.ok(await isOpen(), 'the chat is still open');
});

await check('a click with a tool in hand puts it down and leaves the chat open', async () => {
  await open();
  const before = await page.evaluate(() => window.__fenmyr.board.cards.length);
  await page.click('#tools [data-add="note"]');
  const at = await emptySpot();
  assert.ok(at, 'there is empty board');
  await page.mouse.click(at.x, at.y);
  await frames();
  assert.ok(await isOpen(), 'still open');
  assert.strictEqual(await page.evaluate(() => window.__fenmyr.board.cards.length), before + 1, 'a note was placed');
  await page.keyboard.press('Escape');
});

await check('clicks on the header and a widget leave the chat open', async () => {
  await open();
  await page.click('#boardName');
  await page.click('#side .label >> nth=0').catch(() => page.click('#side'));
  await frames();
  assert.ok(await isOpen());
});

await check('Esc with focus outside the chat leaves it open; Esc inside closes it', async () => {
  await open();
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.keyboard.press('Escape');
  await frames();
  assert.ok(await isOpen(), 'open after Esc on the board');
  await page.focus('#mcNew');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  assert.ok(!(await isOpen()), 'closed after Esc on a header button');
  assert.strictEqual(await active(), 'mPill', 'focus is on her box');
});

await check('focus moved to her box from a tool opens the chat, caret in the input', async () => {
  await fold();
  await page.focus('#tools [data-add="note"]');
  await page.evaluate(() => document.getElementById('mPill')?.focus());
  await page.waitForTimeout(400);
  assert.ok(await isOpen(), 'open');
  assert.strictEqual(await active(), 'mcInput');
});

await check('a closed chat with text shows a draft line in her box, and keeps the text', async () => {
  await open();
  await page.fill('#mcInput', 'one\ntwo\nthree');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const box = await page.evaluate(() => ({
    draft: document.getElementById('mDraft')?.checkVisibility() ? document.getElementById('mDraft')?.textContent : null,
    ask: !!document.querySelector('#mPill .m-ask')?.checkVisibility(),
  }));
  assert.deepStrictEqual(box, { draft: 'Draft · 3 lines', ask: false });
  await open();
  assert.strictEqual(await page.inputValue('#mcInput'), 'one\ntwo\nthree', 'the text survives');
  await page.fill('#mcInput', '');
  await fold();
  const empty = await page.evaluate(() => ({
    draft: !!document.getElementById('mDraft')?.checkVisibility(),
    ask: !!document.querySelector('#mPill .m-ask')?.checkVisibility(),
  }));
  assert.deepStrictEqual(empty, { draft: false, ask: true }, 'an empty chat shows "Ask Myra…" again');
});

await check('dragging the top edge resizes the chat, the height is kept, and a double-click resets it', async () => {
  await open();
  const h0 = await chatHeight();
  const grip = await page.locator('.mc-top-grip').boundingBox();
  assert.ok(grip, 'the grip is up');
  const x = grip.x + grip.width / 2,
    y = grip.y + grip.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 120, { steps: 6 });
  await page.mouse.up();
  await frames();
  const h1 = await chatHeight();
  assert.ok(Math.abs(h1 - (h0 - 120)) <= 1, `${h1} is 120 px under ${h0}`);
  assert.strictEqual(await page.evaluate(() => localStorage.getItem('fenmyr:chatH')), String(Math.round(h1)));
  assert.ok(await isOpen(), 'the drag leaves the chat open');
  await fold();
  await open();
  assert.ok(Math.abs((await chatHeight()) - h1) <= 1, 'reopened at the dragged height');
  const g = await page.locator('.mc-top-grip').boundingBox();
  assert.ok(g, 'the grip is up');
  await page.mouse.dblclick(g.x + g.width / 2, g.y + g.height / 2);
  await frames();
  assert.ok(Math.abs((await chatHeight()) - 560) <= 1, 'back to 560');
  assert.strictEqual(await page.evaluate(() => localStorage.getItem('fenmyr:chatH')), null, 'nothing remembered');
});

await done('CHAT CLOSE OK');
