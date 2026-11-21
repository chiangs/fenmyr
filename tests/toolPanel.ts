// The tools as a panel at the top right and the bottom bar centred under the board: where each sits, that the panel
// stays put, that every popup from a tool opens left of it, that it tucks by rows and starts each group on a row, and
// that Just the board hides it. On a normal board and a prototype board.
import assert from 'node:assert';
import type { Page } from 'playwright';
import { PANEL, TOOLBAR } from '../src/web/ui/toolbarTable.ts';
import { near, openBar } from './support/bar.ts';
import { type Launched, launch } from './support/launch.ts';
import { freshRepo, openPrototype } from './support/prototype.ts';
import { still } from './support/settled.ts';

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'A note' };
const bare = { id: 'b', name: 'Bare', cards: [note], links: [], tray: [], view: { x: 300, y: 200, z: 1 } };
const sizer = (l: Launched) => async (w: number, h: number) => {
  await l.app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]?.setSize(s.w, s.h), { w, h });
  await l.page.waitForFunction(s => innerWidth === s.w && innerHeight === s.h, { w, h });
  await still(l.page);
};
// the panel, the bottom bar, zoom, Unsorted and the board's pane, in window pixels
const geo = (page: Page) =>
  page.evaluate(() => {
    const at = (el: Element | null | undefined) => {
      const r = el?.getBoundingClientRect();
      return r ? { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width } : null;
    };
    return {
      w: innerWidth,
      h: innerHeight,
      native: document.documentElement.classList.contains('native'),
      tools: at(document.getElementById('tools')),
      dock: at(document.getElementById('dock')),
      zoom: at(document.getElementById('zoom')),
      tray: at(document.getElementById('tray')),
      pane: at(document.querySelector('[data-p="canvas"] .pr-body')),
    };
  });
// where a popup opened, and the panel and the button it opened from
const opened = (page: Page, popup: string, from: string) =>
  page.evaluate(
    ({ popup, from }) => {
      const p = document.querySelector(popup)?.getBoundingClientRect(),
        b = document.querySelector(from)?.getBoundingClientRect(),
        panel = document.getElementById('tools')?.getBoundingClientRect();
      return p && b && panel
        ? { l: p.left, r: p.right, t: p.top, b: p.bottom, panel: panel.left, mid: (b.top + b.bottom) / 2 }
        : null;
    },
    { popup, from },
  );
const leftOfPanel = (o: Awaited<ReturnType<typeof opened>>, what: string) => {
  assert.ok(o, `${what} is open`);
  assert.ok(o.r <= o.panel && o.l >= 0, `${what} spans ${o.l} to ${o.r}, left of the panel at ${o.panel}`);
  assert.ok(o.t <= o.mid && o.mid <= o.b, `${what} is level with its button`);
};
// the shown cells of the panel, in order: each tool's group, the row it is on and its marks
const cells = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#tools > button')]
      .filter(b => b.checkVisibility())
      .map(b => {
        const r = b.getBoundingClientRect();
        return {
          id: b.dataset.add ?? '···',
          t: Math.round(r.top),
          l: Math.round(r.left),
          start: b.classList.contains('tb-start'),
        };
      })
      .sort((a, b) => a.t - b.t || a.l - b.l),
  );
const tucked = (page: Page) => page.$$eval('#tools > .tb-over', bs => bs.map(b => b.getAttribute('data-add') ?? ''));
const shownIds = (page: Page) =>
  page.$$eval('#tools > [data-add]', bs =>
    bs.filter(b => !b.hasAttribute('hidden')).map(b => b.getAttribute('data-add') ?? ''),
  );
