// The bottom bar (Myra's box) and the tools panel, where they sit and what they do: on top of what they
// meet, hidden for clean mode, export, a doc and Home as each needs, pictures dropped on them landing on the board,
// the wheel over them panning, their place in Tab order, and a phone's strips leaving the bar when the window widens.
import assert from 'node:assert';
import { near, openBar } from './support/bar.ts';
import { still } from './support/settled.ts';

const { l, page, frames, view, check, done } = await openBar();
// --lag delays every visibility change. The app means two of them to be at once: her input shows as the chat opens, for
// the focus it gives it, and the bar and tools hide as an export starts, which waits 150 ms for them to go.
if (process.env.FENMYR_MOTION_DELAY)
  await page.addStyleTag({
    content:
      '#myra.chat #mChat, #myra.chat #mChat *, body.exporting #dock, body.exporting #tools { transition-delay: 0s !important; }',
  });
const size = async (w: number, h = 900) => {
  await l.app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]?.setSize(s.w, s.h), { w, h });
  await page.waitForFunction(s => innerWidth === s.w && innerHeight === s.h, { w, h });
  await still(page);
};
const chat = async (open: boolean) => {
  await page.click(open ? '#mPill' : '#mcClose');
  await page.waitForFunction(o => !!document.getElementById('myra')?.classList.contains('chat') === o, open);
  await still(page);
};
const home = async (open: boolean) => {
  await page.click(open ? '#homeBtn' : '#homeClose');
  await page.waitForFunction(o => !!document.getElementById('stage')?.classList.contains('at-home') === o, open);
  await still(page);
};
// the bar's parts, whether each shows, and whether a press at its middle reaches it
const bar = () =>
  page.evaluate(() => {
    const part = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect(),
        hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      return {
        l: r.left,
        t: r.top,
        r: r.right,
        b: r.bottom,
        shown: el.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
        hit: !!hit && el.contains(hit),
      };
    };
    const panels = [...(document.getElementById('side')?.children ?? [])].filter(c => c.checkVisibility());
    return {
      dock: part(document.getElementById('dock')),
      tools: part(document.getElementById('tools')),
      firstTool: part(document.querySelector('#tools [data-add="pointer"]')),
      pill: part(document.getElementById('mPill')),
      leftWidgets: Math.max(...panels.map(p => p.getBoundingClientRect().right)),
      w: innerWidth,
      h: innerHeight,
    };
  });
const viewNow = () => page.evaluate(() => ({ ...window.__fenmyr.view }));
const cardCount = () => page.evaluate(() => window.__fenmyr.board.cards.length);
// a picture dropped at the middle of an element, as a file from the desktop arrives
const dropPicture = (selector: string) =>
  page.evaluate(async selector => {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`no ${selector}`);
    const c = Object.assign(document.createElement('canvas'), { width: 8, height: 8 });
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/png'));
    if (!blob) throw new Error('no picture');
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'dropped.png', { type: 'image/png' }));
    const r = el.getBoundingClientRect(),
      at = { clientX: (r.left + r.right) / 2, clientY: (r.top + r.bottom) / 2, bubbles: true, cancelable: true };
    const over = new DragEvent('dragover', { ...at, dataTransfer: dt });
    el.dispatchEvent(over);
    el.dispatchEvent(new DragEvent('drop', { ...at, dataTransfer: dt }));
    return over.defaultPrevented;
  }, selector);
// the part of the window focus is in, or the focused element
const focusedIn = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (!(a instanceof HTMLElement)) return '';
    return a.closest('#home, #side, #sideR, #cards, #stampWheel')?.id || a.id || a.className;
  });

await check('Myra’s box is the whole bar, 18 px over the window’s bottom and centred', async () => {
  const b = await bar();
  assert.ok(b.pill && b.dock, 'the bar is up');
  near(b.pill.b, b.h - 18, 'her box’s bottom');
  near(b.dock.l, b.pill.l, 'the bar starts where her box does');
  near(b.dock.r, b.pill.r, 'and ends where it ends');
  near((b.dock.l + b.dock.r) / 2, b.w / 2, 'the middle of the bar, on the window’s');
});
await check('the bar starts right of the left widgets', async () => {
  const b = await bar();
  assert.ok(b.dock && b.dock.l >= b.leftWidgets + 14, `the bar starts at ${b.dock?.l}`);
});
await check('a press on the first tool or on Myra’s box reaches it', async () => {
  const b = await bar();
  assert.ok(b.firstTool?.hit && b.pill?.hit, 'the first tool and her box take a press');
});
for (const w of [1440, 1100, 1000]) {
  await check(`at ${w} px the bar ends inside the window`, async () => {
    await size(w);
    const b = await bar();
    assert.ok(b.dock && b.dock.r <= b.w - 16, `the bar ends at ${b.dock?.r} in a ${b.w} px window`);
    assert.ok(b.dock.l >= 16, `the bar starts at ${b.dock.l}`);
  });
}
await size(1440);

