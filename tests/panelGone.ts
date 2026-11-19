// The Wireframe panel is gone, and what an upgrade brings with it still loads: a saved layout, settings, minimised
// boxes, folds and a toolbar order from before load with Unsorted alone on the right, no migration and no page
// errors. Unsorted moved left stays left. Settings has no Wireframe row, Ctrl+\ hides the chrome, the update bar
// centres between the board's name and Unsorted, and the tour's wireframe step rings the Wireframe button, or ··· when
// it is tucked, and finishes when a screen is added.
import assert from 'node:assert';
import type { Page } from 'playwright';
import { TOOLBAR } from '../src/web/ui/toolbarTable.ts';
import { launch, settle } from './support/launch.ts';

// the toolbar order a person saved before the Wireframe button existed
const OLD_ORDER = ['pointer', 'note', 'vnote', 'doc', 'todo', 'title', 'coll', 'canvas', 'link', 'image', 'audio'];
const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'A note' };
const board = { id: 'b', name: 'Upgrade', cards: [note], links: [], tray: [], view: { x: 300, y: 200, z: 1 } };

// the tour's wireframe step, reached by Continue from the start
const toWireframeStep = async (page: Page) => {
  await page.evaluate(() => window.__fenmyr.startTour());
  await settle(page, 300);
  for (let i = 0; i < 12; i++) {
    // settles once there, as the ring slides to its target
    if (/Wireframes start here/.test((await page.textContent('#coachText')) ?? '')) return settle(page, 600);
    await page.click('#coachNext');
    await page.waitForTimeout(250);
  }
  throw new Error('the tour has no wireframe step');
};
const ringOn = (page: Page, sel: string) =>
  page.evaluate(sel => {
    const ring = document.getElementById('coachRing')?.getBoundingClientRect(),
      t = document.querySelector(sel)?.getBoundingClientRect();
    return !!ring && !!t && t.width > 0 && Math.abs(ring.left + 8 - t.left) < 1 && Math.abs(ring.top + 8 - t.top) < 1;
  }, sel);

