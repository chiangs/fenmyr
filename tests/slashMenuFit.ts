// The slash menu fits in the shortest window the app allows, 520 px high: it stops below the top of the window and above
// the box it grows from, scrolls when it has more rows than that, and the row picked with the arrow keys is in view.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';
import { templateChat } from './support/templateChat.ts';

const l = await launch({
  boards: [
    {
      id: 'b',
      name: 'b',
      cards: [{ id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'A note' }],
      links: [],
      tray: [],
      view: { x: 300, y: 200, z: 1 },
    },
  ],
  open: 'b',
  settings: { ai: false },
});
const { page } = l;
const { openChat, menuShown } = templateChat(page);
await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1000, 520));
await page.waitForFunction(() => innerHeight === 520);
await still(page);
await openChat();
await page.fill('#mcInput', '/');
await page.waitForFunction(() => !!document.querySelector('.slash-menu:not([hidden]) button'));
assert.ok(await menuShown(), 'typing / opens the menu');
await still(page);

const measure = () =>
  page.evaluate(() => {
    const menu = document.querySelector('.slash-menu'),
      box = document.querySelector('#mcInput')?.closest('form') ?? document.querySelector('#mcInput'),
      on = menu?.querySelector('button.on')?.getBoundingClientRect(),
      m = menu?.getBoundingClientRect(),
      f = box?.getBoundingClientRect();
    return {
      top: m?.top ?? -1,
      bottom: m?.bottom ?? -1,
      boxTop: f?.top ?? -1,
      scrolls: !!menu && menu.scrollHeight > menu.clientHeight,
      onTop: on?.top ?? -1,
      onBottom: on?.bottom ?? -1,
      key: menu?.querySelector('button.on')?.getAttribute('data-key') ?? '',
    };
  });

const first = await measure();
assert.ok(first.top >= 0, `the menu stops below the top of the window, at ${first.top.toFixed(0)}`);
assert.ok(first.bottom <= first.boxTop, 'and above the box it grows from');
assert.ok(first.scrolls, 'it scrolls, since it has more rows than there is room for');

const seen = new Set<string>();
for (let i = 0; i < 20; i++) {
  const m = await measure();
  seen.add(m.key);
  assert.ok(m.onTop >= m.top - 1 && m.onBottom <= m.bottom + 1, `the picked row is in view (${m.key})`);
  await page.keyboard.press('ArrowDown');
  await still(page);
}
assert.ok(seen.size >= 8, `the arrow keys walked the list, ${seen.size} rows`);
await l.close();
console.log('SLASH MENU FIT OK');
