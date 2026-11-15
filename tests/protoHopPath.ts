// Myra's hop into a prototype board's docked header along the way: under the window's top edge with a tall chat, no
// faster than a stroll across a wide window while the hop onto the chat keeps its timing, from where Home showed her,
// and a click on her there. Also what a second open does mid-hop, and the tilt she gives an empty chat.
import assert from 'node:assert';
import * as hop from './support/flight.ts';
import { launch, settle } from './support/launch.ts';
import { freshRepo, openPrototype } from './support/prototype.ts';

const { repo } = freshRepo('fenmyr-proto-path-');
const note = { id: 'n1', type: 'note', x: 40, y: 40, w: 220, h: 120, text: 'A note' };
const l = await launch({ boards: [{ id: 'one', name: 'One', cards: [note], links: [], tray: [] }] });
const { page } = l;

const open = (id: string) => page.evaluate(id => window.__fenmyr.openBoard(id), id);
const failed: string[] = [];
// One that fails partway can leave a prototype, Home or the chat open, so the next starts back on One, chat closed.
const check = async (name: string, run: () => Promise<void>) => {
  try {
    await run();
  } catch (e) {
    failed.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (await page.evaluate(() => !!document.getElementById('home')?.classList.contains('on')))
    await page.keyboard.press('Escape');
  const board = await page.evaluate(() => window.__fenmyr.curBoard()?.id),
    chat = await page.evaluate(() => !!document.getElementById('myra')?.classList.contains('chat'));
  if (board !== 'one') await open('one');
  else if (chat) await page.click('#mcClose');
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    window.__fenmyr.playAnim('love', false);
    window.__fenmyr.stopAnim();
  });
};
const size = async (w: number, h: number) => {
  await l.app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]?.setSize(s.w, s.h), { w, h });
  await settle(page, 400);
};
const perch = async () => {
  await page.click('#mPill');
  await page.waitForTimeout(1300);
};
const spot = async () => {
  const { mcPerch } = await hop.edges(page, ['mcPerch']);
  assert.ok(mcPerch, 'the header’s spot shows');
  return mcPerch;
};
const centre = (f: hop.Frame) => ({ x: f.l + f.w / 2, y: f.t + f.h / 2 });
const apart = (a: hop.Frame, b: hop.Frame) => Math.hypot(centre(a).x - centre(b).x, centre(a).y - centre(b).y);
// straight from her first frame in the air to her last, over the time between them, in px per ms
const airSpeed = (frames: hop.Frame[]) => {
  const air = frames.filter(f => f.air),
    a = air[0],
    b = air.at(-1);
  assert.ok(a && b && b.ms > a.ms, `she is in the air in ${air.length} frames`);
  return { speed: apart(a, b) / (b.ms - a.ms), ms: b.ms - a.ms };
};
const myraCalm = async (v: 'lively' | 'calmest') => {
  await page.click('#gearBtn');
  await page.click('#setTabs [data-tab="myra"]');
  await page.click(`[data-seg="myraCalm"] [data-v="${v}"]`);
  await page.click('#setClose');
  await page.waitForTimeout(300);
};

