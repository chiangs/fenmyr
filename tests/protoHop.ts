// Myra hopping into a prototype board's docked chat as it opens: from her box, or from her perch on the open chat,
// drawn above the panes and the preview's frame; a fade under Calm, Calmest and reduced motion; and no hop between
// prototypes, back down to her box, on a phone, or as Fenmyr starts on a prototype.
import assert from 'node:assert';
import type { Edges } from './support/bar.ts';
import * as hop from './support/flight.ts';
import { launch, settle } from './support/launch.ts';
import { freshRepo, openPrototype } from './support/prototype.ts';

const { repo } = freshRepo('fenmyr-proto-hop-');
const note = { id: 'n1', type: 'note', x: 40, y: 40, w: 220, h: 120, text: 'A note' };
// no board named to open, so opening Fenmyr again goes back to the board last open
const l = await launch({ boards: [{ id: 'one', name: 'One', cards: [note], links: [], tray: [] }] });
const { page } = l;

const open = (id: string) => page.evaluate(id => window.__fenmyr.openBoard(id), id);
const failed: string[] = [];
// Each check reports on its own, so a run against an older build lists every check it fails. One that fails partway
// can leave a prototype or the chat open, so the next starts back on One with the chat closed.
const check = async (name: string, run: () => Promise<void>) => {
  try {
    await run();
  } catch (e) {
    failed.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const board = await page.evaluate(() => window.__fenmyr.curBoard()?.id),
    chat = await page.evaluate(() => !!document.getElementById('myra')?.classList.contains('chat'));
  if (board !== 'one') await open('one');
  else if (chat) await page.click('#mcClose');
  if (board !== 'one' || chat) await page.waitForTimeout(1000);
};
const size = async (w: number, h: number) => {
  await l.app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]?.setSize(s.w, s.h), { w, h });
  await settle(page, 400);
};
type Spot = { l: number; t: number };
const near = (a: Spot, b: Spot, px: number) => Math.hypot(a.l - b.l, a.t - b.t) <= px;
const inside = (a: Edges, b: Edges) => a.l >= b.l - 1 && a.t >= b.t - 1 && a.r <= b.r + 1 && a.b <= b.b + 1;
const headerSpot = async () => {
  const { mcPerch } = await hop.edges(page, ['mcPerch']);
  assert.ok(mcPerch, 'the header’s spot shows');
  return mcPerch;
};
const myraCalm = async (v: 'lively' | 'calm' | 'calmest') => {
  await page.click('#gearBtn');
  await page.click('#setTabs [data-tab="myra"]');
  await page.click(`[data-seg="myraCalm"] [data-v="${v}"]`);
  await page.click('#setClose');
  await page.waitForTimeout(300);
};