const clickThenStill = async (page: Page, selector: string, button: 'left' | 'right' = 'left') => {
  await page.click(selector, { button });
  await still(page);
};
const putDown = async (page: Page) => {
  await page.keyboard.press('Escape');
  await page.mouse.click(700, 500);
  await still(page);
};
// each group starts a row, in the panel's first column, and only those buttons are marked
async function groupsStartRows(page: Page, what: string) {
  const cs = await cells(page),
    first = Math.min(...cs.map(c => c.l));
  cs.forEach((c, i) => {
    const prev = cs[i - 1],
      starts = !!prev && c.id !== '···' && TOOLBAR.tool(c.id)?.group !== TOOLBAR.tool(prev.id)?.group;
    assert.strictEqual(c.start, starts, `${what}: ${c.id} ${starts ? 'starts' : 'does not start'} a group`);
    if (starts) assert.ok(prev && c.t > prev.t && c.l === first, `${what}: ${c.id} starts a new row at the left`);
  });
}

const { l, page, view, select, check, done } = await openBar();
const size = sizer(l);

// 1441 is odd, so centring on the window alone would start the bar on a half pixel
for (const w of [1920, 1441, 1440, 1100, 1000]) {
  await check(`at ${w} px the bottom bar is centred on the window, from a whole pixel`, async () => {
    await size(w, 900);
    const g = await geo(page);
    assert.ok(g.dock, 'the bar is up');
    near((g.dock.l + g.dock.r) / 2, g.w / 2, 'the bar’s centre');
    assert.strictEqual(g.dock.l, Math.round(g.dock.l), `the bar starts at ${g.dock.l}`);
  });
}
await size(1920, 1080);

await check('zoom keeps one width, so the bar does not shift as the zoom changes', async () => {
  const at = async (z: number) => {
    await view(0, 0, z);
    return (await geo(page)).dock;
  };
  const [small, whole, big] = [await at(0.37), await at(1), await at(1.25)];
  await view(0, 0);
  assert.deepStrictEqual([whole, big], [small, small]);
});

await check('the panel sits over Unsorted, as wide as its content, at the widgets’ top', async () => {
  const g = await geo(page);
  assert.ok(g.tools && g.tray, 'the panel and Unsorted are up');
  near(g.tools.r, g.tray.r, 'the panel’s right edge');
  near(g.tools.w, g.tray.w, 'the panel’s width');
  near(g.tools.t, g.native ? 38 : 14, 'the panel’s top');
  assert.ok(g.tray.t >= g.tools.b + 10, `Unsorted starts at ${g.tray.t}, under the panel ending at ${g.tools.b}`);
});

await check('the panel stays put as the chat opens, a tool is picked and the window’s height changes', async () => {
  const before = (await geo(page)).tools;
  await page.click('#mPill');
  await still(page);
  const chat = (await geo(page)).tools;
  await page.click('#mcClose');
  await page.click('#tools [data-add="note"]');
  const picked = (await geo(page)).tools;
  await putDown(page);
  await size(1920, 800);
  const shorter = (await geo(page)).tools;
  await size(1920, 1080);
  assert.deepStrictEqual([chat, picked, shorter], [before, before, before]);
});

await check('at 1920 × 1080 no tool tucks into ···, and ··· hides', async () => {
  assert.deepStrictEqual(await tucked(page), []);
  assert.ok(!(await page.isVisible('#tbMore')), '··· hides');
});

await check('each group of the table starts a row under a hairline', async () => {
  await groupsStartRows(page, 'the table’s order');
});

await check('a tooltip in the panel’s last column ends inside the window', async () => {
  const last = await page.evaluate(() => {
    const ends = [...document.querySelectorAll<HTMLElement>('#tools > .tb-end')].filter(b => b.checkVisibility());
    const b = ends[0];
    if (b) b.dataset.tip = 'A tool with a far longer name than any · Ctrl+Shift+Alt+X';
    return b?.dataset.add;
  });
  assert.ok(last, 'a tool sits in the last column');
  await page.hover(`#tools [data-add="${last}"]`);
  await still(page);
  const tip = await page.evaluate(id => {
    const b = document.querySelector(`#tools [data-add="${id}"]`);
    if (!b) return null;
    const cs = getComputedStyle(b, '::after'),
      w = parseFloat(cs.width) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    return {
      r: b.getBoundingClientRect().left + parseFloat(cs.left) + new DOMMatrix(cs.transform).m41 + w,
      w: innerWidth,
    };
  }, last);
  await page.mouse.move(700, 500);
  assert.ok(tip && tip.r <= tip.w, `the tooltip ends at ${tip?.r} in a ${tip?.w} px window`);
});

