// The phone layout: a panel opens as a bottom sheet without an error, and a computer keeps the chat's send hint.
import assert from 'node:assert';
import { everyOfflineCard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const l = await launch({ boards: [everyOfflineCard()], open: 'every' });
await l.app.evaluate(({ BrowserWindow }) => {
  const [win] = BrowserWindow.getAllWindows();
  if (!win) throw new Error('no window');
  win.setSize(600, 900);
});
await settle(l.page);
const hint = await l.page.evaluate(() => ({
  phone: document.body.classList.contains('phone'),
  touch: matchMedia('(pointer: coarse)').matches,
  shown: getComputedStyle(document.getElementById('mcHint') ?? document.body).display !== 'none',
}));
await l.page.click('[data-sheet="layers"]');
await l.page.waitForTimeout(500);
const opened = await l.page.evaluate(() => document.querySelector('[data-sheet="layers"]')?.classList.contains('on'));
const errors = [...l.errors];
await l.close();
assert.deepStrictEqual(errors, []);
assert(opened, 'the sheet opened');
assert.deepStrictEqual(
  hint,
  { phone: true, touch: false, shown: true },
  'a narrow window on a computer keeps the Ctrl+Enter hint; only a touch screen hides it',
);
console.log('PHONE OK');
