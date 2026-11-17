// The screen tool for a screen reader and a phone: which device chip, pen and Wireframe button is pressed, the row's role,
// how Myra's sees strip names a card called after its type, and the mode bar's strips and hint at 390 px wide.
import assert from 'node:assert';
import { launch, settle } from './support/launch.ts';

const far = { id: 'far', type: 'note', x: -4000, y: -4000, w: 220, h: 120, r: 0, color: 'white', text: 'far away' };
const frame = (id: string, x: number, name: string) => ({
  id,
  type: 'frame',
  x,
  y: 0,
  w: 393,
  h: 852,
  r: 0,
  name,
  device: 'iPhone',
  radius: 44,
  fill: '#ffffff',
});
const cards = [
  far,
  frame('plain', 0, 'Screen'),
  frame('named', 500, 'Sign in'),
  { id: 'note', type: 'note', x: 1000, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'Note' },
];
const l = await launch({
  boards: [{ id: 'b', name: 'Wire', cards, links: [], tray: [], view: { x: 0, y: 0, z: 0.25 } }],
  open: 'b',
});
const { page } = l;
const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const key = async (k: string) => {
  await page.keyboard.press(k);
  await frames();
};
const blur = () =>
  page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
const pressed = (sel: string) =>
  page.evaluate(
    sel =>
      [...document.querySelectorAll(sel)]
        .map(b => `${b.textContent || b.getAttribute('data-pen')}=${b.getAttribute('aria-pressed')}`)
        .join(' '),
    sel,
  );
const screenButton = () =>
  page.evaluate(() => document.querySelector('#tools [data-add="frame"]')?.getAttribute('aria-pressed'));
// the strip is drawn as the chat opens, so each card is selected first and the chat opened on it
const sees = async (id: string) => {
  await page.evaluate(id => window.__fenmyr.selectOnly([id]), id);
  await blur();
  await key('m');
  await settle(page, 400);
  const read = await page.evaluate(() => {
    const chip = document.querySelector('#mcSees .mcs-chip.sel'),
      x = chip?.querySelector('.mcs-x');
    return {
      label: chip?.querySelector('.mcs-t')?.textContent,
      tip: x?.getAttribute('title'),
      name: x?.getAttribute('aria-label'),
    };
  });
  await key('Escape');
  return read;
};
const box = (sel: string) =>
  page.evaluate(sel => {
    const e = document.querySelector(sel);
    if (!(e instanceof HTMLElement) || !e.checkVisibility()) return null;
    const r = e.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  }, sel);

try {
  await settle(page, 400);
  assert.strictEqual(await screenButton(), 'false', 'the bottom bar’s Wireframe button says it is not pressed');
  await key('w');
  assert.strictEqual(
    await pressed('#screenbar [data-dev]'),
    'iPhone=true Android=false iPad=false Desktop=false Watch=false',
    'W presses the iPhone chip and no other',
  );
  assert.strictEqual(await screenButton(), 'true', 'with the tool in hand the Wireframe button is pressed');
  await key('3');
  assert.strictEqual(
    await pressed('#screenbar [data-dev]'),
    'iPhone=false Android=false iPad=true Desktop=false Watch=false',
    '3 presses the iPad chip and no other',
  );
  assert.strictEqual(
    await page.getAttribute('#screenbar', 'role'),
    'group',
    'the row is a group, as Tab moves through its chips',
  );
  await key('Escape');
  assert.strictEqual(await screenButton(), 'false', 'Esc leaves the Wireframe button not pressed');

  await key('p');
  assert.strictEqual(
    await pressed('#drawbar [data-pen]'),
    'pen=true marker=false hi=false eraser=false',
    'P presses the pen',
  );
  await page.click('#drawbar [data-pen="marker"]');
  await frames();
  assert.strictEqual(
    await pressed('#drawbar [data-pen]'),
    'pen=false marker=true hi=false eraser=false',
    'the marker is pressed once picked',
  );
  await page.click('#drawbar [data-pen="pen"]');
  await key('Escape');

  const leave = (what: string) => `Leave ${what} out of the next message`;
  assert.deepStrictEqual(
    await sees('plain'),
    { label: 'Screen', tip: leave('Screen'), name: leave('Screen') },
    'a screen named Screen reads Screen once in the sees strip',
  );
  assert.deepStrictEqual(
    await sees('note'),
    { label: 'Note', tip: leave('Note'), name: leave('Note') },
    'a note that says Note reads Note once',
  );
  const named = '“Sign in”';
  assert.deepStrictEqual(
    await sees('named'),
    { label: `Screen · ${named}`, tip: leave(`Screen · ${named}`), name: leave(`Screen · ${named}`) },
    'a screen with its own name keeps it',
  );
  await page.evaluate(() => window.__fenmyr.selectOnly([]));
  await blur();

  await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(390, 844));
  await settle(page, 700);
  const width = await page.evaluate(() => innerWidth);
  await key('w');
  await settle(page, 300);
  const row = await box('#screenbar'),
    close = await box('#scX'),
    hint = await box('#placeHint'),
    title = await box('.board-name');
  assert.ok(
    row && row.left >= 0 && row.right <= width,
    `at 390 px the device row fits the window: ${JSON.stringify(row)}`,
  );
  assert.ok(row && close && close.right <= row.right, `and its × shows without scrolling: ${JSON.stringify(close)}`);
  assert.ok(
    hint && title && (hint.top >= title.bottom || hint.bottom <= title.top),
    `at 390 px the hint leaves the board title clear: ${JSON.stringify({ hint, title })}`,
  );
  await key('Escape');
  await key('p');
  await settle(page, 300);
  const pens = await box('#drawbar');
  assert.ok(
    pens && pens.left >= 0 && pens.right <= width,
    `at 390 px drawing's bar fits the window: ${JSON.stringify(pens)}`,
  );
  await key('Escape');
  assert.deepStrictEqual(l.errors, []);
  console.log('SCREEN ACCESS OK');
} finally {
  await l.close();
}
