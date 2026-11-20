import assert from 'node:assert';
import { TOOLBAR } from '../src/web/ui/toolbarTable.ts';
import { launch } from './support/launch.ts';

const structure = TOOLBAR.tools.filter(t => t.group === 'structure');
assert.strictEqual(TOOLBAR.tool('tpl')?.group, 'structure', 'Templates is in the structure group');
assert.strictEqual(structure.at(-1)?.id, 'tpl', 'and last in it');
assert.strictEqual(structure.at(-2)?.id, 'frame', 'after Wireframe');

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'A note' };
const l = await launch({
  boards: [{ id: 'b', name: 'Bare', cards: [note], links: [], tray: [], view: { x: 300, y: 200, z: 1 } }],
  open: 'b',
});
const { page } = l;

const now = () =>
  page.evaluate(() => {
    const on = (sel: string) => !!document.querySelector(sel)?.classList.contains('on');
    return {
      picker: on('#tplPick'),
      lit: on('#tools [data-add="tpl"]'),
      title: on('#tools [data-add="title"]'),
      drawing: !!document.getElementById('stage')?.classList.contains('drawing'),
    };
  });
const closed = { picker: false, lit: false, title: false, drawing: false };
const tidy = async () => {
  await page.keyboard.press('Escape');
  await page.mouse.click(900, 650);
  await page.waitForTimeout(150);
};
const press = async (keys: string) => {
  await page.keyboard.press(keys);
  await page.waitForTimeout(150);
};

try {
  await page.mouse.click(900, 650);
  const buttons = await page.$$eval('#tools > [data-add]', bs => bs.map(b => b.getAttribute('data-add') ?? ''));
  assert.strictEqual(buttons[buttons.indexOf('frame') + 1], 'tpl', 'the button sits right after Wireframe');
  assert.strictEqual(
    await page.getAttribute('#tools [data-add="tpl"]', 'data-tip'),
    'Templates · Alt+T',
    'the tooltip names the key, spelled out on Linux',
  );

  await press('Alt+t');
  assert.deepStrictEqual(await now(), { ...closed, picker: true, lit: true }, 'Alt+T opens Templates and lights it');
  assert.strictEqual(
    await page.evaluate(() => document.activeElement?.id),
    'tpSearch',
    'the picker has the cursor in its search',
  );
  await press('Alt+t');
  assert.deepStrictEqual(await now(), closed, 'Alt+T again, from the search, closes it');
  await press('Alt+t');
  await press('Escape');
  assert.deepStrictEqual(await now(), closed, 'Escape closes it');
  await tidy();

  await press('t');
  assert.deepStrictEqual(await now(), { ...closed, title: true }, 'plain T is still Big title');
  await tidy();

  for (const keys of ['Control+t', 'Shift+Alt+t', 'Alt+Control+t']) {
    await press(keys);
    assert.deepStrictEqual(await now(), closed, `${keys} does nothing`);
    await tidy();
  }

  await page.dblclick('#cards .card');
  await page.waitForTimeout(150);
  await press('Alt+t');
  assert.strictEqual((await now()).picker, false, 'Alt+T does not open it while you type in a note');
  await tidy();

  await press('Control+k');
  assert.ok(await page.evaluate(() => document.getElementById('capture')?.classList.contains('on')), 'capture is open');
  await press('Alt+t');
  assert.strictEqual((await now()).picker, false, 'Alt+T does not open it over quick capture');
  await tidy();

  await press('p');
  assert.strictEqual((await now()).drawing, true, 'P draws');
  await press('Alt+t');
  assert.deepStrictEqual(await now(), { ...closed, picker: true, lit: true }, 'Alt+T puts drawing down for Templates');
  await tidy();

  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('toolKeys: ok');
} finally {
  await l.close();
}