try {
  await page.evaluate(() =>
    localStorage.setItem('fenmyr:protoLayout', JSON.stringify({ pb2: { chat: 280, preview: 700, code: 360 } })),
  );
  await openPrototype(page, repo);
  await page.evaluate(async repo => {
    const proto = await window.Fenmyr.protoCreate({ root: repo, name: 'Receipts', stack: 'react' });
    await window.Fenmyr.save({
      id: 'pb2',
      name: 'Receipts',
      folder: 'pf',
      kind: 'prototype',
      proto,
      cards: [],
      links: [],
      tray: [],
    });
    await window.__fenmyr.refreshBoards();
  }, repo);
  await size(1920, 1080);
  await open('one');
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    window.__fenmyr.playAnim('love', false);
    window.__fenmyr.stopAnim();
  });

  await check('from her perch on a tall chat she stays under the window’s top edge', async () => {
    await page.evaluate(() => localStorage.setItem('fenmyr:chatH', '760'));
    try {
      for (const [w, h] of [
        [900, 800],
        [1280, 720],
        [1440, 900],
      ] as const) {
        await size(w, h);
        await page.reload();
        await page.waitForFunction(() => window.__fenmyr?.curBoard()?.id === 'one');
        await settle(page);
        await perch();
        const f = await hop.flight(page, () => open('pb')),
          top = Math.min(...f.frames.map(fr => fr.t));
        assert.ok(f.between > 5, `at ${w}x${h} she hops, between her perch and the header in ${f.between} frames`);
        assert.ok(top >= 0, `at ${w}x${h} her top reaches ${top.toFixed(1)} px`);
        await open('one');
        await page.waitForTimeout(900);
      }
    } finally {
      await page.evaluate(() => localStorage.removeItem('fenmyr:chatH'));
      await size(1920, 1080);
      await open('one');
      await page.reload();
      await page.waitForFunction(() => window.__fenmyr?.curBoard()?.id === 'one');
      await settle(page);
    }
  });

  await check(
    'across a 1920 px window her hop is no faster than 1.7 px per ms, and she tilts once landed',
    async () => {
      const f = await hop.flight(page, () => open('pb')),
        { speed } = airSpeed(f.frames);
      const a = f.frames[0],
        b = f.frames.at(-1);
      assert.ok(a && b && apart(a, b) > 1000, 'she crosses more than 1000 px');
      assert.ok(speed <= 1.7, `she flies at ${speed.toFixed(2)} px per ms`);
      const tilt = f.frames.findIndex(fr => fr.anim === 'curious'),
        landed = f.frames.findLastIndex(fr => fr.air);
      assert.ok(tilt > landed, `she tilts her head once she has landed, frame ${tilt} after frame ${landed}`);
    },
  );

  await check('her hop onto the open chat keeps its 480 ms in the air', async () => {
    const f = await hop.flight(page, () => page.click('#mPill')),
      { ms } = airSpeed(f.frames);
    assert.ok(ms > 400 && ms < 490, `she is in the air for ${Math.round(ms)} ms`);
  });

  await check('from Home she hops from where Home showed her, with no jump', async () => {
    await size(1440, 900);
    try {
      await page.evaluate(() => window.__fenmyr.openHome('folder:pf'));
      await page.waitForTimeout(900);
      const seen = (await hop.edges(page, ['gooSlot'])).gooSlot;
      assert.ok(seen, 'she shows at Home');
      const f = await hop.flight(page, () => page.locator('.tile.board', { hasText: 'Checkout flow' }).click()),
        first = f.frames.find(fr => fr.home === 'mcPerch'),
        // on the ground, from frame to frame; in the air her speed is checked above
        jumps = f.frames.flatMap((b, i) => {
          const a = f.frames[i - 1];
          return a && !a.air && !b.air && apart(a, b) > 60 ? [Math.round(apart(a, b))] : [];
        });
      assert.ok(
        first && Math.hypot(first.l - seen.l, first.t - seen.t) <= 8,
        `her first frame in the header is where Home showed her: ${JSON.stringify(first)}`,
      );
      assert.deepStrictEqual(jumps, [], 'on the ground no frame jumps more than 60 px');
      assert.ok(f.between > 5, `she hops, between Home and the header in ${f.between} frames`);
    } finally {
      await size(1920, 1080);
    }
  });

  await check('a click on her in the docked header starts an animation', async () => {
    await open('pb');
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      window.__fenmyr.playAnim('love', false);
      window.__fenmyr.stopAnim();
    });
    const cursor = await page.locator('#gooSlot').evaluate(el => getComputedStyle(el).cursor);
    await page.click('#gooSlot');
    const anim = await page.evaluate(() => window.__fenmyr.lastAnimName());
    assert.notStrictEqual(anim, 'love', 'an animation starts');
    assert.strictEqual(cursor, 'pointer', 'the pointer shows she can be clicked');
  });

  await check('when a timer ends on a prototype board, she wiggles in the docked header', async () => {
    await open('pb');
    await page.waitForTimeout(1500);
    // what the end of a timer does to her box
    const names = await page.evaluate(() => {
      const myra = document.getElementById('myra');
      myra?.classList.add('partying');
      const on = document.getElementById('goo')?.getAnimations() ?? [];
      myra?.classList.remove('partying');
      return on.map(a => (a instanceof CSSAnimation ? a.animationName : ''));
    });
    assert.ok(names.includes('m-party-slot'), `her animations: ${names.join(', ') || 'none'}`);
  });

  await check('back in her box after a prototype seen on a phone, a click on her opens the chat', async () => {
    await perch();
    await open('pb');
    await page.waitForTimeout(1300);
    await size(600, 900);
    await open('one');
    await page.waitForTimeout(600);
    await size(1920, 1080);
    await page.click('#gooSlot');
    await page.waitForTimeout(300);
    const chat = await page.evaluate(() => !!document.getElementById('myra')?.classList.contains('chat'));
    assert.ok(chat, 'the chat opens');
  });

  // the second opens while she is still in the air, and late enough that a tilt left from the first would come first
  const twice = () =>
    hop.flight(page, async () => {
      await open('pb');
      await page.waitForTimeout(500);
      await open('pb2');
    });
  await check('opening a second prototype mid-hop, she sits on its header at once', async () => {
    const f = await twice(),
      there = await spot(),
      after = f.frames.filter(fr => fr.board === 'pb2'),
      off = after.filter(fr => Math.hypot(fr.l - there.l, fr.t - there.t) > 1);
    assert.ok(after.length > 0, 'the second prototype opens');
    assert.strictEqual(off.length, 0, `she is off its header’s spot in ${off.length} of ${after.length} frames`);
  });

  await check('opening a second prototype before she tilts, she tilts once, after the second', async () => {
    const f = await twice(),
      second = f.frames.find(fr => fr.board === 'pb2'),
      tilt = f.frames.find(fr => fr.anim === 'curious');
    assert.ok(second && tilt, 'she tilts her head on the empty chat');
    assert.ok(tilt.ms - second.ms > 550, `she tilts ${Math.round(tilt.ms - second.ms)} ms after the second opens`);
  });

  await check('with her set to calmest, she tilts her head once she has faded in', async () => {
    await myraCalm('calmest');
    try {
      const f = await hop.flight(page, () => open('pb')),
        tilt = f.frames.findIndex(fr => fr.anim === 'curious'),
        faded = f.frames.findLastIndex(fr => fr.opacity < 1);
      assert.ok(tilt >= 0 && faded >= 0, 'she fades in and tilts her head');
      assert.ok(
        tilt > faded,
        `she tilts at ${f.frames[tilt]?.ms.toFixed(0)} ms, faded in at ${f.frames[faded]?.ms.toFixed(0)} ms`,
      );
    } finally {
      await myraCalm('lively');
    }
  });
} finally {
  const errors = [...l.errors];
  await l.close();
  for (const f of failed) console.log(`FAILED ${f}`);
  assert.deepStrictEqual(failed, [], 'every check passes');
  assert.deepStrictEqual(errors, []);
}
console.log('PROTO HOP PATH OK');