await check('clean mode hides the bar, and it comes back', async () => {
  await page.keyboard.press('Control+Backslash');
  await still(page);
  const hidden = await bar();
  await page.keyboard.press('Control+Backslash');
  await still(page);
  const back = await bar();
  assert.ok(!hidden.dock?.shown && !hidden.firstTool?.hit && !hidden.pill?.hit, 'hidden and out of reach');
  assert.ok(back.dock?.shown && back.firstTool?.hit, 'back and in reach');
});

await check('an exported picture leaves the bar and the tools out', async () => {
  await view(0, 0);
  await page.evaluate(() => {
    const f = window.Fenmyr;
    const real = f.exportRect;
    f.exportRect = async () => {
      document.body.dataset.barInExport = String(
        ['dock', 'tools'].some(id =>
          document.getElementById(id)?.checkVisibility({ visibilityProperty: true, opacityProperty: true }),
        ),
      );
      f.exportRect = real;
      return '';
    };
  });
  await page.mouse.click(700, 400, { button: 'right' });
  await page.locator('#rowMenu button', { hasText: 'Export board as image' }).click();
  await page.waitForFunction(() => document.body.dataset.barInExport !== undefined);
  await still(page);
  const [during, after] = await page.evaluate(() => [
    document.body.dataset.barInExport,
    !!document.getElementById('dock')?.checkVisibility({ visibilityProperty: true }),
  ]);
  assert.deepStrictEqual([during, after], ['false', true], 'hidden for the picture, back after');
});

await check('at Home the tools hide and Myra’s box stays', async () => {
  await home(true);
  const b = await bar();
  await home(false);
  assert.ok(!b.tools?.shown && b.pill?.shown && b.pill.hit, 'no tools, her box in reach');
});

await check('a picture dropped on the tools or Myra’s box lands on the board', async () => {
  for (const at of ['#tools [data-add="note"]', '#mPill']) {
    const before = await cardCount();
    const taken = await dropPicture(at);
    await page.waitForFunction(n => window.__fenmyr.board.cards.length > n, before, { timeout: 3000 });
    assert.ok(taken, `${at} takes the drag, so the window doesn't open the file`);
  }
});
await check('a picture dropped on Myra’s open chat lands on the board', async () => {
  await chat(true);
  const before = await cardCount();
  await dropPicture('#mcList');
  await page.waitForFunction(n => window.__fenmyr.board.cards.length > n, before, { timeout: 3000 });
  await chat(false);
});

await check('Myra’s open chat never meets a right widget: the column ends above it', async () => {
  // narrow enough that her joined chat reaches under the right column, tall enough for Unsorted above it
  await size(1100, 1080);
  await chat(true);
  const seen = await page.evaluate(() => {
    const chat = document.getElementById('mChat')?.getBoundingClientRect(),
      widgets = [...(document.getElementById('sideR')?.children ?? [])]
        .filter(c => c.checkVisibility())
        .map(c => c.getBoundingClientRect());
    if (!chat) return null;
    return {
      widgets: widgets.length,
      below: widgets.some(r => r.left < chat.right && r.right > chat.left),
      meets: widgets.some(
        r => r.left < chat.right && r.right > chat.left && r.bottom > chat.top && r.top < chat.bottom,
      ),
    };
  });
  await chat(false);
  await size(1440);
  assert.ok(seen && seen.widgets > 0, `a right widget shows: ${JSON.stringify(seen)}`);
  assert.ok(seen.below, 'the open chat sits below the right column');
  assert.ok(!seen.meets, 'and no widget reaches down to it');
});

await check('the wheel over the tools or Myra’s box pans the board', async () => {
  for (const at of ['#tools [data-add="note"]', '#mPill']) {
    await view(0, 0);
    const box = await page.locator(at).boundingBox();
    assert.ok(box, `${at} is up`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 120);
    await page.waitForFunction(() => window.__fenmyr.view.y === -120);
    assert.strictEqual((await viewNow()).y, -120, `the wheel over ${at} pans`);
  }
});
await check('the wheel over Myra’s open chat leaves the board still', async () => {
  await chat(true);
  await view(0, 0);
  const box = await page.locator('#mcList').boundingBox();
  assert.ok(box, 'her chat is open');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 120);
  await still(page);
  const y = (await viewNow()).y;
  await chat(false);
  assert.strictEqual(y, 0);
});

