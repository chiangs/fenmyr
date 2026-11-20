// Drawing's card and the Wireframe column left of the tools panel, and find's bar over the bottom bar: where each sits
// at 1920, 1440, 1100 and 1000 px wide, in a short window and on a prototype board; that neither covers or is covered
// by the panel, Unsorted, the header, Wireframe's hint, her chat, the selection bar or the Pieces picker; that --mode-h
// is find's lift alone; that her chat opening and closing moves neither; that the left of the panel shows one thing at
// a time; and that clean mode and an open doc hide the card.
import assert from 'node:assert';
import type { Page } from 'playwright';
import { type Edges, near, openBar } from './support/bar.ts';
import { launch, settle } from './support/launch.ts';
import { freshRepo, openPrototype } from './support/prototype.ts';

type Geo = Awaited<ReturnType<typeof geo>>;
// what shows, in window pixels: hidden, see-through and zero-sized things are null
const geo = (page: Page) =>
  page.evaluate(() => {
    const at = (el: Element | null | undefined) => {
      if (!(el instanceof HTMLElement) || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
        return null;
      const r = el.getBoundingClientRect();
      return r.width && r.height ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null;
    };
    const byId = (id: string) => document.getElementById(id);
    return {
      w: innerWidth,
      h: innerHeight,
      panel: at(byId('tools')),
      draw: at(byId('drawbar')),
      wire: at(byId('screenbar')),
      find: at(byId('findBar')),
      dock: at(byId('dock')),
      tray: at(byId('tray')),
      hint: at(byId('placeHint')),
      head: [at(document.querySelector('.top')), at(byId('saved'))].filter(e => e !== null),
      chat: byId('myra')?.classList.contains('chat') ? at(byId('mChat')) : null,
      selbar: at(byId('selbar')),
      pick: at(byId('piecePick')),
      slot: ['drawbar', 'screenbar', 'shapePick', 'tplPick', 'stampWheel', 'stampPick', 'rowMenu'].filter(
        id => at(byId(id)) !== null,
      ),
      modeH: document.body.style.getPropertyValue('--mode-h'),
    };
  });
const overlaps = (a: Edges | null, b: Edges | null) => !!a && !!b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
const middle = (e: Edges) => (e.l + e.r) / 2;
const show = (e: Edges | null) => JSON.stringify(e);

// beside the panel: 12 px left of it, level with its top unless its column would cover the header or the hint, then
// 12 px under them; no wider than 200 px, inside the window, and clear of the panel, Unsorted, the header and the hint
function besidePanel(g: Geo, card: Edges | null, what: string) {
  assert.ok(card && g.panel, `${what} and the panel are up`);
  near(card.r, g.panel.l - 12, `${what}’s right`);
  const above = [...g.head, g.hint].filter((e): e is Edges => !!e && e.l < card.r && e.r > card.l),
    top = Math.max(g.panel.t, ...above.map(e => e.b + 12));
  near(card.t, top, `${what}’s top`);
  assert.ok(card.r - card.l <= 200, `${what} is ${card.r - card.l} px wide`);
  assert.ok(card.l >= 0 && card.t >= 0 && card.r <= g.w && card.b <= g.h, `${what} ${show(card)} is in the window`);
  for (const [name, e] of [
    ['the panel', g.panel],
    ['Unsorted', g.tray],
    ['the hint', g.hint],
    ['the bottom bar', g.dock],
    ...g.head.map(e => ['the header', e] as const),
  ] as const)
    assert.ok(!overlaps(card, e), `${what} ${show(card)} meets ${name} ${show(e)}`);
}

const { l, page, frames, view, select, check, done } = await openBar();
const size = async (w: number, h: number) => {
  await l.app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]?.setSize(s.w, s.h), { w, h });
  await settle(page, 300);
};
const blur = () =>
  page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