const failed: string[] = [];
const run = async (name: string, f: () => Promise<void>) => {
  try {
    await f();
  } catch (e) {
    failed.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
};

const l = await launch({
  boards: [board],
  open: 'b',
  settings: {
    layout: { left: ['layers', 'colors'], right: ['design', 'tray'] },
    wDesign: false,
    panelH: { design: 300 },
    toolbar: { order: OLD_ORDER, hidden: [] },
  },
});
const { page } = l;
try {
  await l.app.context().addInitScript(() => {
    try {
      localStorage.setItem('fenmyr:boxes', JSON.stringify({ design: true }));
      localStorage.setItem('fenmyr:protoBoxes', JSON.stringify({ design: true }));
      localStorage.setItem('fenmyr:dzOpen', JSON.stringify({ layouts: true, basics: false }));
    } catch {}
  });
  await page.reload();
  await page.waitForFunction(() => window.__fenmyr?.curBoard() && document.querySelector('#cards .card'));
  await settle(page);

  await run('a layout, settings, boxes and folds naming the panel load with Unsorted alone on the right', async () => {
    const s = await page.evaluate(() => ({
      panel: !!document.getElementById('design'),
      right: [...(document.getElementById('sideR')?.children ?? [])].map(e => e.id),
      left: [...(document.getElementById('side')?.children ?? [])].map(
        e => (e instanceof HTMLElement && e.dataset.box) || e.id,
      ),
      unsorted: !!document.getElementById('tray')?.checkVisibility(),
    }));
    assert.deepStrictEqual(
      s,
      { panel: false, right: ['tray'], left: ['boards', 'layers', 'colors'], unsorted: true },
      'no panel, and Unsorted alone and showing on the right',
    );
  });

  await run('a toolbar order saved before the Wireframe button gets it after Canvas', async () => {
    assert.strictEqual(
      await page.evaluate(() =>
        document.querySelector('#tools [data-add="frame"]')?.previousElementSibling?.getAttribute('data-add'),
      ),
      'canvas',
    );
  });

  await run('Settings → Widgets has no Wireframe row, and the next save forgets wDesign', async () => {
    await page.click('#gearBtn');
    await settle(page, 300);
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('#settings [data-set^="w"]')].map(i => i.getAttribute('data-set')),
    );
    assert.ok(!rows.includes('wDesign'), `no Wireframe switch among ${rows.join(', ')}`);
    assert.ok(rows.includes('wTray'), 'Unsorted keeps its switch');
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__fenmyr.applyToolbar());
    await page.click('#tools [data-add="note"]');
    await page.keyboard.press('Escape');
    await settle(page, 300);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fenmyr:settings') ?? '{}'));
    assert.ok(saved && typeof saved === 'object' && !('wDesign' in saved), 'wDesign is not saved again');
  });

  await run('Ctrl+\\ hides every panel and brings them back, with no panel to hide', async () => {
    await page.keyboard.press('Control+Backslash');
    await settle(page, 400);
    const hidden = await page.evaluate(() => ({
      clean: document.body.classList.contains('clean'),
      unsorted: getComputedStyle(document.getElementById('sideR') ?? document.body).visibility,
    }));
    assert.deepStrictEqual(hidden, { clean: true, unsorted: 'hidden' }, 'just the board');
    await page.keyboard.press('Control+Backslash');
    await settle(page, 400);
    assert.ok(!(await page.evaluate(() => document.body.classList.contains('clean'))), 'and back');
  });

  await run("the update bar centres between the board's name and Unsorted", async () => {
    const r = await page.evaluate(() => {
      const bar = document.getElementById('upBar');
      if (!bar) return null;
      bar.hidden = false;
      dispatchEvent(new Event('resize'));
      const b = bar.getBoundingClientRect(),
        top = document.querySelector('.top')?.getBoundingClientRect(),
        tray = document.getElementById('tray')?.getBoundingClientRect(),
        out = top && tray && { mid: (b.left + b.right) / 2, want: (top.right + 20 + tray.left - 20) / 2 };
      bar.hidden = true;
      return out;
    });
    assert.ok(r && Math.abs(r.mid - r.want) <= 1, `centred: ${JSON.stringify(r)}`);
  });

  await run("the tour's wireframe step rings the Wireframe button", async () => {
    await toWireframeStep(page);
    assert.ok(await ringOn(page, '#tools [data-add="frame"]'), 'the ring sits on the Wireframe button');
    assert.strictEqual(await page.textContent('#coachTry'), 'Try it: press W and drag on the board.');
    await page.click('#coachNext');
    await page.waitForTimeout(250);
  });

  await run("the tour's wireframe step finishes when a screen is added", async () => {
    await toWireframeStep(page);
    await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
    await page.keyboard.press('w');
    // clear of the tour's card, which sits left of the tools
    await page.mouse.move(400, 500);
    await page.mouse.down();
    await page.mouse.move(500, 620, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction(() => document.getElementById('coachTry')?.classList.contains('yay'), null, {
      timeout: 3000,
    });
    await page.keyboard.press('Escape');
  });

  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
} finally {
  await l.close();
}

// Wireframe last in a person's own order tucks first, and a short window tucks it
const tucked = await launch({
  boards: [board],
  open: 'b',
  settings: { toolbar: { order: [...TOOLBAR.tools.map(t => t.id).filter(id => id !== 'frame'), 'frame'], hidden: [] } },
});
try {
  await run("the tour's wireframe step rings ··· where the button is tucked", async () => {
    const page = tucked.page;
    await tucked.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1000, 560));
    await settle(page, 500);
    assert.ok(
      await page.evaluate(() => document.querySelector('#tools [data-add="frame"]')?.classList.contains('tb-over')),
      'the button is tucked',
    );
    await toWireframeStep(page);
    assert.ok(await ringOn(page, '#tbMore'), 'and the ring sits on ···');
  });
  assert.deepStrictEqual(tucked.errors, [], 'no errors on the page');
} finally {
  await tucked.close();
}

// a layout from before with Unsorted moved to the left keeps it there, leaving the right column empty
const left = await launch({
  boards: [board],
  open: 'b',
  settings: { layout: { left: ['layers', 'tray', 'colors'], right: ['design'] } },
});
try {
  await run('a saved layout with Unsorted on the left keeps it there', async () => {
    const s = await left.page.evaluate(() => ({
      left: [...(document.getElementById('side')?.children ?? [])].map(
        e => (e instanceof HTMLElement && e.dataset.box) || e.id,
      ),
      right: document.getElementById('sideR')?.children.length,
    }));
    assert.deepStrictEqual(s, { left: ['boards', 'layers', 'tray', 'colors'], right: 0 });
  });
  assert.deepStrictEqual(left.errors, [], 'no errors on the page');
} finally {
  await left.close();
}

for (const f of failed) console.log(`FAILED ${f}`);
assert.deepStrictEqual(failed, [], 'every check passes');
console.log('panelGone: ok');
