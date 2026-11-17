// A picture the app takes of its window, as a build takes one of a screen, shows neither the empty-screen hint nor the
// Pieces picker, and both show again after.
import assert from 'node:assert';
import { launch, settle } from './support/launch.ts';

const screen = (id: string, x: number, name: string) => ({
  id,
  type: 'frame',
  x,
  y: 0,
  w: 393,
  h: 852,
  r: 0,
  device: 'iPhone',
  radius: 44,
  name,
  fill: '#ffffff',
});
const l = await launch({
  boards: [{ id: 'a', name: 'a', cards: [screen('one', 0, 'One'), screen('two', 900, 'Two')], links: [], tray: [] }],
  open: 'a',
});
const { page, app } = l;

const open = () => page.evaluate(() => !document.getElementById('piecePick')?.hidden);
try {
  await settle(page, 800);
  await page.evaluate(() => {
    Object.assign(window.__fenmyr.view, { x: 300, y: 60, z: 0.6 });
    window.__fenmyr.applyView();
  });
  await settle(page, 400);

  await page.click('#screenHints [data-hint="one"]');
  await settle(page, 300);
  await app.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0]?.webContents;
    if (!wc) return;
    const seen: string[] = [],
      capturePage = wc.capturePage.bind(wc);
    Reflect.set(globalThis, 'seenAtCapture', seen);
    Reflect.set(wc, 'capturePage', async (rect?: Electron.Rectangle) => {
      seen.push(
        await wc.executeJavaScript(
          `['screenHints', 'piecePick'].map(id => getComputedStyle(document.getElementById(id)).visibility).join(' ')`,
        ),
      );
      return capturePage(rect);
    });
  });
  const two = await page.locator('#cards [data-id="two"]').boundingBox();
  if (!two) throw new Error('no screen two');
  await page.evaluate(r => window.Fenmyr.captureArea(r), { x: two.x, y: two.y, w: two.width, h: 400 });
  const after = await page.evaluate(() =>
    ['screenHints', 'piecePick'].map(id => getComputedStyle(document.getElementById(id) ?? document.body).visibility),
  );
  assert.deepStrictEqual(
    [await app.evaluate(() => Reflect.get(globalThis, 'seenAtCapture')), after, await open()],
    [['hidden hidden'], ['visible', 'visible'], true],
    'a picture of a screen, as a build takes it, shows neither the hint nor the picker, and both show again after',
  );

  assert.deepStrictEqual(l.errors, [], 'no errors');
  console.log('PIECE PICK ACCESS OK');
} finally {
  await l.close();
}