const key = async (k: string) => {
  await blur();
  await page.keyboard.press(k);
  await frames();
};
const openFind = async () => {
  await page.keyboard.press('Control+f');
  await page.keyboard.type('a');
  await page.keyboard.press('Enter');
  // it slides in, so it is measured once it is still
  await page.waitForFunction(() => {
    const bar = document.getElementById('findBar');
    return bar?.checkVisibility() && !bar.getAnimations().length;
  });
  await frames();
};
const still = () => page.waitForTimeout(450);
const setChat = async (open: boolean) => {
  const now = await page.evaluate(() => !!document.getElementById('myra')?.classList.contains('chat'));
  if (now !== open) await page.click(open ? '#mPill' : '#mcClose');
  await still();
};
const stopAll = async () => {
  await setChat(false);
  await page.evaluate(() => document.getElementById('fbX')?.click());
  await key('Escape');
  await key('Escape');
  await page.evaluate(() => window.__fenmyr.selectOnly([]));
  await frames();
};
// her chat opening and closing never meets what is up, nor moves it
const chatKeepsClear = (w: number, which: 'draw' | 'wire' | 'find', what: string) =>
  check(`at ${w} px her chat opening and closing never meets ${what}, nor moves it`, async () => {
    const before = (await geo(page))[which];
    await setChat(true);
    const open = await geo(page);
    await setChat(false);
    const after = (await geo(page))[which];
    assert.ok(open.chat, 'her chat is open');
    assert.ok(!overlaps(open.chat, open[which]), `her chat ${show(open.chat)} meets ${what} ${show(open[which])}`);
    assert.deepStrictEqual([open[which], after], [before, before], `${what} stays put`);
  });

// an idea in Unsorted that matches, so find's count outgrows its least width and the bar widens as the count fills in
await page.evaluate(() =>
  window.__fenmyr.board.tray.push({ id: 'i', type: 'note', x: 0, y: 0, w: 9, h: 9, r: 0, color: 'white', text: 'a' }),
);
await view(-3000, 0);
for (const w of [1920, 1440, 1100, 1000]) {
  await size(w, 900);
  await check(`at ${w} px drawing’s card sits left of the panel, level with its top, and lifts nothing`, async () => {
    await key('p');
    const g = await geo(page);
    besidePanel(g, g.draw, 'drawing’s card');
    assert.strictEqual(g.modeH, '0px', '--mode-h');
  });
  await chatKeepsClear(w, 'draw', 'drawing’s card');
  await stopAll();
  await check(
    `at ${w} px the Wireframe column sits left of the panel, clear of the hint, and lifts nothing`,
    async () => {
      await key('w');
      const g = await geo(page);
      assert.ok(g.hint, 'the hint shows');
      besidePanel(g, g.wire, 'the Wireframe column');
      assert.strictEqual(g.modeH, '0px', '--mode-h');
    },
  );
  await chatKeepsClear(w, 'wire', 'the Wireframe column');
  await stopAll();
  await check(
    `at ${w} px find’s bar sits 12 px over the bottom bar, in its middle, and --mode-h is its lift`,
    async () => {
      await openFind();
      const g = await geo(page);
      assert.ok(g.find && g.dock, 'find’s bar and the bottom bar are up');
      const room = Math.min(g.panel?.l ?? g.w, g.tray?.l ?? g.w) - 12 - (g.find.r - g.find.l) / 2;
      near(middle(g.find), Math.min(middle(g.dock), room), 'its middle, or as near as the right column allows');
      near(g.find.b, g.dock.t - 12, 'its bottom');
      assert.strictEqual(g.modeH, `${g.find.b - g.find.t + 12}px`, '--mode-h');
      // the field's clear button is placed as the field takes focus, so it lands in the field only if the bar is there
      const clear = await page.evaluate(() => {
        const x = document.getElementById('clrBtn')?.getBoundingClientRect(),
          f = document.querySelector('#findBar .fb-field')?.getBoundingClientRect();
        return !!x && !!f && x.left >= f.left && x.right <= f.right && x.top >= f.top && x.bottom <= f.bottom;
      });
      assert.ok(clear, 'the clear button sits in find’s field');
    },
  );
  await chatKeepsClear(w, 'find', 'find’s bar');
  await stopAll();
}

for (const [w, h] of [
  [1440, 600],
  [1100, 600],
  [1000, 640],
] as const) {
  await size(w, h);
  for (const [k, which] of [
    ['p', 'draw'],
    ['w', 'wire'],
  ] as const)
    await check(`in a ${w} × ${h} window her open chat never meets the ${which} card`, async () => {
      await key(k);
      await setChat(true);
      const g = await geo(page);
      assert.ok(g.chat && g[which], 'her chat and the card are up');
      assert.ok(!overlaps(g.chat, g[which]), `her chat ${show(g.chat)} meets the card ${show(g[which])}`);
      assert.ok(g.chat.t >= 0, `her chat starts at ${g.chat.t}`);
    });
  await stopAll();
}

