// Myra keeps the person company with a prop of her own for what they hold: a palette while Draw or the Pen is in hand,
// a magnifying glass while Find is open, a clipboard while a checklist or a kanban board's card is being edited, and
// none for any other card. Work she is busy with wins over it, and it comes back when the work ends. On a phone the
// chat's header shows Myra herself, making the faces the one on the board makes, and her icon only when she is off.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';

const base = { x: 0, y: 0, w: 220, h: 140, r: 0, color: 'white' };
const board = {
  id: 'b',
  name: 'Held',
  cards: [
    { ...base, id: 'list', type: 'todo', x: -300, h: 120, text: 'Errands', items: [{ t: 'Milk', done: false }] },
    { ...base, id: 'plain', type: 'note', x: 0, text: 'A plain note' },
    {
      ...base,
      id: 'kb',
      type: 'coll',
      x: -300,
      y: 260,
      w: 836,
      h: 300,
      text: 'Backlog',
      kanban: true,
      cols: 3,
      colNames: ['To do', 'Doing', 'Done'],
      colLimit: [0, 0, 0],
      colOf: { k1: 0 },
      kids: ['k1'],
    },
    { ...base, id: 'k1', type: 'note', x: -280, y: 320, text: 'In a column' },
  ],
  links: [],
  tray: [],
  view: { x: 700, y: 300, z: 0.8 },
};
const l = await launch({ boards: [board], open: 'b' });
const { page } = l;

const failed: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
    console.log(`ok    ${name}`);
  } catch (e) {
    failed.push(name);
    console.log(`FAIL  ${name}: ${e instanceof Error ? e.message : e}`);
  }
}
const lookIs = async (want: string | null, what: string) => {
  await page.waitForFunction(w => window.__fenmyr.busyLook() === w, want, { timeout: 5000 }).catch(() => {});
  assert.strictEqual(await page.evaluate(() => window.__fenmyr.busyLook()), want, what);
};
const clear = async () => {
  await page.evaluate(() => {
    // Find closes from its own button, as Escape closes it only from its field
    if (!document.getElementById('findBar')?.hidden) document.getElementById('fbX')?.click();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await lookIs(null, 'she holds nothing between checks');
};
const edit = async (selector: string) => {
  await page.dblclick(selector);
  await page.waitForFunction(() => !!document.querySelector('#cards .card.editing'));
};

try {
  await check('Draw in hand gives her a palette, put away when Draw is', async () => {
    await page.keyboard.press('p');
    await lookIs('palette', 'a palette while Draw is in hand');
    await page.keyboard.press('p');
    await lookIs(null, 'and none once it is put down');
  });

  await check('the Pen in hand gives her a palette too', async () => {
    await page.keyboard.press('Shift+P');
    await lookIs('palette', 'a palette while the Pen is in hand');
    await clear();
  });

  await check('Find open gives her a magnifying glass, put away when Find closes', async () => {
    // Ctrl+F puts /find in her chat, and the find bar opens on what is asked for
    await page.keyboard.press('Control+f');
    await page.waitForFunction(() => {
      const input = document.getElementById('mcInput');
      return input instanceof HTMLTextAreaElement && /^\/find /.test(input.value);
    });
    await page.keyboard.type('Milk');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.getElementById('findBar')?.hidden);
    await lookIs('magnifier', 'a magnifying glass while Find is open');
    await clear();
  });

  await check('editing a checklist, or a card on a kanban board, gives her a clipboard', async () => {
    await edit('#cards .card[data-id="list"] li span');
    await lookIs('clipboard', 'a clipboard while a checklist is edited');
    await clear();
    await edit('#cards .card[data-id="k1"] .text');
    await lookIs('clipboard', 'a clipboard while a kanban board’s card is edited');
    await clear();
  });

  await check('editing any other card gives her nothing', async () => {
    await edit('#cards .card[data-id="plain"] .text');
    await still(page);
    assert.strictEqual(await page.evaluate(() => window.__fenmyr.busyLook()), null, 'no prop for a plain note');
    await clear();
  });

  await check('work she is busy with wins over what is held, which comes back when it ends', async () => {
    await page.keyboard.press('p');
    await lookIs('palette', 'a palette first');
    await page.evaluate(() => Reflect.set(window, 'jobs', [window.__fenmyr.startJob({ kind: 'rewriting' })]));
    try {
      await lookIs('writing', 'her work’s look while she works');
    } finally {
      await page.evaluate(() => {
        const jobs: unknown = Reflect.get(window, 'jobs');
        if (Array.isArray(jobs))
          for (const job of jobs)
            if (job && typeof job === 'object' && 'end' in job && typeof job.end === 'function') job.end();
      });
    }
    await lookIs('palette', 'and the palette again after');
    await page.keyboard.press('p');
    await lookIs(null, 'until Draw is put down');
  });

  // how many pixels of `hex` the header's Myra has drawn
  const headPixels = (hex: string) =>
    page.evaluate(hex => {
      const c = document.getElementById('mcGoo');
      if (!(c instanceof HTMLCanvasElement)) return -1;
      const g = c.getContext('2d'),
        want = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
      if (!g) return -1;
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] === want[0] && d[i + 1] === want[1] && d[i + 2] === want[2]) n++;
      return n;
    }, hex);
  const shown = (selector: string) =>
    page.evaluate(s => document.querySelector(s)?.checkVisibility({ visibilityProperty: true }) ?? false, selector);

  await check('on a phone the chat’s header shows Myra herself, making her faces', async () => {
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(420, 860));
    await page.waitForFunction(() => document.body.classList.contains('phone'));
    await page.evaluate(() => document.getElementById('mPill')?.click());
    await page.waitForFunction(() => document.getElementById('mcGoo')?.checkVisibility());
    assert.deepStrictEqual(
      [await shown('#mcGoo'), await shown('#mcPerch .mc-ic')],
      [true, false],
      'Myra in the header, not her icon',
    );
    assert.strictEqual(await headPixels('#e5586d'), 0, 'no heart eyes yet');
    await page.evaluate(() => window.__fenmyr.playAnim('love', false));
    await page.waitForFunction(() => window.__fenmyr.currentPose() === 'love');
    // the header's Myra draws on her own frames, at most 32 ms apart
    await page.waitForFunction(
      () => {
        const c = document.getElementById('mcGoo');
        const d =
          c instanceof HTMLCanvasElement ? c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data : null;
        if (!d) return false;
        for (let i = 0; i < d.length; i += 4) if (d[i] === 0xe5 && d[i + 1] === 0x58 && d[i + 2] === 0x6d) return true;
        return false;
      },
      null,
      { timeout: 5000 },
    );
    assert.ok((await headPixels('#e5586d')) > 0, 'heart eyes in the header too');
  });

  await check('with Myra turned off, the header shows her icon', async () => {
    await page.evaluate(() => document.body.classList.add('myra-hidden'));
    assert.deepStrictEqual(
      [await shown('#mcGoo'), await shown('#mcPerch .mc-ic')],
      [false, true],
      'her icon, not Myra',
    );
  });
} finally {
  await l.close();
}
assert.deepStrictEqual(failed, [], 'every check passes');
console.log('MYRA HELD PROPS OK');
