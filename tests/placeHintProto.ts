// The hint that opens when a tool is picked ("Click the board to place it") is seen on every board. On a normal board it is at
// the top centre of the window; on a prototype board the window's centre is over the Preview pane, whose header covered it, so
// it sits at the top centre of the board pane, below that pane's header. The check is on screen: the pixel under its edge
// has to be the hint's own colour.
import assert from 'node:assert';
import type { Page } from 'playwright';
import { launch } from './support/launch.ts';
import { installPaint } from './support/paint.ts';
import { freshRepo, openPrototype } from './support/prototype.ts';

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'butter', text: 'A note' },
  board = { id: 'b', name: 'B', cards: [note], links: [], tray: [] };
const { repo } = freshRepo('fenmyr-hint-');
const l = await launch({ boards: [board], open: 'b' });

// where the hint, the board's pane and the pane's header are, and the colour it paints
const look = (page: Page) =>
  page.evaluate(() => {
    const box = (el: Element | null) => {
      const r = el?.getBoundingClientRect();
      return r ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null;
    };
    const hint = document.getElementById('placeHint');
    return {
      hint: box(hint),
      shown: !!hint && !hint.hidden && getComputedStyle(hint).display !== 'none',
      fill: hint ? getComputedStyle(hint).backgroundColor : '',
      stage: box(document.getElementById('stage')),
      head: box(document.querySelector('[data-p="canvas"] .pr-head')),
      window: [innerWidth, innerHeight],
    };
  });

// the pixel on screen at a point, read back through a canvas
const pixelAt = async (page: Page, x: number, y: number) => {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  return page.evaluate(async s => {
    const img = new Image();
    img.src = `data:image/png;base64,${s}`;
    await img.decode();
    const c = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }),
      ctx = c.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.drawImage(img, 0, 0);
    return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
  }, png.toString('base64'));
};
const sameColour = async (page: Page, css: string, got: number[]) => {
  const want = await page.evaluate(c => window.__paint(c).slice(0, 3), css);
  return want.every((v, i) => Math.abs(v - (got[i] ?? -99)) <= 2);
};

try {
  const { page } = l;
  await installPaint(page);

  // a normal board: top centre of the window, as before
  await page.click('#tools [data-add="note"]');
  await page.waitForTimeout(400);
  let s = await look(page);
  assert.ok(s.shown && s.hint, 'the hint is shown on a normal board');
  assert.ok(
    Math.abs((s.hint.l + s.hint.r) / 2 - (s.window[0] ?? 0) / 2) <= 2,
    `a normal board's hint is centred on the window, at ${(s.hint.l + s.hint.r) / 2}`,
  );
  assert.strictEqual(Math.round(s.hint.t), 16, 'and 16 px from the top, as it always was');
  await page.keyboard.press('Escape');

  // a prototype board
  await openPrototype(page, repo);
  await l.app.context().addInitScript(() => {
    try {
      localStorage.setItem('fenmyr:last', 'pb');
    } catch {}
  });
  await page.reload();
  await page.waitForFunction(() => window.__fenmyr?.curBoard()?.id === 'pb');
  await page.waitForTimeout(1200);
  await installPaint(page);
  await page.click('#tools [data-add="note"]');
  await page.waitForTimeout(400);
  // in the board pane as the window has it (the other panes narrow it), and with the Code pane folded so the pane is wide
  const inPane = async (what: string) => {
    const s = await look(page);
    assert.ok(s.shown && s.hint && s.stage && s.head, `${what}: the hint is shown, with its pane and header`);
    assert.ok(
      s.hint.l >= s.stage.l && s.hint.r <= s.stage.r,
      `${what}: the hint is inside the board pane: ${s.hint.l} to ${s.hint.r} in ${s.stage.l} to ${s.stage.r}`,
    );
    assert.ok(
      Math.abs((s.hint.l + s.hint.r) / 2 - (s.stage.l + s.stage.r) / 2) <= 2,
      `${what}: and centred on it, at ${(s.hint.l + s.hint.r) / 2} in a pane centred at ${(s.stage.l + s.stage.r) / 2}`,
    );
    assert.ok(
      s.hint.t >= s.head.b,
      `${what}: and below the pane's header: it starts at ${s.hint.t}, the header ends at ${s.head.b}`,
    );
    const edge = await pixelAt(page, Math.round(s.hint.l) + 6, Math.round((s.hint.t + s.hint.b) / 2));
    assert.ok(
      await sameColour(page, s.fill, edge),
      `${what}: the pixel at the hint's edge is its own colour (${s.fill}), not what covers it: rgb(${edge.join(', ')})`,
    );
    return s.stage.r - s.stage.l;
  };
  const narrow = await inPane('a narrow board pane');
  await page.click('[data-fold="code"]');
  await page.waitForTimeout(900);
  const wide = await inPane('a wide board pane');
  assert.ok(wide > narrow, `folding the Code pane widened the board pane, ${narrow} to ${wide} px`);
  assert.deepStrictEqual(l.errors, [], 'no page errors');
  console.log('placeHintProto: ok');
} finally {
  await l.close();
}
