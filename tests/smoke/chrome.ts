import fs from 'node:fs';
import path from 'node:path';
import type { Smoke } from './kit.ts';

// shortcut labels are written with the Mac symbols and read Ctrl+ here (so a Mac shows ⌘); Ctrl+, opens Settings even while typing
export async function shortcutLabels(t: Smoke) {
  const { page } = t;
  const keys = await page.evaluate(() =>
      window.__t
        .all('#keys kbd, #cleanBack kbd')
        .map(k => k.textContent)
        .join(' | '),
    ),
    src = fs.readFileSync(path.join(import.meta.dirname, '../../web/index.html'), 'utf8');
  await page.click('#capInput', { force: true }).catch(() => {});
  await page.evaluate(() => {
    const i = document.createElement('input');
    i.id = 'tmpTyping';
    document.body.appendChild(i);
    i.focus();
  });
  await page.keyboard.press('Control+,');
  await page.waitForTimeout(400);
  const opened = await page.evaluate(() => window.__t.el('#settings').classList.contains('on'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.evaluate(() => document.getElementById('tmpTyping')?.remove());
  t.checkAll('keysMac', {
    read: /Ctrl\+K/.test(keys) && /Ctrl\+F/.test(keys) && /Ctrl\+\\/.test(keys),
    sourceMac: !/<kbd>Ctrl/.test(src) && /<kbd>⌘K<\/kbd>/.test(src),
    settingsKey: opened,
  });
}

const ID_OF: Record<string, string> = { Alpha: 'oa', Bravo: 'ob', Charlie: 'oc' };

// dragging a board between two rows puts it there (and the order is kept in the folders file, not in the boards)
export async function boardOrder(t: Smoke) {
  const { page } = t;
  await page.evaluate(async () => {
    for (const [id, name] of [
      ['oa', 'Alpha'],
      ['ob', 'Bravo'],
      ['oc', 'Charlie'],
    ])
      await Fenmyr.save({ id: id ?? '', name, folder: 'of', cards: [], links: [] });
    await Fenmyr.saveFolders({ projects: [], folders: [{ id: 'of', name: 'Order folder', open: true }] });
    await window.__fenmyr.refreshBoards();
  });
  const row = (n: string) => page.locator('.board-row', { hasText: n }).first(),
    names = () => page.evaluate(() => window.__fenmyr.boardsOf('of'));
  // with no order saved yet the newest board comes first, so the expectations follow whatever order this is
  const before = await names(),
    [first = '', middle = '', last = ''] = before;
  await row(last).dragTo(row(first), { targetPosition: { x: 40, y: 3 } }); // onto the top edge: just before it
  await page.waitForTimeout(500);
  const after = await names(),
    kept = await page.evaluate(async () => {
      const l: unknown = await Fenmyr.folders(),
        order = l && typeof l === 'object' && 'order' in l ? l.order : undefined,
        of = order && typeof order === 'object' && 'of' in order ? order.of : [];
      return JSON.stringify(of);
    });
  await row(first).dragTo(row(middle), { targetPosition: { x: 40, y: 26 } }); // onto the bottom edge: just after it
  await page.waitForTimeout(500);
  const after2 = await names();
  t.checkAll('boardOrder', {
    before: before.length === 3,
    toTop: after.join() === [last, first, middle].join(),
    after: after2.join() === [last, middle, first].join(),
    saved: kept === JSON.stringify([last, first, middle].map(n => ID_OF[n])),
  });
  await page.evaluate(async () => {
    for (const id of ['oa', 'ob', 'oc']) await Fenmyr.remove(id);
    await Fenmyr.saveFolders({ projects: [], folders: [] });
    await window.__fenmyr.refreshBoards();
  });
}

// toolbar popups close on a click anywhere else (shapes, stamps, templates), the zoom and ··· menus too, and Esc closes a menu
export async function popups(t: Smoke) {
  const { page } = t,
    on = (id: string) => page.evaluate(i => window.__t.el(`#${i}`).classList.contains('on'), id),
    menuOpen = () => page.evaluate(() => !!document.getElementById('rowMenu')),
    res: Record<string, boolean> = {};
  for (const [tool, pick] of [
    ['shape', 'shapePick'],
    ['tpl', 'tplPick'],
    ['stamp', 'stampWheel'],
  ] as const) {
    await page.locator(`#tools > [data-add="${tool}"]`).click();
    await page.waitForTimeout(300);
    const was = await on(pick);
    await page.mouse.click(700, 420);
    await page.waitForTimeout(300);
    res[tool] = was && !(await on(pick));
  }
  await page.locator('#zoom').click();
  await page.waitForTimeout(200);
  const menu = await menuOpen();
  await page.mouse.click(700, 420);
  await page.waitForTimeout(200);
  const gone = !(await menuOpen());
  await page.locator('#zoom').click();
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  t.checkAll('popups', { ...res, zoomMenu: menu && gone, escMenu: !(await menuOpen()) });
}

// at the window edge and over the top-left strip the system cursor comes back (and the app's own cursor steps aside); anywhere else it is the app's own
export async function cursorEdge(t: Smoke) {
  const { page } = t;
  const at = async (px: number, py: number) => {
    await page.mouse.move(px + 2, py + 2);
    await page.mouse.move(px, py);
    await page.waitForTimeout(120);
    return page.evaluate(() => ({
      edge: document.body.classList.contains('cur-edge'),
      hidden: window.__t.el('body > .mcur').classList.contains('hide'),
    }));
  };
  const corner = await at(4, 4),
    strip = await at(150, 20),
    board = await at(700, 420),
    side = await at(1436, 400);
  await page.mouse.move(700, 420);
  t.checkAll('cursorEdge', {
    fancy: await page.evaluate(() => document.body.classList.contains('fancy-cursor')),
    corner: corner.edge && corner.hidden,
    strip: strip.edge && strip.hidden,
    side: side.edge && side.hidden,
    board: !board.edge && !board.hidden,
  });
}

// search and text fields get a clear (x) button; the wireframe search stays visible while the palette scrolls
export async function clearButtons(t: Smoke) {
  const { page } = t,
    vis = () => page.evaluate(() => !document.getElementById('clrBtn')?.hidden && !!document.getElementById('clrBtn')),
    pieces = () =>
      page.evaluate(
        () => window.__t.all('.dz-body [data-wf], .dz-body [data-piece]').filter(b => b.offsetParent).length,
      );
  await page.keyboard.press('Escape');
  await page.mouse.click(700, 420);
  await page.waitForTimeout(150);
  await page.locator('#dzSearch').click();
  await page.waitForTimeout(150);
  const empty = await vis();
  await page.keyboard.type('box');
  await page.waitForTimeout(150);
  const shown = await vis(),
    hits = await pieces();
  await page.locator('#clrBtn').click();
  await page.waitForTimeout(150);
  const value = await page.evaluate(() => window.__t.input('#dzSearch').value),
    focus = await page.evaluate(() => document.activeElement?.id === 'dzSearch'),
    after = await pieces();
  const sticky = await page.evaluate(async () => {
    const T = window.__t,
      body = T.el('#design .dz-body');
    body.scrollTop = 400;
    await T.wait(100);
    const a = T.el('#design .dz-search').getBoundingClientRect(),
      b = body.getBoundingClientRect(),
      res = { scrolled: body.scrollTop > 100, atTop: Math.abs(a.top - b.top) < 3 };
    body.scrollTop = 0;
    return res;
  });
  await page.locator('#mcInput').evaluate(el => {
    el.closest('.m-chat')?.classList.add('on');
  });
  await page.mouse.move(5, 400);
  await page.keyboard.press('Escape');
  t.checkAll('clearBtn', {
    hiddenWhenEmpty: !empty,
    showsWithText: shown,
    clears: value === '' && focus && after > hits,
    sticky: sticky.scrolled && sticky.atTop,
  });
}

// the height grips: the pointer shows the system's resize cursor over them, and the bar swells into a peak on hover
export async function heightGrips(t: Smoke) {
  const { page } = t;
  const g = await page.locator('.rz-grip').first().boundingBox(),
    h = () =>
      page.evaluate(() => {
        const p = document.querySelector('.rz-grip path');
        return p instanceof SVGGraphicsElement ? p.getBBox().height : 0;
      }),
    cursorClass = (c: string) => page.evaluate(c => window.__t.el('body > .mcur').classList.contains(c), c);
  if (!g) throw new Error('no height grip');
  const rest = await h();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.waitForTimeout(900);
  const hot = await h(),
    own = await cursorClass('rsz');
  await page.mouse.move(5, 400);
  await page.waitForTimeout(900);
  const dz = page.locator('.rz-grip[data-panel="design"]'),
    d0 = await dz.boundingBox();
  if (!d0) throw new Error('no design panel grip');
  await page.mouse.move(d0.x + d0.width / 2, d0.y + 6);
  await page.mouse.down();
  await page.mouse.move(d0.x + d0.width / 2, d0.y + 6 + 30, { steps: 5 });
  await page.waitForTimeout(150);
  const d1 = await dz.boundingBox(),
    sized = await page.evaluate(() => window.__t.el('#design').classList.contains('sized'));
  await page.mouse.up();
  await page.mouse.move(d0.x + d0.width / 2, d0.y + 36);
  await page.mouse.down();
  await page.mouse.move(d0.x + d0.width / 2, d0.y + 760, { steps: 12 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  const trayIn = await page.evaluate(() => {
    const b = window.__t.el('#tray').getBoundingClientRect();
    return b.height >= 140 && b.bottom <= innerHeight;
  });
  await dz.dblclick();
  await page.mouse.move(5, 400);
  await page.waitForTimeout(900); // (double-click gives the height back to automatic)
  // the card resize corner, shown on its own: the pointer turns into a diagonal resize cursor over it
  const was = await page.evaluate(() => {
    const rh = window.__t.el('#rh'),
      was = rh.getAttribute('style');
    rh.style.cssText += ';display:block;z-index:2147480000';
    return was;
  });
  const rb = await page.evaluate(() => {
    const b = window.__t.el('#rh').getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.mouse.move(rb.x - 3, rb.y - 3);
  await page.mouse.move(rb.x, rb.y);
  await page.waitForTimeout(300);
  await page.mouse.move(rb.x + 1, rb.y);
  await page.waitForTimeout(150);
  const cornerCursor = await page.evaluate(() => {
    const c = window.__t.el('body > .mcur');
    return c.classList.contains('rsz') && c.style.getPropertyValue('--rz') === '-45deg';
  });
  await page.evaluate(was => {
    const rh = window.__t.el('#rh');
    if (was === null) rh.removeAttribute('style');
    else rh.setAttribute('style', was);
  }, was);
  await page.mouse.move(5, 400);
  t.checkAll('grip', {
    cursor: own,
    cornerCursor,
    peaks: hot > rest + 5,
    settles: Math.abs((await h()) - rest) < 0.5,
    follows: !!d1 && Math.abs(d1.y - d0.y - 30) < 3,
    sized,
    unsortedStays: trayIn,
  });
}