try {
  // The second prototype's chat is at its narrowest, its code folded and its preview at a desktop's width, so the
  // preview's frame lies under her way up.
  await page.evaluate(() =>
    localStorage.setItem(
      'fenmyr:protoLayout',
      JSON.stringify({ pb2: { chat: 280, preview: 700, code: 360, closed: ['code'] } }),
    ),
  );
  await openPrototype(page, repo);
  await page.evaluate(async repo => {
    const proto = await window.Fenmyr.protoCreate({ root: repo, name: 'Receipts', stack: 'react' });
    await window.Fenmyr.save({
      id: 'pb2',
      name: 'Receipts',
      folder: 'pf',
      kind: 'prototype',
      proto: { ...proto, device: 'desktop' },
      cards: [],
      links: [],
      tray: [],
    });
    await window.__fenmyr.refreshBoards();
  }, repo);
  await size(1920, 1080);
  await open('one');
  await settle(page);
  const home = (await hop.edges(page, ['gooSlot'])).gooSlot;
  assert.ok(home, 'she shows in her box');

  const back = async () => {
    const { frames } = await hop.flight(page, () => open('one')),
      there = frames.filter(f => f.home === 'mPill'),
      off = there.filter(f => !near(f, home, 1));
    assert.ok(there.length > 0, 'she is back in her box');
    assert.strictEqual(off.length, 0, `back on One she is out of her box in ${off.length} frames`);
  };
  const hopIn = async (id: string) => {
    const f = await hop.flight(page, () => open(id)),
      first = f.frames.find(fr => fr.home === 'mcPerch');
    assert.ok(first, 'she moves into the header');
    return { ...f, first, spot: await headerSpot() };
  };

  await check('from her box, she hops into the docked chat’s header, drawn above the panes', async () => {
    await page.evaluate(() => {
      window.__fenmyr.playAnim('love', false);
      window.__fenmyr.stopAnim();
    });
    let early = '';
    const f = await hop.flight(page, async () => {
      await open('pb');
      early = await page.evaluate(() => window.__fenmyr.lastAnimName());
    });
    const first = f.frames.find(fr => fr.home === 'mcPerch'),
      covered = f.frames.filter(fr => fr.home === 'mcPerch' && !fr.onTop).length,
      late = await page.evaluate(() => window.__fenmyr.lastAnimName());
    assert.ok(first && near(first, home, 8), `her first frame in the header is in her box: ${JSON.stringify(first)}`);
    assert.ok(f.between > 5, `she is between her box and the header in ${f.between} frames`);
    assert.ok(inside(f.after, await headerSpot()), 'she lands on the header’s spot');
    assert.strictEqual(covered, 0, `something is drawn over her in ${covered} frames`);
    assert.deepStrictEqual([early, late], ['love', 'curious'], 'on the empty chat she tilts her head once she lands');
    await back();
  });

  await check('from her perch on the open chat, she hops into the docked chat’s header', async () => {
    await page.click('#mPill');
    await page.waitForTimeout(1300);
    const perch = (await hop.edges(page, ['gooSlot'])).gooSlot;
    assert.ok(perch && !near(perch, home, 20), 'she is perched on the open chat');
    const f = await hopIn('pb');
    assert.ok(near(f.first, perch, 8), `her first frame in the header is on her perch: ${JSON.stringify(f.first)}`);
    assert.ok(f.between > 5, `she is between her perch and the header in ${f.between} frames`);
    assert.ok(inside(f.after, f.spot), 'she lands on the header’s spot');
    await back();
  });

  await check('flying up over the preview, she is drawn above its frame', async () => {
    const f = await hopIn('pb2'),
      frame = await page.evaluate(() => {
        const r = document.querySelector('#pr-preview iframe')?.getBoundingClientRect();
        return r && { l: r.left, t: r.top, r: r.right, b: r.bottom };
      });
    assert.ok(frame, 'the preview’s frame shows');
    const over = f.frames.filter(fr => {
        const x = fr.l + fr.w / 2,
          y = fr.t + fr.h / 2;
        return fr.home === 'mcPerch' && x > frame.l && x < frame.r && y > frame.t && y < frame.b;
      }),
      under = over.filter(fr => !fr.onTop).length;
    assert.ok(over.length > 5, `she passes over the preview’s frame in ${over.length} frames`);
    assert.strictEqual(under, 0, `the preview is drawn over her in ${under} of ${over.length} frames`);
    await back();
  });

  const fadesIn = async () => {
    const f = await hopIn('pb');
    assert.ok(near(f.first, home, 1), `she fades out in her box: ${JSON.stringify(f.first)}`);
    assert.strictEqual(f.between, 0, `she is between her box and the header in ${f.between} frames`);
    assert.ok(
      f.frames.some(fr => fr.opacity < 0.5),
      'she fades',
    );
    assert.ok(inside(f.after, f.spot), 'she ends on the header’s spot');
    await back();
  };
  for (const v of ['calm', 'calmest'] as const) {
    await check(`with her set to ${v}, she fades into the docked chat’s header without a hop`, async () => {
      await myraCalm(v);
      try {
        await fadesIn();
      } finally {
        await myraCalm('lively');
      }
    });
  }
  await check('with reduced motion, she fades into the docked chat’s header without a hop', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    try {
      await fadesIn();
    } finally {
      await page.emulateMedia({ reducedMotion: null });
    }
  });

  await check('from one prototype to another she stays on the header, with no hop', async () => {
    await open('pb');
    await page.waitForTimeout(1300);
    const f = await hop.flight(page, () => open('pb2'));
    assert.ok(f.before && !near(f.before, f.after, 20), 'the second prototype’s narrower chat moves the header’s spot');
    assert.strictEqual(f.between, 0, `she is between the two spots in ${f.between} frames`);
    assert.ok(inside(f.after, await headerSpot()), 'she sits on the header’s spot');
    await back();
  });

  await check('leaving a prototype while she is in the air, she sits in her box at once', async () => {
    await open('pb');
    await page.waitForTimeout(300);
    await back();
  });

  await check('on a phone she is in the docked chat’s header from the first frame, with no hop', async () => {
    await size(600, 900);
    try {
      const f = await hop.flight(page, () => open('pb')),
        there = f.frames.filter(fr => fr.home === 'mcPerch'),
        moved = there.filter(fr => !near(fr, f.after, 1)).length;
      assert.ok(there.length > 0, 'she is in the header');
      assert.strictEqual(moved, 0, `she moves in ${moved} of ${there.length} frames`);
      await open('one');
    } finally {
      await size(1920, 1080);
    }
  });

  await check('opening Fenmyr on a prototype board, she is in the header from the first frame', async () => {
    await open('pb');
    await page.waitForTimeout(1300);
    await page.reload();
    await page.waitForFunction(() => window.__fenmyr?.curBoard()?.id === 'pb');
    const f = await hop.flight(page, async () => {}),
      moved = f.frames.filter(fr => !near(fr, f.after, 1)).length;
    assert.strictEqual(moved, 0, `she moves in ${moved} frames`);
    assert.ok(inside(f.after, await headerSpot()), 'she sits on the header’s spot');
  });
} finally {
  const errors = [...l.errors];
  await l.close();
  for (const f of failed) console.log(`FAILED ${f}`);
  assert.deepStrictEqual(failed, [], 'every check passes');
  assert.deepStrictEqual(errors, []);
}
console.log('PROTO HOP OK');
