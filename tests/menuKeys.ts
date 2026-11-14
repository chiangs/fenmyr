// Menus by keyboard and screen reader: the git bar's More and the zoom menu, both built on the shared board menu. Opened
// from the keyboard, a menu starts on its first item, Up and Down move, Enter or Space runs one, and Esc or running one
// hands focus back to its button, which says whether its menu is open. A mouse leaves focus where it was.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { launch } from './support/launch.ts';
import { freshRepo, openPrototype } from './support/prototype.ts';

const { work, repo } = freshRepo('fenmyr-menu-keys-');
const git = (...a: string[]) => execFileSync('git', ['-C', repo, ...a]).toString();
const note = { id: 'note', type: 'note', x: 40, y: 40, w: 220, h: 120, text: 'People miss the promo field' };
const l = await launch({ boards: [{ id: 'plain', name: 'Plain', cards: [note], links: [], tray: [] }], open: 'plain' });
const { page } = l;
const MORE = '#prGit [data-git="more"]';
const focus = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    return {
      menu: !!document.getElementById('rowMenu'),
      item: a?.closest('#rowMenu') ? (a.textContent ?? '') : null,
      on: a?.matches('[data-git="more"]') ? 'more' : a?.id || a?.tagName || '',
    };
  });
const expanded = (sel: string) => page.locator(sel).getAttribute('aria-expanded');
const press = async (key: string) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(150);
};

try {
  git('remote', 'add', 'origin', 'https://github.com/ann/acme.git');
  await openPrototype(page, repo);
  await page.waitForFunction(() => document.querySelector('#prGit .pg-state')?.textContent?.endsWith('No commits yet'));

  await page.focus('#prGit [data-git="commit"]');
  await press('Tab');
  assert.strictEqual((await focus()).on, 'more', 'Tab reaches More');
  assert.strictEqual(await expanded(MORE), 'false', 'More says its menu is closed');
  await press('Enter');
  assert.deepStrictEqual(
    await focus(),
    { menu: true, item: 'Push main to GitHub', on: 'BUTTON' },
    'Enter opens More on its first item',
  );
  assert.strictEqual(await expanded(MORE), 'true', 'and More says its menu is open');
  assert.match(
    await page.locator('#rowMenu').ariaSnapshot(),
    /^- menu "acme \/.+\/acme":\n {2}- separator\n {2}- menuitem "Push main to GitHub"\n {2}- menuitem "Open ann\/acme on GitHub"$/,
    'a screen reader hears a menu named for the repo, holding its items',
  );
  await press('ArrowDown');
  assert.strictEqual((await focus()).item, 'Open ann/acme on GitHub', 'Down moves to the next item');
  await press('ArrowDown');
  assert.strictEqual((await focus()).item, 'Push main to GitHub', 'and from the last back to the first');
  await press('ArrowUp');
  assert.strictEqual((await focus()).item, 'Open ann/acme on GitHub', 'Up moves back, round to the last');
  await press('Escape');
  assert.deepStrictEqual(await focus(), { menu: false, item: null, on: 'more' }, 'Esc closes it, back on More');
  assert.strictEqual(await expanded(MORE), 'false', 'which says its menu is closed again');

  await press('Space');
  assert.strictEqual((await focus()).item, 'Push main to GitHub', 'Space opens it too');
  await press('Space');
  assert.deepStrictEqual(await focus(), { menu: false, item: null, on: 'more' }, 'Space runs Push, back on More');
  // a remote with nothing on it to push yet keeps Push, for her to explain why
  await page.waitForFunction(() =>
    /nothing to push yet/.test([...document.querySelectorAll('#mcList .mc-msg.myra')].pop()?.textContent ?? ''),
  );

  await page.evaluate(() => dispatchEvent(new Event('focus')));
  await page.waitForTimeout(800);
  assert.strictEqual((await focus()).on, 'more', 'reading the repo again keeps focus on More');

  await page.click(MORE);
  assert.deepStrictEqual(await focus(), { menu: true, item: null, on: 'more' }, 'a click opens More, focus stays put');
  assert.strictEqual(await expanded(MORE), 'true', 'More says it’s open either way');
  await page.evaluate(() => dispatchEvent(new Event('focus')));
  await page.waitForTimeout(800);
  assert.strictEqual((await focus()).menu, true, 'reading the repo again to the same result leaves More open');
  await page.click('#mcList', { position: { x: 20, y: 20 } });
  await page.waitForTimeout(150);
  assert.strictEqual((await focus()).menu, false, 'a press outside closes it');
  assert.strictEqual(await expanded(MORE), 'false', 'and More says so');

  await page.focus('#prGit [data-git="commit"]');
  await press('Tab');
  await press('Enter');
  git('add', '-A');
  git('-c', 'user.name=Ann', '-c', 'user.email=ann@example.com', 'commit', '-qm', 'Start');
  await page.evaluate(() => dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => document.querySelector('#prGit .pg-state')?.textContent?.endsWith('Not pushed yet'));
  assert.deepStrictEqual(
    await focus(),
    { menu: false, item: null, on: 'more' },
    'a change in the repo closes More, out of date, and leaves focus on More',
  );

  await page.evaluate(() => window.__fenmyr.openBoard('plain'));
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__fenmyr.selectOnly(['note']));
  await page.focus('#zoom');
  await press('Enter');
  assert.strictEqual((await focus()).item?.startsWith('Zoom in'), true, 'the zoom menu opens on its first item');
  assert.strictEqual(await expanded('#zoom'), 'true', 'and its button says so');
  await press('ArrowDown');
  const x = await page.evaluate(() => window.__fenmyr.curBoard()?.cards.find(c => c.id === 'note')?.x);
  assert.strictEqual(x, 40, 'Down moves in the menu, not the selected note');
  assert.strictEqual((await focus()).item?.startsWith('Zoom out'), true, 'Down moves to Zoom out');
  await press('Enter');
  assert.deepStrictEqual(await focus(), { menu: false, item: null, on: 'zoom' }, 'Enter runs it, back on the button');
  assert.ok(
    (await page.evaluate(() => document.getElementById('zoom')?.textContent ?? '')) !== '100%',
    'and the board zoomed out',
  );
  await press('Enter');
  await press('Escape');
  assert.deepStrictEqual(await focus(), { menu: false, item: null, on: 'zoom' }, 'Esc closes the zoom menu too');
  assert.strictEqual(await expanded('#zoom'), 'false', 'and its button says so');

  assert.deepStrictEqual(l.errors, []);
  console.log('MENU KEYS OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