async function everyOpener(what: string) {
  await clickThenStill(page, '#tools [data-add="shape"]');
  leftOfPanel(await opened(page, '#shapePick', '#tools [data-add="shape"]'), `${what}: Shapes`);
  await putDown(page);
  await clickThenStill(page, '#tools [data-add="tpl"]');
  leftOfPanel(await opened(page, '#tplPick', '#tools [data-add="tpl"]'), `${what}: Templates`);
  await putDown(page);
  await clickThenStill(page, '#tools [data-add="stamp"]');
  leftOfPanel(await opened(page, '#stampWheel', '#tools [data-add="stamp"]'), `${what}: the stamp wheel`);
  await clickThenStill(page, '#wsMid');
  leftOfPanel(await opened(page, '#stampPick', '#tools [data-add="stamp"]'), `${what}: every stamp`);
  await putDown(page);
  await clickThenStill(page, '#tools [data-add="link"]', 'right');
  leftOfPanel(await opened(page, '#rowMenu', '#tools [data-add="link"]'), `${what}: Customise toolbar`);
  assert.strictEqual(await page.textContent('#rowMenu'), 'Customise toolbar…', `${what}: the panel’s own menu`);
  await putDown(page);
}
await check('Shapes, Templates, the stamps and Customise toolbar open left of the panel', () => everyOpener('a board'));

await check('every stamp wraps into rows: no tab scrolls sideways or up and down in a full-height window', async () => {
  await page.click('#tools [data-add="stamp"]');
  await page.click('#wsMid');
  for (const tab of ['myra', 'moving', 'emoji']) {
    await page.click(`#stampPick [data-tab="${tab}"]`);
    const g = await page.$eval('#spGrid', el => ({
      sw: el.scrollWidth,
      cw: el.clientWidth,
      sh: el.scrollHeight,
      ch: el.clientHeight,
    }));
    assert.ok(g.sw <= g.cw, `${tab}: the grid is ${g.sw} px wide in ${g.cw} px`);
    assert.ok(g.sh <= g.ch, `${tab}: the grid is ${g.sh} px tall in ${g.ch} px`);
  }
  await putDown(page);
});

await check('drawing’s card sits left of the panel, level with its top', async () => {
  await clickThenStill(page, '#tools [data-add="draw"]');
  const g = await geo(page),
    card = await page.evaluate(() => document.getElementById('modeCard')?.getBoundingClientRect().toJSON());
  await page.keyboard.press('Escape');
  await page.click('#tools [data-add="pointer"]');
  assert.ok(g.tools && card, 'the panel and the card are up');
  near(card.right, g.tools.l - 12, 'the card’s right');
  near(card.top, g.tools.t, 'the card’s top');
});

await check('the open chat leaves zoom showing', async () => {
  await page.click('#mPill');
  await still(page);
  const seen = await page.evaluate(() => {
    const z = document.getElementById('zoom')?.getBoundingClientRect(),
      c = document.getElementById('mChat')?.getBoundingClientRect();
    if (!z || !c) return null;
    const hit = document.elementFromPoint((z.left + z.right) / 2, (z.top + z.bottom) / 2);
    return { apart: z.right <= c.left || z.left >= c.right || z.bottom <= c.top, hit: hit?.id };
  });
  await page.click('#mcClose');
  assert.deepStrictEqual(seen, { apart: true, hit: 'zoom' });
});

