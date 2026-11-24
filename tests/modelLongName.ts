// A local model's name is long, such as Ollama's. In the pill and in a row of the open model menu it is cut with an
// ellipsis on one line, and neither the pill nor the menu leaves its footer or the window, at the narrowest chat (320 px,
// CHAT.minW in src/web/myra/chatRules.ts).
import assert from 'node:assert';
import { replyBoard } from './fixtures/boards.ts';
import { launch } from './support/launch.ts';
import { type Rect, rect, still } from './support/settled.ts';

const LOCAL = 'qwen3-coder-30b-a3b-instruct-q4_K_M';

const l = await launch({ boards: [replyBoard('long', 'Long')], open: 'long', settings: { chatKeep: 'board' } });
const { page } = l;

const within = (inner: Rect, outer: Rect, slack = 0.5) =>
  inner.x >= outer.x - slack &&
  inner.y >= outer.y - slack &&
  inner.x + inner.width <= outer.x + outer.width + slack &&
  inner.y + inner.height <= outer.y + outer.height + slack;

await page.click('#mPill');
await page.waitForFunction(() => document.getElementById('myra')?.classList.contains('chat'));
await page.evaluate(() => document.getElementById('myra')?.style.setProperty('--chat-w', '320px'));
await page.click('#mcModel');
await page.waitForSelector('#mcModelMenu');
await still(page);

const row = '#mcModelMenu [data-model="0"]',
  name = `${row} .mm-name`,
  rowBefore = await rect(page, row),
  menuBefore = await rect(page, '#mcModelMenu');
assert.strictEqual((await rect(page, '#mChat')).width, 320, 'the chat is at its narrowest');
await page.evaluate(
  ([selector, text]) => {
    for (const s of [selector, '#mcModelText']) {
      const el = document.querySelector(s ?? '');
      if (el) el.textContent = text ?? '';
    }
  },
  [name, LOCAL],
);
await still(page);

// more text than the element shows, which reads as cut only on one clipped line that ends in an ellipsis
for (const sel of ['#mcModelText', name]) {
  const cut = await page.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return null;
    const css = getComputedStyle(el);
    return {
      more: el.scrollWidth > el.clientWidth,
      clipped: css.overflowX === 'hidden' && css.textOverflow === 'ellipsis' && css.whiteSpace === 'nowrap',
    };
  }, sel);
  assert.deepStrictEqual(cut, { more: true, clipped: true }, `${sel} is cut with an ellipsis on one line`);
}

const menu = await rect(page, '#mcModelMenu'),
  rowBox = await rect(page, row),
  nameBox = await rect(page, name),
  view = await page.evaluate(() => ({ x: 0, y: 0, width: innerWidth, height: innerHeight }));
assert(within(nameBox, rowBox), 'the name stays inside its row');
assert(within(rowBox, menu), 'and the row inside the menu');
assert.strictEqual(rowBox.height, rowBefore.height, 'the row is no taller, so the name did not wrap');
assert.strictEqual(menu.height, menuBefore.height, 'nor is the menu');
assert(within(menu, view), 'the menu stays inside the window');
assert(within(await rect(page, '#mcModel'), await rect(page, '.mc-foot')), 'the pill stays inside the footer');
assert.strictEqual(
  await page.evaluate(() => {
    const foot = document.querySelector('.mc-foot');
    return foot ? foot.scrollWidth - foot.clientWidth : -1;
  }),
  0,
  'the footer has nothing past its edge',
);

assert.deepStrictEqual(l.errors, [], 'no page errors');
await l.close();
console.log('MODEL LONG NAME OK');
