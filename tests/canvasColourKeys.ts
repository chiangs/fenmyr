// Canvas has Alt+C and Colour has O. Each puts its tool in hand with drawing put down first, a click on the board drops
// its card, and neither key does anything while typing or with another modifier held. No two tools share a key, so a
// key that clashes with one already taken fails here.
import assert from 'node:assert';
import { SHORTCUTS } from '../src/web/input/keymap.ts';
import { TOOLBAR } from '../src/web/ui/toolbarTable.ts';
import { BOARD, kit } from './support/keyKit.ts';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';

assert.strictEqual(TOOLBAR.tool('canvas')?.key, '⌥C', 'Canvas has Alt+C');
assert.strictEqual(TOOLBAR.tool('swatch')?.key, 'O', 'Colour has O');
const taken = [
  ...TOOLBAR.tools.flatMap(t => (t.key ? [t.key] : [])),
  ...SHORTCUTS.filter(s => s.keys.length === 1).map(s => s.keys),
];
assert.strictEqual(new Set(taken).size, taken.length, `no two keys are the same: ${taken.join(' ')}`);

const TOOLS = [
  {
    id: 'canvas',
    name: 'Canvas',
    press: 'Alt+c',
    tip: /^Canvas · (Alt\+C|⌥C)$/,
    others: ['Shift+Alt+c', 'Alt+Control+c'],
  },
  { id: 'swatch', name: 'Colour', press: 'o', tip: /^Colour · O$/, others: ['Control+o', 'Alt+o'] },
];

const l = await launch({ boards: [BOARD], open: 'keys' });
try {
  const { page } = l;
  const k = await kit(page);
  // what is in hand, and whether drawing is on, once the page has stopped moving
  const look = async (id: string) => {
    await still(page);
    return page.evaluate(id => {
      const held = [...(document.getElementById('ghost')?.classList ?? [])].filter(c => c !== 'ghost' && c !== 'on');
      return {
        held: held.join(' '),
        lit: !!document.querySelector(`#tools [data-add="${id}"]`)?.classList.contains('on'),
        drawing: !!document.getElementById('stage')?.classList.contains('drawing'),
        cards: window.__fenmyr.board.cards.filter(c => c.type === id).length,
      };
    }, id);
  };

  for (const { id, name, press, tip, others } of TOOLS) {
    const spelt = await page.getAttribute(`#tools [data-add="${id}"]`, 'data-tip');
    assert.ok(spelt && tip.test(spelt), `${name}: its tooltip names the key (${spelt})`);

    await k.reset();
    await page.keyboard.press('p');
    assert.strictEqual((await look(id)).drawing, true, 'P draws');
    await page.keyboard.press(press);
    const inHand = await look(id);
    assert.deepStrictEqual(
      { held: inHand.held, lit: inHand.lit, drawing: inHand.drawing },
      { held: id, lit: true, drawing: false },
      `${press} puts drawing down and ${name} in hand`,
    );

    const spot = await k.emptySpot();
    await page.mouse.click(spot.x, spot.y);
    // Canvas is ready to type in and Colour opens its picker, each a moment after the card lands
    await page.waitForFunction(
      () => window.__fenmyr.editing || document.getElementById('cpop')?.classList.contains('on'),
    );
    const dropped = await look(id);
    assert.deepStrictEqual(
      { held: dropped.held, lit: dropped.lit, cards: dropped.cards },
      { held: '', lit: false, cards: inHand.cards + 1 },
      `a click drops a ${name} card and puts the tool down`,
    );

    const nothing = { held: '', lit: false, drawing: false, cards: inHand.cards };
    for (const keys of others) {
      await k.reset();
      await page.keyboard.press(keys);
      assert.deepStrictEqual(await look(id), nothing, `${keys} does not put ${name} in hand`);
    }
    await k.reset();
    await page.dblclick('#cards .card');
    await page.waitForFunction(() => window.__fenmyr.editing);
    await page.keyboard.press(press);
    assert.deepStrictEqual(await look(id), nothing, `${press} does nothing while typing in a note`);
    await k.reset();
    await page.keyboard.press('Control+k');
    await page.waitForFunction(() => document.getElementById('capture')?.classList.contains('on'));
    await page.keyboard.press(press);
    assert.deepStrictEqual(await look(id), nothing, `${press} does nothing in quick capture`);
  }

  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('canvasColourKeys: ok');
} finally {
  await l.close();
}