await check('a right-click on Myra’s box puts down what is being placed', async () => {
  await page.click('#tools [data-add="note"]');
  await page.click('#mPill', { button: 'right' });
  await frames();
  const placing = await page.evaluate(() => !!document.getElementById('ghost')?.classList.contains('on'));
  assert.ok(!placing, 'nothing is held');
});

await check('what is being placed shows over the bar', async () => {
  const tool = await page.locator('#tools [data-add="note"]').boundingBox();
  assert.ok(tool, 'the Note tool is up');
  await page.click('#tools [data-add="note"]');
  await page.mouse.move(tool.x + tool.width / 2, tool.y + tool.height / 2);
  await frames();
  // the ghost lets presses through, so for a moment it takes them, to see what is on top
  const top = await page.evaluate(
    ({ x, y }) => {
      const g = document.getElementById('ghost');
      if (!g) return 'no ghost';
      g.style.pointerEvents = 'auto';
      const el = document.elementFromPoint(x, y);
      g.style.pointerEvents = '';
      return el?.closest('#ghost') ? 'ghost' : (el?.closest('[data-add]')?.getAttribute('data-add') ?? 'nothing');
    },
    { x: tool.x + tool.width / 2 + 4, y: tool.y + tool.height / 2 + 4 },
  );
  await page.keyboard.press('Escape');
  assert.strictEqual(top, 'ghost');
});

await check(
  'Tab reaches the tools after the left widgets, then Myra’s box without opening her chat; Enter opens it, Esc returns to the box',
  async () => {
    if (await page.evaluate(() => !!document.getElementById('myra')?.classList.contains('chat'))) await chat(false);
    await page.focus('#tools [data-add="pointer"]');
    await page.keyboard.press('Shift+Tab');
    const before = await focusedIn();
    await page.focus('#tools [data-add="draw"]');
    await page.keyboard.press('Tab');
    const box = await focusedIn();
    const expanded = await page.getAttribute('#mPill', 'aria-expanded');
    await page.keyboard.press('Enter');
    const opened = await focusedIn();
    await page.keyboard.press('Escape');
    const back = await focusedIn();
    await page.keyboard.press('Tab');
    const after = await focusedIn();
    await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
    assert.deepStrictEqual(
      [before, box, expanded, opened, back, after],
      ['side', 'mPill', 'false', 'mcInput', 'mPill', 'cards'],
    );
  },
);

await check('with a doc open the tools and Myra’s box hide, and her chat shows over the doc', async () => {
  await page.evaluate(() => {
    window.__fenmyr.board.cards.push({
      id: 'doc',
      type: 'doc',
      x: 300,
      y: 300,
      w: 200,
      h: 260,
      r: 0,
      color: 'white',
      text: 'Plan',
    });
    window.__fenmyr.renderAll();
  });
  await view(0, 0);
  await page.locator('.card[data-id="doc"]').dblclick();
  await page.waitForFunction(() => document.getElementById('stage')?.classList.contains('doc-open'));
  await still(page);
  const b = await bar();
  assert.ok(!b.tools?.shown && !b.firstTool?.hit, 'the tools are hidden and out of reach');
  assert.ok(!b.pill?.shown && !b.pill?.hit, 'her box is hidden and out of reach');
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.keyboard.press('m');
  await page.waitForFunction(() => document.getElementById('myra')?.classList.contains('chat'));
  await still(page);
  const hit = await page.evaluate(() => {
    const el = document.getElementById('mcList'),
      r = el?.getBoundingClientRect();
    if (!r || !document.getElementById('stage')?.classList.contains('doc-open')) return 'the doc closed';
    const at = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    return at?.closest('#mChat') ? 'chat' : (at?.className ?? 'nothing');
  });
  assert.strictEqual(hit, 'chat');
});
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await still(page);

await check('on a phone the selection and mode strips join the bar, and leave it when the window widens', async () => {
  const wide = await bar();
  await size(600);
  const phone = await page.evaluate(() => ({
    phone: document.body.classList.contains('phone'),
    strips: ['selbar', 'modeCard'].map(id => document.getElementById(id)?.parentElement?.id),
  }));
  await size(1440);
  const back = await page.evaluate(() =>
    ['selbar', 'modeCard'].map(id => {
      const up = document.getElementById(id)?.parentElement;
      return up === document.body ? 'body' : up?.id;
    }),
  );
  const again = await bar();
  assert.deepStrictEqual(phone, { phone: true, strips: ['dock', 'dock'] }, 'in the bar on a phone');
  assert.deepStrictEqual(back, ['stage', 'body'], 'back on the board, and beside the tools');
  assert.deepStrictEqual(again.dock, wide.dock, 'the bar is back where it was');
});

await done('BOTTOM BAR OK');
