// The selection bar where room runs short: its dropdowns near the top of the view, presses on it that belong to it
// rather than to the board, and a window so narrow that the bar is wider than the room between the side panels.
import assert from 'node:assert';
import { openBar } from './support/bar.ts';
import { settle } from './support/launch.ts';

const { l, page, frames, view, select, selectWire, check, done } = await openBar();
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

// Each dropdown the bar opens, and where it landed: wholly on screen, and on which side of the bar.
const dropdowns = async () => {
  const triggers = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '#selbar > .sb-g > .sb-popw > [data-pop], #selbar > .sb-popw > [data-pop]',
      ),
    ]
      .filter(t => t.checkVisibility() && t.dataset.pop !== 'more')
      .map(t => t.dataset.pop ?? ''),
  );
  assert.ok(triggers.length > 2, `the bar has dropdowns: ${triggers}`);
  const seen = [];
  for (const id of triggers) {
    await page.click(`#selbar [data-pop="${id}"]`);
    await frames();
    seen.push(
      await page.evaluate(id => {
        const pop = document.querySelector(`#selbar [data-popw="${id}"].open > .sb-pop`)?.getBoundingClientRect(),
          bar = document.getElementById('selbar')?.getBoundingClientRect();
        if (!pop || !bar) return { id, onScreen: false, below: false, above: false };
        return {
          id,
          onScreen: pop.top >= 0 && pop.bottom <= innerHeight && pop.left >= 0 && pop.right <= innerWidth,
          below: pop.top >= bar.bottom,
          above: pop.bottom <= bar.top,
        };
      }, id),
    );
    await press('Escape');
  }
  return seen;
};
const barSide = () => page.evaluate(() => ({ ...document.getElementById('selbar')?.dataset }));

await check('with the bar held at the top, its dropdowns open below it, on screen', async () => {
  await view(-1000, 0);
  await select(['tall']);
  assert.strictEqual((await barSide()).stuck, 'top', 'the bar is held at the top');
  for (const d of await dropdowns()) assert.ok(d.onScreen && d.below, `${d.id} drops below: ${JSON.stringify(d)}`);
});

await check('with the bar high above a note, a dropdown with no room above opens below', async () => {
  await view(500, 210);
  await select(['note']);
  const at = await barSide();
  assert.ok(at.side === 'above' && !at.stuck, `the bar is above the note: ${JSON.stringify(at)}`);
  const seen = await dropdowns();
  for (const d of seen) assert.ok(d.onScreen && (d.above || d.below), `${d.id} is on screen: ${JSON.stringify(d)}`);
  assert.ok(
    seen.some(d => d.above) && seen.some(d => d.below),
    `short ones open above, tall ones below: ${JSON.stringify(seen)}`,
  );
});

await check('with the bar held at the top, the tilt box opens below it, on screen', async () => {
  await view(-1000, 0);
  await select(['tall']);
  await page.click('#selbar [data-sb="tiltpop"]');
  await page.waitForTimeout(250);
  const r = await page.evaluate(() => {
    const p = document.getElementById('tiltPop')?.getBoundingClientRect(),
      bar = document.getElementById('selbar')?.getBoundingClientRect();
    return { top: p?.top ?? NaN, bottom: p?.bottom ?? NaN, barBottom: bar?.bottom ?? NaN, h: innerHeight };
  });
  assert.ok(r.top >= r.barBottom && r.bottom <= r.h, `below the bar and on screen: ${JSON.stringify(r)}`);
  await press('Escape');
});

// Every control on the bar is what a click reaches at its middle and near both its ends, not a side panel over it.
const reachable = () =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#selbar button, #selbar .sb-tilt')]
      .filter(b => b.checkVisibility() && !b.closest('.sb-pop'))
      .filter(b => {
        const r = b.getBoundingClientRect(),
          y = r.top + r.height / 2;
        return [r.left + 2, r.left + r.width / 2, r.right - 2].some(
          x => !document.elementFromPoint(x, y)?.closest('#selbar'),
        );
      })
      .map(b => b.dataset.sb ?? b.dataset.pop ?? b.dataset.wb ?? b.textContent?.trim()),
  );

await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(900, 800));
await settle(l.page);
for (const [what, ids, x] of [
  ['three cards', ['note', 'pic', 'wf'], 300],
  ['two shapes', ['s1', 's2'], -1300],
] as const)
  await check(`in a 900 px window, every control on the bar for ${what} can be clicked`, async () => {
    await view(x, 300);
    await select([...ids]);
    assert.deepStrictEqual(await reachable(), [], 'none is under a side panel');
  });
await check('in a 900 px window, every control on a connector’s bar can be clicked', async () => {
  await view(300, -300);
  await selectWire('h');
  assert.deepStrictEqual(await reachable(), [], 'none is under a side panel');
  await press('Escape');
});
await done('BAR ROOM OK');
