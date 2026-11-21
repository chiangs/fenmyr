// One behaviour check for each shortcut that opens, closes or steps through a panel or a view, and for the two keys that
// put a wireframe tool in hand. The ids are the ones in SHORTCUTS.
import assert from 'node:assert';
import type { Page } from 'playwright';
import type { Check } from './keyChecks.ts';
import type { Kit } from './keyKit.ts';

const ghost = (page: Page) => page.evaluate(() => document.getElementById('ghost')?.className ?? '');

// Starts drawing, so a key's first job shows: drawing goes down as the tool comes up.
async function drawnThenPress(k: Kit, key: string) {
  await k.reset();
  await k.press('p');
  assert.ok(await k.has('#stage', 'drawing'), 'P starts drawing');
  await k.press(key);
  assert.ok(!(await k.has('#stage', 'drawing')), `${key} puts drawing down`);
}

/** Pressing the key puts the Box tool in hand, and a drag on the board draws a box the size of the drag. */
export async function drawBox(page: Page, k: Kit, key: string) {
  await drawnThenPress(k, key);
  assert.ok((await ghost(page)).includes('box'), `${key} puts the Box tool in hand`);
  const spot = await k.emptySpot(),
    before = await k.order();
  await page.mouse.move(spot.x, spot.y);
  await page.mouse.down();
  await page.mouse.move(spot.x + 80, spot.y + 50, { steps: 4 });
  await page.mouse.move(spot.x + 160, spot.y + 100, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const box = await page.evaluate(
    ids => window.__fenmyr.board.cards.find(c => !ids.includes(c.id) && c.type === 'box'),
    before,
  );
  assert.ok(
    box && Math.abs(box.w - 160) <= 25 && Math.abs(box.h - 100) <= 25,
    `a drag of 160×100 draws a Box about that size: ${box?.w}×${box?.h}`,
  );
}

/** Pressing the key puts the Text tool in hand, and a click on the board drops a text card ready to type in. */
export async function dropText(page: Page, k: Kit, key: string) {
  await drawnThenPress(k, key);
  assert.ok((await ghost(page)).includes('text'), `${key} puts the Text tool in hand`);
  const spot = await k.emptySpot(),
    before = await k.order();
  await page.mouse.click(spot.x, spot.y);
  await page.waitForTimeout(200);
  const made = await page.evaluate(
    ids => window.__fenmyr.board.cards.find(c => !ids.includes(c.id) && c.type === 'text')?.id ?? null,
    before,
  );
  assert.ok(made, 'a click drops a Text card');
  assert.strictEqual(await page.evaluate(() => window.__fenmyr.editing), made, 'ready to type in');
}

export function panelChecks(page: Page, k: Kit): Record<string, Check> {
  const findCount = () => page.evaluate(() => document.getElementById('fbCount')?.textContent ?? '');
  // searches for "alpha", which two cards have, and leaves the find bar open on the first
  const findAlpha = async () => {
    await k.reset();
    await k.press(k.chord('find'));
    // the chat's input takes focus only once it shows, which a transition delay puts after the key's own focus()
    await page.waitForFunction(() => document.getElementById('mcInput')?.checkVisibility({ visibilityProperty: true }));
    await page.focus('#mcInput');
    await page.keyboard.type('alpha');
    await k.press(k.chord('findNext'), 400);
    assert.strictEqual(await findCount(), '1 of 2', 'the find bar is open on the first of two matches');
  };
  return {
    capture: async () => {
      await k.reset();
      await k.press(k.chord('capture'));
      assert.ok(await k.has('#capture', 'on'), 'quick capture opens');
    },
    find: async () => {
      await k.reset();
      await k.press(k.chord('find'));
      assert.ok(await k.has('#myra', 'chat'), 'find opens Myra’s chat');
      assert.strictEqual(
        await page.evaluate(() => document.querySelector<HTMLTextAreaElement>('#mcInput')?.value),
        '/find ',
        'ready to search',
      );
    },
    findNext: async () => {
      await findAlpha();
      await k.press(k.chord('findNext'), 300);
      assert.strictEqual(await findCount(), '2 of 2', 'next match steps on');
    },
    findPrevious: async () => {
      await findAlpha();
      await k.press(k.chord('findNext'), 300);
      await k.press(k.chord('findPrevious'), 300);
      assert.strictEqual(await findCount(), '1 of 2', 'previous match steps back');
    },
    settings: async () => {
      await k.reset();
      await k.press(k.chord('settings'));
      assert.ok(await k.has('#settings', 'on'), 'Settings opens');
    },
    clean: async () => {
      await k.reset();
      await k.press(k.chord('clean'), 500);
      assert.ok(await k.has('body', 'clean'), 'just the board tucks every panel away');
      await k.press(k.chord('clean'), 300);
      assert.ok(!(await k.has('body', 'clean')), 'and brings them back');
    },
    focus: async () => {
      await k.reset();
      await k.select('a');
      await k.press(k.chord('focus'));
      const dim = (id: string) => k.has(`#cards [data-id="${id}"]`, 'dim');
      assert.deepStrictEqual(
        [await dim('a'), await dim('b')],
        [false, true],
        'focus fades the cards that are not selected',
      );
      await k.press(k.chord('focus'));
      assert.deepStrictEqual([await dim('a'), await dim('b')], [false, false], 'and again brings them back');
    },
    myra: async () => {
      await k.reset();
      await k.press(k.chord('myra'), 400);
      assert.ok(await k.has('#myra', 'chat'), 'ask Myra opens her chat');
    },
    escape: async () => {
      await k.reset();
      await k.select('a');
      await k.press(k.chord('escape'));
      assert.deepStrictEqual(await k.selected(), [], 'Esc clears the selection');
      await k.press('n');
      assert.ok((await ghost(page)).includes('on'), 'N puts the Note tool in hand');
      await k.press('Escape');
      assert.ok(!(await ghost(page)).includes('on'), 'Esc puts it down');
      await k.press(k.chord('settings'));
      await k.press('Escape');
      assert.ok(!(await k.has('#settings', 'on')), 'Esc closes Settings');
      await findAlpha();
      await k.press('Escape');
      assert.ok(await page.evaluate(() => !!document.getElementById('findBar')?.hidden), 'and the find bar');
    },

    box: () => drawBox(page, k, k.chord('box')),
    text: () => dropText(page, k, k.chord('text')),
  };
}