await size(1100, 900);
await check('with her chat open, the Wireframe column coming up moves the chat clear of it', async () => {
  await setChat(true);
  await page.click('#tools [data-add="frame"]');
  await still();
  const g = await geo(page);
  assert.ok(g.chat && g.wire, 'her chat and the column are up');
  assert.ok(!overlaps(g.chat, g.wire), `her chat ${show(g.chat)} meets the column ${show(g.wire)}`);
});
await stopAll();
await size(1440, 900);
await check(
  'with drawing and find on together, the card stays beside the panel and find over the bottom bar',
  async () => {
    await key('p');
    await openFind();
    const g = await geo(page);
    assert.ok(g.draw && g.find && g.dock, 'both are up');
    besidePanel(g, g.draw, 'drawing’s card');
    near(middle(g.find), middle(g.dock), 'find’s middle');
    near(g.find.b, g.dock.t - 12, 'find’s bottom');
    assert.strictEqual(g.modeH, `${g.find.b - g.find.t + 12}px`, '--mode-h is find’s lift');
  },
);
await stopAll();

await check('the size bubble over the knob shows whole, over drawing’s card', async () => {
  await key('p');
  await page.keyboard.press(']');
  await page.waitForTimeout(250);
  const bub = await page.evaluate(() => {
    const b = document.getElementById('dbsBub'),
      r = b?.getBoundingClientRect();
    if (!b || !r) return null;
    const corners = [
      [r.left + 6, r.top + 6],
      [r.right - 6, r.top + 6],
      [(r.left + r.right) / 2, (r.top + r.bottom) / 2],
    ] as const;
    // it lets presses through, so for a moment it catches them, as a clipped or covered part would not
    b.style.pointerEvents = 'auto';
    const shown = corners.every(([x, y]) => b.contains(document.elementFromPoint(x, y)));
    b.style.pointerEvents = '';
    return { shown, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth };
  });
  assert.deepStrictEqual(bub, { shown: true, inside: true });
});
await stopAll();

await check('a selection’s bar keeps clear of drawing’s card', async () => {
  await key('p');
  const g = await geo(page);
  assert.ok(g.draw, 'the card is up');
  // the note across the card's left edge, level with it, where a bar centred over the note would run under the card
  await view(g.draw.l - 110, g.draw.t + 60);
  await select(['note']);
  const { selbar, draw } = await geo(page);
  assert.ok(selbar && draw, 'the selection bar and the card are up');
  assert.ok(!overlaps(selbar, draw), `the bar ${show(selbar)} meets the card ${show(draw)}`);
});
await stopAll();
await check('the Pieces picker keeps clear of the Wireframe column', async () => {
  await page.evaluate(() => {
    window.__fenmyr.board.cards.push({
      id: 'scr',
      type: 'frame',
      x: 0,
      y: 0,
      w: 393,
      h: 852,
      r: 0,
      color: 'white',
      device: 'iPhone',
      name: 'Sign in',
    });
    window.__fenmyr.renderAll();
  });
  const g0 = await geo(page);
  assert.ok(g0.panel, 'the panel is up');
  // the screen just left of where the column opens, so the picker beside it would reach under the column
  await view(g0.panel.l - 700, 90, 0.5);
  await select(['scr']);
  await page.evaluate(() => document.querySelector<HTMLElement>('#selbar [data-pieces]')?.click());
  await settle(page, 400);
  await key('w');
  await settle(page, 300);
  const { pick, wire } = await geo(page);
  assert.ok(pick && wire, 'the picker and the column are up');
  assert.ok(!overlaps(pick, wire), `the picker ${show(pick)} meets the column ${show(wire)}`);
});
await stopAll();
await page.evaluate(() => {
  window.__fenmyr.board.cards = window.__fenmyr.board.cards.filter(c => c.id !== 'scr');
  window.__fenmyr.renderAll();
});

