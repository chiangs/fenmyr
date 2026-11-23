// Myra's how-to note is as tall when her picture hasn't loaded as when it has. A framework measures its notes as it
// places them, so a head that waited for the picture to give it a height left the first how-to a page placed 10 px
// shorter than every one after it.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'A note' };
const board = (id: string) => ({
  id,
  name: id,
  cards: [{ ...note }],
  links: [],
  tray: [],
  view: { x: 300, y: 200, z: 1 },
});
const l = await launch({ boards: [board('a'), board('b')], open: 'a', settings: { ai: false } });
const { page } = l;

// the page has fetched no picture of hers yet, so the first one it places is the cold case
const howToHeight = async () => {
  await page.click('#tools [data-add="tpl"]');
  await page.waitForFunction(() => document.getElementById('tplPick')?.classList.contains('on'));
  await still(page);
  await page.click('#tplPick [data-tpl="kanban"]');
  await still(page);
  return page.evaluate(
    () => window.__fenmyr.curBoard().cards.find(c => c.type === 'note' && c.name === 'Myra’s how-to')?.h,
  );
};

try {
  const first = await howToHeight();
  await page.evaluate(id => window.__fenmyr.openBoard(id), 'b');
  await still(page);
  const second = await howToHeight();
  assert.ok(first && first > 300, `the first how-to grew to fit its words: ${first}`);
  assert.strictEqual(first, second, 'the first how-to a page places is as tall as the second');

  // a picture nothing has fetched, drawn and measured in one task, so it can't have loaded when the head is measured
  const heads = await page.evaluate(async () => {
    const c = {
      id: 'cold',
      type: 'note' as const,
      x: 0,
      y: 0,
      w: 280,
      h: 300,
      r: 0,
      color: 'white',
      name: 'How to',
      text: 'Words',
      myra: true,
      myraImg: `stamps/myra-wave.png?${Date.now()}`,
    };
    window.__fenmyr.curBoard().cards.push(c);
    window.__fenmyr.renderCard(c, true);
    const img = document.querySelector('[data-id="cold"] img.nmyra'),
      head = document.querySelector('[data-id="cold"] .nm-head');
    if (!(img instanceof HTMLImageElement) || !(head instanceof HTMLElement))
      throw new Error('no how-to head on the page');
    const unloaded = { loaded: img.complete, height: head.offsetHeight };
    await img.decode();
    return { unloaded, loaded: { loaded: img.complete, height: head.offsetHeight } };
  });
  assert.strictEqual(heads.unloaded.loaded, false, 'the picture hadn’t loaded when the head was measured');
  assert.strictEqual(heads.unloaded.height, heads.loaded.height, 'the head is as tall before it loads as after');
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('howToHeight: ok');
} finally {
  await l.close();
}
