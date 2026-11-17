// No picture the app takes of its window shows a waiting plan's preview: a build's picture of a wireframe screen with
// planned cards over it is the same, pixel for pixel, as one taken with no plan, and every export, of the board or a
// card, as an image or a PDF, is taken while the preview is hidden. The preview shows again after each.
import assert from 'node:assert';
import { replyBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const board = replyBoard('pictures', 'pictures');
board.cards.push({ id: 'f1', type: 'frame', x: 1300, y: 400, w: 390, h: 600, r: 0, color: 'white', name: 'Login' });
const l = await launch({ boards: [board], open: 'pictures', claude: true });
const { page, app } = l;

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
const notes = (n: number, more: (i: number) => object) =>
  Array.from({ length: n }, (_, i) => ({ type: 'note', text: `On screen ${i}`, ...more(i) }));
// six notes over the screen and five beside it
const OVER = {
  say: 'Notes on the screen.',
  add: [
    ...notes(6, i => ({ x: 1320 + (i % 2) * 150, y: 430 + Math.floor(i / 2) * 120 })),
    ...notes(5, i => ({ x: 1800, y: 400 + i * 160 })),
  ],
};
const shown = () =>
  page.evaluate(() => getComputedStyle(document.getElementById('planPreview') ?? document.body).visibility);
// the screen in the middle of the window, with the chat closed, once the board is drawn sharp again after moving
async function look() {
  await page.evaluate(() => {
    Object.assign(window.__fenmyr.view, { x: -900, y: -200, z: 1 });
    window.__fenmyr.applyView();
  });
  await settle(page, 1000);
  const r = await page.locator('#cards .card[data-id="f1"]').boundingBox();
  assert(r, 'the screen is on screen');
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}
const capture = (r: { x: number; y: number; w: number; h: number }) =>
  page.evaluate(r => window.Fenmyr.captureArea(r), r);
// pixels that differ between two pictures, decoded in the page
const differing = (a: string, b: string) =>
  page.evaluate(
    async ([a = '', b = '']) => {
      const pixels = async (src: string) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext('2d');
        g?.drawImage(img, 0, 0);
        return g?.getImageData(0, 0, c.width, c.height).data ?? new Uint8ClampedArray();
      };
      const [p, q] = [await pixels(a), await pixels(b)];
      if (p.length !== q.length) return -1;
      let n = 0;
      for (let i = 0; i < p.length; i += 4) if (p[i] !== q[i] || p[i + 1] !== q[i + 1] || p[i + 2] !== q[i + 2]) n++;
      return n;
    },
    [a, b],
  );

await check('a build’s picture of a screen with planned cards over it is the same as with no plan', async () => {
  await page.evaluate(r => window.__fenmyr.answerMyra(r, 'q'), OVER);
  await settle(page, 800);
  const r = await look(),
    over = await page.evaluate(
      r =>
        [...document.querySelectorAll('#planPreview .pp-box')].filter(b => {
          const q = b.getBoundingClientRect();
          return q.left < r.x + r.w && q.right > r.x && q.top < r.y + r.h && q.bottom > r.y;
        }).length,
      r,
    );
  assert.strictEqual(over, 6, 'six boxes are over the screen');
  const waiting = await capture(r);
  assert.strictEqual(await shown(), 'visible', 'the preview shows again after');
  await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#mActs button')].find(b => b.textContent === 'Cancel')?.click(),
  );
  await settle(page, 400);
  assert.strictEqual(await page.locator('#planPreview .pp-box').count(), 0, 'the plan is cancelled');
  assert.strictEqual(await differing(waiting, await capture(await look())), 0, 'no pixel differs');
});

await check('every export is taken while the preview is hidden', async () => {
  await page.evaluate(r => window.__fenmyr.answerMyra(r, 'q'), OVER);
  await settle(page, 800);
  await look();
  // At the moment the host takes each picture it reads how the preview shows; the save dialog is cancelled.
  await app.evaluate(({ BrowserWindow, dialog }) => {
    const [win] = BrowserWindow.getAllWindows(),
      wc = win?.webContents,
      seen: string[] = [];
    if (!wc) return;
    Reflect.set(globalThis, 'seenAtCapture', seen);
    const preview = async () =>
      seen.push(await wc.executeJavaScript(`getComputedStyle(document.getElementById('planPreview')).visibility`));
    const dbg = wc.debugger,
      send = dbg.sendCommand.bind(dbg),
      capturePage = wc.capturePage.bind(wc);
    Reflect.set(dbg, 'sendCommand', async (method: string, params?: object) => {
      if (method === 'Page.captureScreenshot') await preview();
      return send(method, params);
    });
    Reflect.set(wc, 'capturePage', async (rect?: Electron.Rectangle) => {
      await preview();
      return capturePage(rect);
    });
    Reflect.set(dialog, 'showSaveDialog', async () => ({ canceled: true, filePath: '' }));
  });
  const empty = await page.evaluate(() => {
      for (let y = 120; y < 800; y += 20)
        for (let x = 300; x < 1100; x += 20) if (document.elementFromPoint(x, y)?.id === 'stage') return { x, y };
      return null;
    }),
    f1 = await page.locator('#cards .card[data-id="f1"]').boundingBox();
  assert(empty && f1, 'an empty spot and a card to right-click');
  for (const [x, y, label] of [
    [empty.x, empty.y, 'Export board as image'],
    [empty.x, empty.y, 'Export board as PDF'],
    [f1.x + 40, f1.y + 40, 'Export as image'],
    [f1.x + 40, f1.y + 40, 'Export as PDF'],
  ] as const) {
    await page.mouse.click(x, y, { button: 'right' });
    await page.locator('#rowMenu button', { hasText: label }).click();
    // An export zooms the board to fit until its picture is taken, over a second on a slow machine, and the next
    // right-click must land on the board as it was.
    await page.waitForFunction(() => !document.body.classList.contains('exporting'));
    await settle(page, 300);
  }
  assert.deepStrictEqual(await app.evaluate(() => Reflect.get(globalThis, 'seenAtCapture')), [
    'hidden',
    'hidden',
    'hidden',
    'hidden',
  ]);
  assert.strictEqual(await shown(), 'visible', 'and it shows again after');
});

const errors = [...l.errors];
await l.close();
assert.deepStrictEqual(errors, [], 'no page errors');
if (failed.length) {
  console.log(`\n${failed.length} failed`);
  process.exit(1);
}
console.log('PLAN PICTURES OK');
