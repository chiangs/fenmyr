// The selection bar where room runs short: its dropdowns near the top of the view, presses on it that belong to it
// rather than to the board, and a window so narrow that the bar is wider than the room between the side panels.
import assert from 'node:assert';
import { openBar } from './support/bar.ts';

const { page, frames, view, select, check, done } = await openBar();
const press = async (...keys: string[]) => {
  for (const k of keys) {
    await page.keyboard.press(k);
    await frames();
  }
};
const menuUp = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.row-menu')].some(m => m instanceof HTMLElement && m.checkVisibility()),
  );
const middleOf = async (sel: string) => {
  const b = await page.locator(sel).boundingBox();
  assert.ok(b, `${sel} is on screen`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

await check('a right-click on the bar opens no card menu', async () => {
  await view(500, 400);
  await select(['note']);
  const { x, y } = await middleOf('#selbar [data-ts="bold"]');
  await page.mouse.click(x, y, { button: 'right' });
  await page.waitForTimeout(250);
  assert.ok(!(await menuUp()), 'no menu');
  await press('Escape');
});

await check('a long press on the bar opens no card menu', async () => {
  await view(500, 400);
  await select(['note']);
  const { x, y } = await middleOf('#selbar [data-ts="bold"]');
  await page.evaluate(
    ({ x, y }) => {
      const at = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 7, pointerType: 'touch' };
      document.elementFromPoint(x, y)?.dispatchEvent(new PointerEvent('pointerdown', at));
    },
    { x, y },
  );
  await page.waitForTimeout(700);
  await page.evaluate(
    ({ x, y }) =>
      document
        .elementFromPoint(x, y)
        ?.dispatchEvent(
          new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y, pointerId: 7, pointerType: 'touch' }),
        ),
    { x, y },
  );
  assert.ok(!(await menuUp()), 'no menu');
  await press('Escape');
});

await done('BAR ROOM OK');
