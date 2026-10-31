// Popups close when you press outside them.
import assert from 'node:assert';
import { everyOfflineCard } from './fixtures/boards.ts';
import { launch } from './support/launch.ts';

const l = await launch({ boards: [everyOfflineCard()], open: 'every' });
const { page } = l;
const pressOutside = async () => {
  await page.mouse.click(720, 120);
  await page.waitForTimeout(150);
};
const opened = async (open: () => Promise<void>, isOpen: () => Promise<boolean>, name: string) => {
  await open();
  await page.waitForTimeout(150);
  assert(await isOpen(), `${name} opens`);
  await pressOutside();
  assert(!(await isOpen()), `${name} closes on an outside press`);
};
const rowMenuOpen = async () => (await page.locator('#rowMenu').count()) > 0;

await page.evaluate(() => window.__fenmyr.selectOnly(['note']));
await page.waitForTimeout(250);
await opened(
  () => page.locator('#selbar .sb-poptrig').first().click(),
  () => page.evaluate(() => !!document.querySelector('.sb-popw.open')),
  'selection bar popup',
);
await opened(
  () => page.keyboard.press('Control+k'),
  () => page.evaluate(() => !!document.getElementById('capture')?.classList.contains('on')),
  'quick capture',
);
await opened(() => page.locator('#cards [data-id="doc"]').click({ button: 'right' }), rowMenuOpen, 'card menu');
await opened(() => page.locator('.board-row').first().click({ button: 'right' }), rowMenuOpen, 'board menu');
assert.deepStrictEqual(l.errors, []);
await l.close();
console.log('POPUPS OK');
