// The Wireframe button in the bottom bar and the tools in the screen tool's mode bar, which take over the Wireframe
// panel's tool buttons: the button puts the screen tool in hand and lights, and tucks into ··· with the others; the
// mode bar's Box, Text and Icon place each on a board with no screen, by pointer or keyboard; R and X light their tool.
import assert from 'node:assert';
import { launch, settle } from './support/launch.ts';

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'A note' };
const l = await launch({
  boards: [{ id: 'b', name: 'Bare', cards: [note], links: [], tray: [], view: { x: 300, y: 200, z: 1 } }],
  open: 'b',
});
const { page } = l;
const EMPTY = { x: 900, y: 450 };

const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const key = async (k: string) => {
  await page.keyboard.press(k);
  await frames();
};
const blur = () =>
  page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
// what the person sees of the wireframe tools: the row, what is lit in it, and the bottom bar's button
const tools = () =>
  page.evaluate(() => {
    const row = document.getElementById('screenbar'),
      b = document.querySelector('#tools [data-add="frame"]');
    return {
      row: !!row?.checkVisibility(),
      lit: [...(row?.querySelectorAll('[aria-pressed="true"]') ?? [])].map(
        e => e.getAttribute('data-dev') ?? e.getAttribute('data-wft'),
      ),
      button: b?.getAttribute('aria-pressed') === 'true' && b.classList.contains('on'),
    };
  });
const DOWN = { row: false, lit: [], button: false };
const newest = () =>
  page.evaluate(() => {
    const c = window.__fenmyr.curBoard()?.cards.at(-1);
    return (
      c && { id: c.id, type: c.type, w: c.w, h: c.h, onFrame: c.onFrame ?? null, name: 'name' in c ? c.name : null }
    );
  });
const count = () => page.evaluate(() => window.__fenmyr.curBoard()?.cards.length ?? 0);
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
  await blur();
  await settle(page, 150);
};

