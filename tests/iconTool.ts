// The Icon tool sits in the main toolbar straight after Draw, not in the Wireframe row. A click on the board lands a
// star and opens the picker for its glyph; on a screen the icon joins it; Enter twice on the tool places one mid-view;
// Change icon still swaps it. A toolbar order saved before the tool existed shows it after Draw too.
import assert from 'node:assert';
import { TOOLBAR } from '../src/web/ui/toolbarTable.ts';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'A note' };
const screen = { id: 'S', type: 'frame', x: 700, y: -100, w: 393, h: 852, r: 0, device: 'iPhone', name: 'Screen' };
const board = { id: 'b', name: 'Icons', cards: [note, screen], links: [], tray: [], view: { x: 300, y: 200, z: 1 } };
// the order a person saved before Icon was a tool
const saved = TOOLBAR.tools.map(t => t.id).filter(id => id !== 'icon');
const l = await launch({ boards: [board], open: 'b', settings: { toolbar: { order: saved, hidden: [] } } });
const { page } = l;

// a point on the board, in world units, as a place in the window
const at = (x: number, y: number) =>
  page.evaluate(
    p => {
      const v = window.__fenmyr.view,
        s = document.getElementById('stage')?.getBoundingClientRect();
      return { x: (s?.left ?? 0) + p.x * v.z + v.x, y: (s?.top ?? 0) + p.y * v.z + v.y };
    },
    { x, y },
  );
const clickBoard = async (x: number, y: number) => {
  const p = await at(x, y);
  await page.mouse.click(p.x, p.y);
};
const newest = () =>
  page.evaluate(() => {
    const c = window.__fenmyr.curBoard()?.cards.at(-1);
    return c?.type === 'icon' ? { id: c.id, type: c.type, name: c.name ?? null, onFrame: c.onFrame ?? null } : null;
  });
const picker = () =>
  page.evaluate(() => {
    const p = document.getElementById('piecePick');
    return p?.hidden === false ? p.getAttribute('aria-label') : null;
  });
const pickerOpens = () => page.waitForFunction(() => document.getElementById('piecePick')?.hidden === false);
const pickerCloses = () => page.waitForFunction(() => document.getElementById('piecePick')?.hidden);
const pick = async (glyph: string) => {
  await page.keyboard.type(glyph);
  await page.keyboard.press('Enter');
  await pickerCloses();
  await still(page);
};
const failed: string[] = [];
const check = async (name: string, run: () => Promise<void>) => {
  try {
    await run();
  } catch (e) {
    failed.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__fenmyr.selectOnly([]));
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await still(page);
};

try {
  await still(page);

  await check('Icon is a tool in the main toolbar straight after Draw, even in an order saved before it', async () => {
    const b = await page.evaluate(() => {
      const el = document.querySelector('#tools [data-add="icon"]');
      return el && { after: el.previousElementSibling?.getAttribute('data-add'), name: el.getAttribute('aria-label') };
    });
    assert.strictEqual(b?.after, 'draw', 'the tool');
    assert.ok(/^Icon · (Alt\+I|⌥I)$/.test(b?.name ?? ''), `named with its key (${b?.name})`);
  });

  await check('the Wireframe row has Box and Text, and no Icon', async () => {
    await page.keyboard.press('w');
    await still(page);
    const names = await page.evaluate(() =>
      [...document.querySelectorAll('#screenbar [data-wft]')].map(b => b.getAttribute('data-wft')),
    );
    assert.deepStrictEqual(names, ['box', 'text'], 'the row’s tools');
  });

  await check('a click on the board with Icon lands a star and opens the picker for its glyph', async () => {
    await page.click('#tools [data-add="icon"]');
    await still(page);
    assert.ok(
      await page.evaluate(() => document.querySelector('#tools [data-add="icon"]')?.classList.contains('on')),
      'the tool lights',
    );
    await clickBoard(300, 300);
    await pickerOpens();
    await still(page);
    assert.deepStrictEqual(await newest().then(c => c && { ...c, id: '' }), {
      id: '',
      type: 'icon',
      name: 'star',
      onFrame: null,
    });
    assert.strictEqual(await picker(), 'Change icon', 'the picker opens to choose its glyph');
    await pick('heart');
    assert.strictEqual((await newest())?.name, 'heart', 'the glyph picked replaces the star');
  });

  await check('an icon placed on a screen joins it', async () => {
    await page.click('#tools [data-add="icon"]');
    await clickBoard(850, 200);
    await pickerOpens();
    await pick('home');
    const c = await newest();
    assert.deepStrictEqual(c && { name: c.name, onFrame: c.onFrame }, { name: 'home', onFrame: 'S' });
  });

  await check('Enter twice on the tool places an icon mid-view and opens the picker', async () => {
    const n = await page.evaluate(() => window.__fenmyr.curBoard()?.cards.length ?? 0);
    await page.focus('#tools [data-add="icon"]');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await pickerOpens();
    await still(page);
    assert.strictEqual(await page.evaluate(() => window.__fenmyr.curBoard()?.cards.length ?? 0), n + 1, 'one icon');
    assert.strictEqual((await newest())?.name, 'star', 'a star');
    assert.strictEqual(await picker(), 'Change icon', 'and the picker for its glyph');
  });

  await check('Change icon in the selection bar swaps a placed icon’s glyph', async () => {
    const id = (await newest())?.id ?? '';
    await page.evaluate(i => window.__fenmyr.selectOnly([i]), id);
    await still(page);
    await page.click('#selbar [data-chicon]');
    await pickerOpens();
    await pick('bell');
    assert.strictEqual((await newest())?.name, 'bell', 'the glyph is swapped');
  });

  for (const f of failed) console.log(`FAILED ${f}`);
  assert.deepStrictEqual(failed, [], 'every check passes');
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('iconTool: ok');
} finally {
  await l.close();
}