await check('reaching under the tools, her open chat keeps below them', async () => {
  await size(1100, 700);
  await page.click('#mPill');
  await still(page);
  const g = await geo(page),
    chat = await page.evaluate(() => document.getElementById('mChat')?.getBoundingClientRect().toJSON());
  await page.click('#mcClose');
  await size(1920, 1080);
  assert.ok(g.tools && chat && chat.left < g.tools.r && chat.right > g.tools.l, 'her chat reaches under the tools');
  assert.ok(chat.top >= g.tools.b + 11, `her chat starts at ${chat.top}, the tools end at ${g.tools.b}`);
});

await check(
  'on a phone zoom hides, the sheet lists the tools as before, and they come back when it widens',
  async () => {
    const before = (await geo(page)).tools;
    await size(600, 900);
    await clickThenStill(page, '#hub [data-sheet="add"]');
    const phone = await page.evaluate(() => ({
      zoom: !!document.getElementById('zoom')?.checkVisibility(),
      sheet: document.getElementById('tools')?.parentElement?.id,
    }));
    const grid = await cells(page);
    await size(1920, 1080);
    const home = await page.evaluate(() => document.getElementById('tools')?.parentElement === document.body);
    assert.deepStrictEqual(phone, { zoom: false, sheet: 'shBody' }, 'on a phone');
    // four to a row, straight through, with no row for each group
    assert.strictEqual(new Set(grid.map(c => c.t)).size, Math.ceil(grid.length / 4), 'the sheet’s rows');
    assert.strictEqual(grid[0]?.id, '···', '··· first, as it always came');
    assert.ok(home, 'the tools are back at the window’s level');
    assert.deepStrictEqual((await geo(page)).tools, before, 'and where they were');
  },
);

await check('Just the board has no button, and Ctrl+\\ hides the panel and brings it back', async () => {
  const shown = () =>
    page.evaluate(() => {
      const t = document.getElementById('tools'),
        r = t?.getBoundingClientRect(),
        hit = r && document.elementFromPoint(r.left + 26, r.top + 26);
      return !!t?.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && !!hit && t.contains(hit);
    });
  // a count, as an element handle in a failed assertion's message takes the whole connection with it
  const button = await page.locator('#cleanBtn').count();
  await page.keyboard.press('Control+Backslash');
  await still(page);
  const hidden = await shown();
  await page.keyboard.press('Control+Backslash');
  await still(page);
  assert.deepStrictEqual([button, hidden, await shown()], [0, false, true]);
});

await check('on a prototype board the panel sits at the board pane’s top right, the bar centred under it', async () => {
  await openPrototype(page, freshRepo('tool-panel-').repo);
  await page.waitForFunction(() => document.body.classList.contains('proto'));
  await still(page);
  const g = await geo(page);
  assert.ok(g.tools && g.dock && g.pane, 'the panel, the bar and the board pane are up');
  near(g.tools.r, g.pane.r - 14, 'the panel’s right edge');
  near(g.tools.t, g.pane.t + 14, 'the panel’s top');
  near((g.dock.l + g.dock.r) / 2, (g.pane.l + g.pane.r) / 2, 'the bar’s centre');
  assert.strictEqual(g.dock.l, Math.round(g.dock.l), `the bar starts at ${g.dock.l}`);
});
await check('on a prototype board every opener opens left of the panel', () => everyOpener('a prototype board'));
await check('on a prototype board a selection’s bar keeps left of the panel', async () => {
  await page.evaluate(() => {
    window.__fenmyr.board.cards.push({ id: 'near', type: 'note', x: 0, y: 0, w: 220, h: 140, r: 0, color: 'white' });
    window.__fenmyr.renderAll();
  });
  const g = await geo(page);
  assert.ok(g.tools && g.pane, 'the panel and the board pane are up');
  // the note across the panel's left edge, level with it, where a bar centred over the note would run under it
  await view(g.tools.l - 110 - g.pane.l, g.tools.t + 200 - g.pane.t);
  await select(['near']);
  const bar = await page.evaluate(() => document.getElementById('selbar')?.getBoundingClientRect().toJSON());
  assert.ok(bar && bar.right <= g.tools.l - 11, `the bar ends at ${bar?.right}, the panel starts at ${g.tools.l}`);
  assert.ok(bar.bottom > g.tools.t && bar.top < g.tools.b, 'level with the panel');
});
const failed: string[] = [];
// the boards below are checked whatever happened on this one
try {
  await done('TOOL PANEL OK');
} catch (e) {
  failed.push(`a board: ${e instanceof Error ? e.message : String(e)}`);
}

