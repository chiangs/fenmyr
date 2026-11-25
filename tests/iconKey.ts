// The Icon tool has Alt+I. It puts the tool in hand with drawing put down first, a click on the board lands a star and
// opens the picker as the panel's button does, and the key does nothing while typing, in quick capture or with another
// modifier held. No two tools share a key, so a clash with one already taken fails here.
import assert from 'node:assert';
import { SHORTCUTS } from '../src/web/input/keymap.ts';
import { TOOLBAR } from '../src/web/ui/toolbarTable.ts';
import { BOARD, kit } from './support/keyKit.ts';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';

assert.strictEqual(TOOLBAR.tool('icon')?.key, '⌥I', 'Icon has Alt+I');
const taken = [
  ...TOOLBAR.tools.flatMap(t => (t.key ? [t.key] : [])),
  ...SHORTCUTS.filter(s => s.keys.length === 1).map(s => s.keys),
];
assert.strictEqual(new Set(taken).size, taken.length, `no two keys are the same: ${taken.join(' ')}`);

const l = await launch({ boards: [BOARD], open: 'keys' });
try {
  const { page } = l;
  const k = await kit(page);
  // what is in hand, whether drawing is on, and how many icons there are, once the page has stopped moving
  const look = async () => {
    await still(page);
    return page.evaluate(() => {
      const held = [...(document.getElementById('ghost')?.classList ?? [])].filter(c => c !== 'ghost' && c !== 'on');
      return {
        held: held.join(' '),
        lit: !!document.querySelector('#tools [data-add="icon"]')?.classList.contains('on'),
        drawing: !!document.getElementById('stage')?.classList.contains('drawing'),
        icons: window.__fenmyr.board.cards.filter(c => c.type === 'icon').length,
        picker: document.getElementById('piecePick')?.hidden === false,
      };
    });
  };

  const spelt = await page.getAttribute('#tools [data-add="icon"]', 'data-tip');
  assert.ok(spelt && /^Icon · (Alt\+I|⌥I)$/.test(spelt), `its tooltip names the key (${spelt})`);

  await k.reset();
  await page.keyboard.press('p');
  assert.strictEqual((await look()).drawing, true, 'P draws');
  await page.keyboard.press('Alt+i');
  const inHand = await look();
  assert.deepStrictEqual(
    { held: inHand.held, lit: inHand.lit, drawing: inHand.drawing, picker: inHand.picker },
    { held: 'icon', lit: true, drawing: false, picker: false },
    'Alt+I puts drawing down and Icon in hand',
  );

  const spot = await k.emptySpot();
  await page.mouse.click(spot.x, spot.y);
  await page.waitForFunction(() => document.getElementById('piecePick')?.hidden === false);
  const dropped = await look();
  assert.deepStrictEqual(
    { held: dropped.held, lit: dropped.lit, icons: dropped.icons, picker: dropped.picker },
    { held: '', lit: false, icons: inHand.icons + 1, picker: true },
    'a click drops an icon, puts the tool down and opens the picker',
  );

  const nothing = { held: '', lit: false, drawing: false, icons: inHand.icons, picker: false };
  for (const keys of ['Shift+Alt+i', 'Alt+Control+i', 'Alt+Meta+i']) {
    await k.reset();
    await page.keyboard.press(keys);
    assert.deepStrictEqual(await look(), nothing, `${keys} does not put Icon in hand`);
  }
  await k.reset();
  await page.dblclick('#cards .card');
  await page.waitForFunction(() => window.__fenmyr.editing);
  await page.keyboard.press('Alt+i');
  assert.deepStrictEqual(await look(), nothing, 'Alt+I does nothing while typing in a note');
  await k.reset();
  await page.keyboard.press('Control+k');
  await page.waitForFunction(() => document.getElementById('capture')?.classList.contains('on'));
  await page.keyboard.press('Alt+i');
  assert.deepStrictEqual(await look(), nothing, 'Alt+I does nothing in quick capture');

  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('iconKey: ok');
} finally {
  await l.close();
}
