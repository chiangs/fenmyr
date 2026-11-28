// A wire can point both ways. A board from before it, with an arrowhead at one end or none, opens and draws as it did;
// `arrow: 'both'` is drawn as two heads, the tips on the two ends of the line, and the selected wire's glow covers both.
// The bar's picker sets none, the end or both and shows which the wire has, and Flip, which swaps the ends, is on only
// for an arrow at one end and keeps both when it is forced. A stored arrow is read as true, false or both and nothing
// else.
import assert from 'node:assert';
import { readLinks } from '../src/shared/model.ts';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';
import { BOTH, beforeBoard, check, STYLE, wireKit, wiresBoard } from './support/wireKit.ts';

await check('a stored arrow is read as what it is: the end, both, or none', () => {
  const read = readLinks(
    [true, false, 'both', 'yes', 1, null, undefined].map((arrow, i) => ({
      id: `r${i}`,
      a: 'a',
      b: 'b',
      arrow,
      bend: 3,
    })),
  );
  assert.deepStrictEqual(
    read.map(l => [l.id, l.arrow]),
    [
      ['r0', true],
      ['r1', false],
      ['r2', 'both'],
      ['r3', undefined],
      ['r4', undefined],
      ['r5', undefined],
      ['r6', undefined],
    ],
    'both stays, true and false stay, any other value is dropped',
  );
  assert(
    read.every(l => l.bend === 3),
    'and the rest of the wire is kept',
  );
});

const l = await launch({ boards: [wiresBoard, beforeBoard], open: 'wires' });
const { page } = l;
const { links, link, open, select, drawn, heads } = wireKit(page);

await check('a board from before opens and draws as it did: the end, none, none', async () => {
  await open('before');
  assert.deepStrictEqual(await links(), beforeBoard.links, 'its wires are as they were stored');
  assert.deepStrictEqual(
    [await heads('o1'), await heads('o2'), await heads('o3')],
    [['end'], [], []],
    'an arrow of true has a head at the end, and false and none have none',
  );
  await open('wires');
});

await check('a wire of both is drawn with a head at each end, and its glow covers both', async () => {
  assert.deepStrictEqual(await heads('wb'), ['start', 'end'], 'two heads, the tips on the ends of the line');
  assert.deepStrictEqual(await heads('we'), ['end'], 'a wire of true has one, at the end');
  assert.deepStrictEqual([await heads('wn'), await heads('wf')], [[], []], 'and one of none or false has none');
  assert.deepStrictEqual(await heads('wx'), [], 'so has one with a value no version writes: it is read as none');
  await select('wb');
  await still(page);
  const halos = await page.evaluate(() =>
    [...document.querySelectorAll('.wires path.w-halo')].map(h => h.getAttribute('d')),
  );
  assert.strictEqual(halos.length, 2, 'the glow is the line’s and the heads’');
  assert.strictEqual(halos[1], (await drawn('wb')).d, 'and the second follows both heads');
});

// The bar's arrow picker: its trigger, the choices and which is on, and what the bar's Flip is doing
const trigger = '#selbar [data-pop="warr"]';
const picked = async (how: 'none' | 'end' | 'both') => {
  await page.click(trigger);
  await page.click(`#selbar [data-wb="arrow:${how}"]`);
  await still(page);
};
const flip = () => page.locator('#selbar [data-wb="flip"]');
const shownHeads = () => page.locator(`${trigger} polyline`).count();

await check('the bar’s picker sets none, the end or both, and shows which the wire has', async () => {
  await select('we');
  await still(page);
  assert.strictEqual(await page.locator(trigger).count(), 1, 'the bar has an arrow picker');
  assert.strictEqual(await page.locator('#selbar [data-wb="arrow"]').count(), 0, 'in place of the Arrow toggle');
  await page.click(trigger);
  assert.deepStrictEqual(
    await page.locator('#selbar .sb-pop-warr button').allInnerTexts(),
    ['No arrow', 'Arrow at the end', 'Arrows at both ends'],
    'it offers three',
  );
  assert.strictEqual(
    await page.locator('#selbar .sb-pop-warr button.on').getAttribute('data-wb'),
    'arrow:end',
    'the wire’s is on',
  );
  await page.click('#selbar [data-wb="arrow:both"]');
  await still(page);
  assert.strictEqual((await link('we'))?.arrow, 'both', 'both is stored as both');
  assert.deepStrictEqual(await heads('we'), ['start', 'end'], 'and drawn with two heads');
  assert.strictEqual(await shownHeads(), 2, 'the trigger draws two');
  assert.strictEqual(
    await page.locator('#selbar .sb-pop-warr button.on').getAttribute('data-wb'),
    'arrow:both',
    'and it is the one on',
  );
  await picked('none');
  const none = await link('we');
  assert(none && !('arrow' in none), 'none leaves no arrow stored');
  assert.deepStrictEqual(await heads('we'), [], 'and draws none');
  assert.strictEqual(await shownHeads(), 0, 'the trigger draws none');
  await picked('end');
  assert.strictEqual((await link('we'))?.arrow, true, 'the end is stored as true, as it always was');
  assert.deepStrictEqual(await heads('we'), ['end'], 'and draws one at the end');
  assert.strictEqual(await shownHeads(), 1, 'the trigger draws one');
});

await check('Flip swaps an arrow at one end and is off for both and for none', async () => {
  assert(await flip().isEnabled(), 'Flip is on for an arrow at one end');
  await flip().click();
  await still(page);
  const flipped = await link('we');
  assert.deepStrictEqual(
    [flipped?.a, flipped?.b, flipped?.arrow],
    ['D', 'C', true],
    'it swaps the ends and keeps the arrow',
  );
  await picked('both');
  assert(await flip().isDisabled(), 'Flip is off for both');
  await picked('none');
  assert(await flip().isDisabled(), 'and for none');
  await picked('end');
  const back = await link('we');
  assert.deepStrictEqual([back?.a, back?.b], ['D', 'C'], 'a click on the disabled Flip changed nothing');
});

await check('Flip, even forced on a wire of both, keeps both, its style and its ends’ pins', async () => {
  await select('wb');
  await still(page);
  assert(await flip().isDisabled(), 'Flip is off for the wire of both');
  for (let i = 0; i < 2; i++) {
    await flip().evaluate(b => {
      if (b instanceof HTMLButtonElement) b.disabled = false;
    });
    await flip().click();
    await still(page);
    const w = await link('wb');
    const swapped = i === 0;
    assert.deepStrictEqual(
      [w?.a, w?.b, w?.arrow],
      swapped ? ['B', 'A', 'both'] : ['A', 'B', 'both'],
      `flip ${i + 1} swaps the ends and keeps both`,
    );
    assert.deepStrictEqual(w?.pa, swapped ? STYLE.pb : STYLE.pa, 'with the pins going with their cards');
  }
  assert.deepStrictEqual(await link('wb'), BOTH, 'flipped twice, the wire is as it was');
  assert.deepStrictEqual(await heads('wb'), ['start', 'end'], 'and still has two heads');
});

assert.deepStrictEqual(l.errors, [], 'the page raised no errors');
await l.close();
console.log('WIRE ARROWS OK');