// Large icons: four columns, so a short window tucks tools, by the table's order, here and on a prototype board.
const big = await launch({ boards: [bare], open: 'b', settings: { tbSize: 'l' } });
const bigCheck = async (name: string, run: () => Promise<void>) => {
  try {
    await run();
  } catch (e) {
    failed.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
};
try {
  const bp = big.page;
  await sizer(big)(1440, 560);
  await bigCheck('a short window tucks the first of the tuck order into ··· until the panel fits', async () => {
    const out = await tucked(bp),
      bar = await shownIds(bp),
      rows = new Set((await cells(bp)).map(c => c.t)).size,
      g = await geo(bp);
    assert.ok(out.length > 0, 'some tools tuck');
    assert.deepStrictEqual(out.sort(), TOOLBAR.tuckOrder(bar).slice(0, out.length).sort(), 'the first in tuck order');
    assert.ok(await bp.isVisible('#tbMore'), '··· shows');
    assert.ok(rows <= PANEL.maxRows, `${rows} rows`);
    assert.ok(g.tools && g.tools.b - g.tools.t <= g.h * 0.45, 'the panel keeps to 45 % of the window');
  });
  await bigCheck('··· and a tool tucked into it open left of the panel', async () => {
    await bp.click('#tbMore');
    await still(bp);
    leftOfPanel(await opened(bp, '#rowMenu', '#tbMore'), '···');
    await bp.locator('#rowMenu button', { hasText: 'Shapes' }).click();
    await still(bp);
    leftOfPanel(await opened(bp, '#shapePick', '#tbMore'), 'Shapes from ···');
    await putDown(bp);
  });
  await openPrototype(bp, freshRepo('tool-panel-big-').repo);
  await still(bp);
  await bigCheck('on a prototype board ··· and a tool tucked into it open left of the panel', async () => {
    assert.ok((await tucked(bp)).includes('shape'), 'Shapes is tucked');
    await bp.click('#tbMore');
    await still(bp);
    leftOfPanel(await opened(bp, '#rowMenu', '#tbMore'), '···');
    await bp.locator('#rowMenu button', { hasText: 'Shapes' }).click();
    await still(bp);
    leftOfPanel(await opened(bp, '#shapePick', '#tbMore'), 'Shapes from ···');
  });
  failed.push(...big.errors);
} finally {
  await big.close();
}

// A personal order that alternates groups puts each tool on a row of its own, so PANEL.maxRows is what tucks.
const order =
  'pointer title link shape note coll image stamp doc canvas audio tpl todo frame video pen swatch draw vnote';
const own = await launch({
  boards: [bare],
  open: 'b',
  settings: { toolbar: { order: order.split(' '), hidden: [] } },
});
try {
  await sizer(own)(1920, 1080);
  await bigCheck('a personal order that alternates groups keeps to PANEL.maxRows rows', async () => {
    const rows = new Set((await cells(own.page)).map(c => c.t)).size;
    assert.strictEqual(rows, PANEL.maxRows, `${rows} rows`);
    assert.ok((await tucked(own.page)).length > 0, 'the rest tuck into ···');
  });
  await bigCheck('a personal order moves the group starts with it', () =>
    groupsStartRows(own.page, 'a personal order'),
  );
  failed.push(...own.errors);
} finally {
  await own.close();
}
for (const f of failed) console.log(`FAILED ${f}`);
assert.deepStrictEqual(failed, [], 'every check passes');
console.log('toolPanel: ok');
