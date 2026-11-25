// The empty-screen hint and the picker's grid, for the keys, the eye and pictures. A screen hides its hint while its
// picker is open, and Esc brings it back with focus on it. A picture the app takes shows neither the hint nor the picker.
// The grid is one stop for Tab in both views. With the eraser in hand or Space held, a press on Add pieces is a press
// on the board. Add pieces reads clearly on every fill the bar offers, light and dark.
import assert from 'node:assert';
import { calm } from './support/calm.ts';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';
import { pictureWhenStill } from './support/stillPicture.ts';

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

const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const hints = () =>
  page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#screenHints [data-hint]')].map(b => b.dataset.hint));
const open = () => page.evaluate(() => !document.getElementById('piecePick')?.hidden);
const focused = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (!(a instanceof HTMLElement)) return '';
    return (
      a.dataset.hint ??
      a.dataset.pkPiece ??
      a.dataset.pkIcon ??
      a.dataset.pkTool ??
      (a.closest('#piecePick') ? a.id || 'picker' : 'outside')
    );
  });
const middle = async (sel: string) => {
  const b = await page.locator(sel).boundingBox();
  if (!b) throw new Error(`no ${sel}`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const view = () => page.evaluate(() => ({ ...window.__fenmyr.view }));
// Add pieces' words against what is behind them, the screen's fill showing through wherever the button lets it
const contrast = () =>
  page.evaluate(() => {
    const g = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const rgba = (css: string) => {
      if (!g) return [0, 0, 0, 0];
      g.clearRect(0, 0, 1, 1);
      g.fillStyle = css;
      g.fillRect(0, 0, 1, 1);
      const [r = 0, gr = 0, b = 0, a = 0] = g.getImageData(0, 0, 1, 1).data;
      return [r, gr, b, a / 255];
    };
    const over = (top: number[], under: number[]) =>
      top.slice(0, 3).map((v, i) => v * (top[3] ?? 1) + (under[i] ?? 0) * (1 - (top[3] ?? 1)));
    const lum = (c: number[]) => {
      const [r = 0, gr = 0, b = 0] = c.map(v =>
        v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4,
      );
      return 0.2126 * r + 0.7152 * gr + 0.0722 * b;
    };
    const button = document.querySelector('#screenHints [data-hint="two"]'),
      body = document.querySelector('#cards [data-id="two"] .fr-body');
    if (!(button instanceof HTMLElement) || !body) return 0;
    const board = [document.getElementById('stage'), document.body, document.documentElement]
        .map(e => rgba(e ? getComputedStyle(e).backgroundColor : ''))
        .find(c => (c[3] ?? 0) > 0) ?? [255, 255, 255, 1],
      fill = over(rgba(getComputedStyle(body).backgroundColor), [...board.slice(0, 3), 1]),
      behind = over(rgba(getComputedStyle(button).backgroundColor), fill),
      words = over(rgba(getComputedStyle(button).color), behind),
      [hi, lo] = [lum(words), lum(behind)].sort((a, b) => b - a);
    return Math.round((((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)) * 10) / 10;
  });

try {
  await page.evaluate(() => {
    Object.assign(window.__fenmyr.view, { x: 300, y: 60, z: 0.6 });
    window.__fenmyr.applyView();
  });
  await calm(page);

  await page.click('#screenHints [data-hint="one"]');
  await calm(page);
  const whileOpen = await hints();
  await page.keyboard.press('Escape');
  await frames();
  assert.deepStrictEqual(
    [whileOpen, await open(), await hints(), await focused()],
    [['two'], false, ['one', 'two'], 'one'],
    'while its picker is open a screen hides its hint, and Esc brings it back with focus on it',
  );

  await page.click('#screenHints [data-hint="one"]');
  await calm(page);
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
  await pictureWhenStill(app);
  const two = await page.locator('#cards [data-id="two"]').boundingBox();
  if (!two) throw new Error('no screen two');
  await page.evaluate(r => window.Fenmyr.captureArea(r), { x: two.x, y: two.y, w: two.width, h: 400 });
  await still(page);
  const after = await page.evaluate(() =>
    ['screenHints', 'piecePick'].map(id => getComputedStyle(document.getElementById(id) ?? document.body).visibility),
  );
  assert.deepStrictEqual(
    [await app.evaluate(() => Reflect.get(globalThis, 'seenAtCapture')), after, await hints(), await open()],
    [['hidden hidden'], ['visible', 'visible'], ['two'], true],
    'a picture of a screen, as a build takes it, shows neither the hint nor the picker, and both show again after',
  );

  await page.focus('#pkSearch');
  await page.keyboard.press('Tab');
  const fromSearch = await focused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const moved = await focused();
  await page.keyboard.press('Tab');
  const fromHeading = await focused();
  await page.click('#piecePick [data-pk-view="icons"]');
  await page.focus('#pkGrid [data-pk-icon="heart"]');
  await page.keyboard.press('Tab');
  const fromIcon = await focused();
  await page.focus('#pkGrid [data-pk-icon="heart"]');
  await page.keyboard.press('Shift+Tab');
  assert.deepStrictEqual(
    [fromSearch, moved, fromHeading, fromIcon, await focused()],
    ['box', 'Heading', 'outside', 'outside', 'pkSearch'],
    'Tab from the search lands on the grid, the arrows move in it, and Tab or Shift+Tab leaves it in one press',
  );
  await page.click('#piecePick [data-pk-close]');
  await still(page);

  await page.keyboard.press('p');
  await still(page);
  await page.click('#drawbar [data-pen="eraser"]');
  await still(page);
  const hint = await middle('#screenHints [data-hint="two"]');
  await page.mouse.click(hint.x, hint.y);
  await still(page);
  const erasing = await open();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await still(page);
  const v0 = await view();
  await page.mouse.move(hint.x, hint.y);
  await page.keyboard.down('Space');
  await still(page);
  await page.mouse.down();
  await page.mouse.move(hint.x + 150, hint.y + 80, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  await calm(page);
  const v1 = await view();
  assert.deepStrictEqual(
    [erasing, Math.round(v1.x - v0.x), Math.round(v1.y - v0.y)],
    [false, 150, 80],
    'with the eraser in hand a press on Add pieces opens nothing, and with Space held a drag from it pans the board',
  );

  await page.evaluate(() => window.__fenmyr.selectOnly(['two']));
  await still(page);
  // the picker that selecting it opened hides its hint
  await page.keyboard.press('Escape');
  // away from the hint, so it is read as it rests rather than under the pointer
  await page.mouse.move(700, 880);
  await still(page);
  const fills = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#selbar [data-bfill]')].map(b => b.dataset.bfill ?? ''),
  );
  const low: string[] = [];
  for (const theme of ['light', 'dark']) {
    await page.evaluate(dark => document.body.classList.toggle('dark', dark), theme === 'dark');
    for (const f of fills) {
      await page.evaluate(f => document.querySelector<HTMLElement>(`#selbar [data-bfill="${f}"]`)?.click(), f);
      await still(page);
      const c = await contrast();
      if (c < 4.5) low.push(`${theme} ${f}: ${c}`);
    }
  }
  assert.deepStrictEqual(
    [fills.length > 10, low],
    [true, []],
    'Add pieces reads at 4.5 to 1 or better on every fill the bar offers, light and dark',
  );
  assert.deepStrictEqual(l.errors, [], 'no errors');
  console.log('PIECE PICK ACCESS OK');
} finally {
  await l.close();
}