try {
  await check(
    'the Wireframe button sits after Canvas, named for W, and puts the screen tool in hand, lit',
    async () => {
      const b = await page.evaluate(() => {
        const el = document.querySelector('#tools [data-add="frame"]');
        return {
          after: el?.previousElementSibling?.getAttribute('data-add'),
          name: el?.getAttribute('aria-label'),
          tip: el?.getAttribute('data-tip'),
        };
      });
      assert.deepStrictEqual(b, { after: 'canvas', name: 'Wireframe · W', tip: 'Wireframe · W' }, 'the button');
      assert.deepStrictEqual(await tools(), DOWN, 'nothing is in hand at first');
      await page.click('#tools [data-add="frame"]');
      await frames();
      assert.deepStrictEqual(await tools(), { row: true, lit: ['iPhone'], button: true }, 'a click lights it');
      await page.click('#tools [data-add="frame"]');
      await frames();
      assert.deepStrictEqual(await tools(), DOWN, 'a second click puts it down');
    },
  );

  await check('the mode bar names its tools, and Tab reaches them after the devices', async () => {
    await key('w');
    const names = await page.evaluate(() =>
      [...document.querySelectorAll('#screenbar [data-wft]')].map(b => b.getAttribute('aria-label')),
    );
    assert.deepStrictEqual(names, ['Box · R', 'Text · X', 'Icon'], 'Box, Text and Icon, by name');
    assert.strictEqual(await page.getAttribute('#screenbar', 'aria-label'), 'Wireframe', 'the row is named');
    await page.focus('#screenbar [data-dev="Watch"]');
    await key('Tab');
    assert.ok(
      await page.evaluate(() => document.activeElement?.matches('#screenbar [data-wft="box"]')),
      'Tab goes from the last device to Box',
    );
    await key('Enter');
    assert.deepStrictEqual(await tools(), { row: true, lit: ['box'], button: true }, 'Enter on Box puts it in hand');
  });

  await check(
    'the keyboard alone places a box and an icon from the Wireframe button, and R then Enter a box',
    async () => {
      const n = await count();
      await page.focus('#tools [data-add="frame"]');
      await key('Enter');
      assert.ok(
        await page.evaluate(() => document.activeElement?.matches('#screenbar [data-dev="iPhone"].on')),
        'Enter on the Wireframe button takes the keyboard to the lit device',
      );
      for (let i = 0; i < 5; i++) await key('Tab');
      await key('Enter');
      assert.deepStrictEqual(await tools(), { row: true, lit: ['box'], button: true }, 'Tab to Box and Enter takes it');
      await key('Enter');
      await settle(page, 200);
      const box = await page.evaluate(() => {
        const c = window.__fenmyr.curBoard()?.cards.at(-1),
          v = window.__fenmyr.view,
          s = document.getElementById('stage')?.getBoundingClientRect();
        return c && s
          ? {
              type: c.type,
              w: c.w,
              h: c.h,
              centred:
                Math.abs((c.x + c.w / 2) * v.z + v.x - s.width / 2) < 30 &&
                Math.abs((c.y + c.h / 2) * v.z + v.y - s.height / 2) < 30,
            }
          : null;
      });
      assert.deepStrictEqual(box, { type: 'box', w: 160, h: 100, centred: true }, 'Enter again places it mid-view');
      assert.strictEqual(await count(), n + 1, 'one box');
      await page.focus('#tools [data-add="frame"]');
      await key('Enter');
      for (let i = 0; i < 7; i++) await key('Tab');
      await key('Enter');
      await key('Enter');
      await settle(page, 300);
      assert.strictEqual((await newest())?.name, 'star', 'Tab to Icon and Enter twice lands a star');
      assert.strictEqual(
        await page.evaluate(() => document.getElementById('piecePick')?.getAttribute('aria-label')),
        'Change icon',
        'and opens the picker for its glyph',
      );
      await key('Escape');
      await page.evaluate(() => window.__fenmyr.selectOnly([]));
      await blur();
      await key('r');
      await key('Enter');
      await settle(page, 200);
      assert.deepStrictEqual(
        await newest().then(c => c && { type: c.type, w: c.w }),
        { type: 'box', w: 160 },
        'R then Enter places a box',
      );
    },
  );

  await check("the mode bar's Box draws a box on the bare board, and the row stays while it is in hand", async () => {
    await page.click('#tools [data-add="frame"]');
    await page.click('#screenbar [data-wft="box"]');
    await frames();
    assert.deepStrictEqual(await tools(), { row: true, lit: ['box'], button: true }, 'Box is lit');
    const n = await count();
    await page.mouse.click(EMPTY.x, EMPTY.y);
    await settle(page, 200);
    assert.strictEqual(await count(), n + 1, 'a click adds one card');
    const c = await newest();
    assert.deepStrictEqual(
      c && { type: c.type, w: c.w, h: c.h, onFrame: c.onFrame },
      { type: 'box', w: 160, h: 100, onFrame: null },
      'a 160 × 100 box on no screen',
    );
    assert.deepStrictEqual(await tools(), DOWN, 'and the tool goes down');
  });

  await check("the mode bar's Text places a text on the bare board, ready to type", async () => {
    await page.click('#tools [data-add="frame"]');
    await page.click('#screenbar [data-wft="text"]');
    await frames();
    assert.deepStrictEqual(await tools(), { row: true, lit: ['text'], button: true }, 'Text is lit');
    await page.mouse.click(EMPTY.x, EMPTY.y + 120);
    await settle(page, 200);
    assert.strictEqual((await newest())?.type, 'text', 'a text lands');
    await page.keyboard.type('Hello');
    await page.keyboard.press('Escape');
    await settle(page, 200);
    assert.strictEqual(
      await page.evaluate(() => {
        const c = window.__fenmyr.curBoard()?.cards.at(-1);
        return c?.type === 'text' ? c.text : null;
      }),
      'Hello',
      'and takes what is typed',
    );
  });

  await check("the mode bar's Icon lands a star on a board with no screen, then picks its glyph", async () => {
    await page.click('#tools [data-add="frame"]');
    await page.click('#screenbar [data-wft="icon"]');
    await frames();
    assert.deepStrictEqual(await tools(), { row: true, lit: ['icon'], button: true }, 'Icon is lit');
    await page.mouse.click(EMPTY.x, EMPTY.y + 200);
    await settle(page, 300);
    const c = await newest();
    assert.deepStrictEqual(c && { type: c.type, name: c.name, onFrame: c.onFrame }, {
      type: 'icon',
      name: 'star',
      onFrame: null,
    });
    const picker = await page.evaluate(() => {
      const p = document.getElementById('piecePick');
      return { open: !p?.hidden, name: p?.getAttribute('aria-label') };
    });
    assert.deepStrictEqual(picker, { open: true, name: 'Change icon' }, 'the picker opens to choose its glyph');
    await page.keyboard.type('heart');
    await page.keyboard.press('Enter');
    await settle(page, 300);
    assert.strictEqual((await newest())?.name, 'heart', 'Enter gives it the first match');
    assert.ok(await page.evaluate(() => document.getElementById('piecePick')?.hidden), 'and the picker closes');
  });

  await check('R and X light their tool in the mode bar, and Esc puts it down', async () => {
    await key('r');
    assert.deepStrictEqual(await tools(), { row: true, lit: ['box'], button: true }, 'R lights Box');
    await key('x');
    assert.deepStrictEqual(await tools(), { row: true, lit: ['text'], button: true }, 'X lights Text');
    await key('Escape');
    assert.deepStrictEqual(await tools(), DOWN, 'Esc puts it down');
    await key('r');
    await page.click('#tools [data-add="frame"]');
    await frames();
    assert.deepStrictEqual(await tools(), DOWN, 'the lit Wireframe button puts R’s box down too');
  });

  await check('··· lights while a tool tucked in it is in hand, as drawing is at 1280 px', async () => {
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1280, 800));
    await settle(page, 500);
    await key('p');
    const drawing = await page.evaluate(() => {
      const more = document.getElementById('tbMore'),
        draw = document.querySelector('#tools [data-add="draw"]');
      return {
        on: !!draw?.classList.contains('on') && !!draw.classList.contains('tb-over'),
        more: more ? getComputedStyle(more).backgroundColor : '',
        rest: getComputedStyle(document.querySelector('#tools [data-add="note"]') ?? document.body).backgroundColor,
      };
    });
    assert.ok(drawing.on, 'Draw is on and tucked');
    assert.notStrictEqual(drawing.more, drawing.rest, '··· is lit while drawing');
    await key('Escape');
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1440, 900));
    await settle(page, 500);
  });

  await check('at a width that tucks it, the button sits in ··· and works from there', async () => {
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1000, 800));
    await settle(page, 500);
    assert.ok(
      await page.evaluate(() => document.querySelector('#tools [data-add="frame"]')?.classList.contains('tb-over')),
      'the button is tucked',
    );
    await page.click('#tbMore');
    await page.locator('#rowMenu button', { hasText: 'Wireframe' }).click();
    await frames();
    assert.deepStrictEqual(
      await tools(),
      { row: true, lit: ['iPhone'], button: true },
      'its row in ··· puts it in hand',
    );
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1440, 900));
    await settle(page, 500);
  });

  for (const f of failed) console.log(`FAILED ${f}`);
  assert.deepStrictEqual(failed, [], 'every check passes');
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('wfTools: ok');
} finally {
  await l.close();
}