// the panel's pickers end the mode, and its menus put the card away while they are open
for (const [k, mode] of [
  ['p', 'draw'],
  ['w', 'wire'],
] as const) {
  for (const [tool, id] of [
    ['shape', 'shapePick'],
    ['tpl', 'tplPick'],
    ['stamp', 'stampWheel'],
  ] as const)
    await check(`the ${mode} card and the ${id} picker never share the left of the panel`, async () => {
      await key(k);
      await page.click(`#tools [data-add="${tool}"]`);
      await page.waitForTimeout(300);
      assert.deepStrictEqual((await geo(page)).slot, [id], 'only the picker shows there');
      await key('Escape');
      await page.waitForTimeout(250);
      assert.deepStrictEqual((await geo(page)).slot, [], 'and the mode is over once it closes');
    });
  // a right-click puts a tool being placed down, as it always has, and leaves drawing on
  const after = mode === 'draw' ? ['drawbar'] : [];
  await check(`the ${mode} card and the panel’s own menu never share the left of the panel`, async () => {
    await key(k);
    await page.click('#tools [data-add="link"]', { button: 'right' });
    await page.waitForTimeout(250);
    assert.deepStrictEqual((await geo(page)).slot, ['rowMenu'], 'only the menu shows there');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    assert.deepStrictEqual((await geo(page)).slot, after, 'once it closes');
  });
  await stopAll();
}

await check('clean mode and an open doc hide drawing’s card', async () => {
  await key('p');
  await page.keyboard.press('Control+Backslash');
  await page.waitForTimeout(400);
  const clean = (await geo(page)).draw;
  await page.keyboard.press('Control+Backslash');
  await page.waitForTimeout(400);
  await key('Escape');
  await page.evaluate(() => {
    const b = window.__fenmyr.board;
    b.cards.push({ id: 'doc', type: 'doc', x: 300, y: 300, w: 200, h: 260, r: 0, color: 'white', text: 'Plan' });
    window.__fenmyr.renderAll();
  });
  await view(0, 0);
  await page.locator('.card[data-id="doc"]').dblclick();
  await page.waitForFunction(() => document.getElementById('stage')?.classList.contains('doc-open'));
  await key('p');
  await page.waitForTimeout(300);
  const doc = (await geo(page)).draw;
  await key('Escape');
  await key('Escape');
  assert.deepStrictEqual([clean, doc], [null, null]);
});
await stopAll();

await check(
  'on a prototype board at 1440 px drawing’s card sits left of the panel, in the board’s pane, on top',
  async () => {
    await openPrototype(page, freshRepo('mode-card-').repo);
    await page.waitForFunction(() => document.body.classList.contains('proto'));
    await settle(page, 1500);
    await key('p');
    const g = await geo(page),
      on = await page.evaluate(() => {
        const r = document.getElementById('drawbar')?.getBoundingClientRect(),
          pane = document.querySelector('[data-p="canvas"] .pr-body')?.getBoundingClientRect();
        if (!r || !pane) return null;
        const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
        return { top: !!hit?.closest('#drawbar'), inPane: r.left >= pane.left && r.right <= pane.right };
      });
    assert.ok(g.draw && g.panel, 'the card and the panel are up');
    near(g.draw.r, g.panel.l - 12, 'the card’s right');
    assert.deepStrictEqual(on, { top: true, inPane: true }, 'the card shows, inside the pane');
    await key('Escape');
  },
);
const failed: string[] = [];
try {
  await done('MODE CARD OK');
} catch (e) {
  failed.push(`a board: ${e instanceof Error ? e.message : String(e)}`);
}

// Large icons in a short window tuck Draw into ···: its menu puts the card away while it is open.
const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'A note' },
  bare = { id: 'b', name: 'Bare', cards: [note], links: [], tray: [], view: { x: 300, y: 200, z: 1 } };
const big = await launch({ boards: [bare], open: 'b', settings: { tbSize: 'l' } });
try {
  const bp = big.page;
  await big.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1280, 560));
  await settle(bp, 500);
  await bp.keyboard.press('p');
  await bp.waitForTimeout(200);
  const g = await geo(bp);
  try {
    besidePanel(g, g.draw, 'drawing’s card with large icons in a short window');
    await bp.click('#tbMore');
    await bp.waitForTimeout(250);
    assert.deepStrictEqual((await geo(bp)).slot, ['rowMenu'], 'with ··· open only its menu shows left of the panel');
    await bp.keyboard.press('Escape');
    await bp.waitForTimeout(250);
    assert.deepStrictEqual((await geo(bp)).slot, ['drawbar'], 'the card is back once ··· closes');
  } catch (e) {
    failed.push(`large icons: ${e instanceof Error ? e.message : String(e)}`);
  }
  failed.push(...big.errors);
} finally {
  await big.close();
}
for (const f of failed) console.log(`FAILED ${f}`);
assert.deepStrictEqual(failed, [], 'every check passes');
console.log('modeCard: ok');
