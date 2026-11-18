// Myra's hop into a prototype board's docked header along the way: under the window's top edge with a tall chat, quick
// to get going and settled within about 0.75 s across a wide window while the hop onto the chat keeps its timing, from
// where Home showed her, and a click on her there. Also what a second open does mid-hop, and the tilt she gives an empty
// chat.
import assert from 'node:assert';
import type { Edges } from './support/bar.ts';
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
// Her time in the air as her frames bound it: at least from her first frame in the air to her last, at most from her
// last frame on the ground before them to her first after. A long frame as she takes off or lands widens the bounds and
// never moves them off her real time. Timed by her frames in the air alone, such a frame cut her time short. Frames so
// slow that watching ends before she lands leave no upper bound.
const inAir = (frames: hop.Frame[]) => {
  const first = frames.findIndex(f => f.air),
    last = frames.findLastIndex(f => f.air),
    before = frames[first - 1],
    a = frames[first],
    b = frames[last],
    after = frames[last + 1];
  assert.ok(a && b, 'she is in the air');
  return { least: b.ms - a.ms, most: before && after ? after.ms - before.ms : Number.POSITIVE_INFINITY };
};
// How soon she gets going, how far she is within her first 150 ms in the air, and when she is at rest, from her frames.
// Her first frame in the header is the switch. She is at rest after her last frame more than 1 px from where she ends,
// in place or in size, which a squash on landing counts in. That frame's time is what is used, so a frame dropped on a
// busy runner cannot make her look slower than she is.
const pace = ({ before, after, frames }: Awaited<ReturnType<typeof hop.flight>>) => {
  assert.ok(before, 'she shows before the switch');
  const gone = (f: { l: number; t: number }, q: Edges) => Math.hypot(f.l - q.l, f.t - q.t),
    switched = frames.find(f => f.home === 'mcPerch'),
    moved = frames.find(f => gone(f, before) > 3),
    air = frames.find(f => f.air),
    off = frames.findLastIndex(
      f => gone(f, after) > 1 || Math.abs(f.w - (after.r - after.l)) > 1 || Math.abs(f.h - (after.b - after.t)) > 1,
    ),
    rest = frames[off];
  assert.ok(switched && moved && air && rest, 'she moves, hops and comes to rest');
  assert.ok(gone(after, before) > 1000, 'she crosses more than 1000 px');
  // the share of the straight way from where she was to where she ends
  const line = { x: after.l - before.l, y: after.t - before.t },
    way = (f: hop.Frame) => ((f.l - before.l) * line.x + (f.t - before.t) * line.y) / (line.x ** 2 + line.y ** 2),
    upTo = frames.findLast(f => f.ms <= air.ms + 150),
    next = frames.find(f => f.ms > air.ms + 150),
    // Between the frames either side of the 150 ms mark, so which frame falls just short of it doesn't tip the result.
    // A frame held back across the mark leaves only the frame after it to go by.
    stalled = upTo && next && next.ms - upTo.ms > 40,
    covered =
      upTo && next && !stalled
        ? way(upTo) + ((way(next) - way(upTo)) * (air.ms + 150 - upTo.ms)) / (next.ms - upTo.ms)
        : way(next ?? upTo ?? air);
  return {
    moves: moved.ms - switched.ms,
    covered,
    rest: rest.ms - switched.ms,
    held: Math.max(...frames.slice(1).map((f, i) => f.ms - (frames[i]?.ms ?? 0))),
  };
};
// at least a third of the way in her first 150 ms in the air, and at rest by 0.75 s and a frame or two; every claim
// that fails is named
const quick = (f: Awaited<ReturnType<typeof hop.flight>>, held = 0) => {
  const p = pace(f),
    missed = [
      p.moves > 100 && `she first moves ${p.moves.toFixed(0)} ms after the switch`,
      p.covered < 1 / 3 && `she is ${(p.covered * 100).toFixed(0)}% of the way after 150 ms in the air`,
      p.rest > 800 && `she is at rest ${p.rest.toFixed(0)} ms after the switch`,
      p.held < held && `her longest frame is ${p.held.toFixed(0)} ms, not the ${held} ms held back`,
    ].filter(Boolean);
  assert.strictEqual(missed.join('; '), '');
};
const keeps480 = (frames: hop.Frame[]) => {
  const { least, most } = inAir(frames);
  assert.ok(least <= 480 && most >= 480, `she is in the air for ${Math.round(least)} to ${Math.round(most)} ms`);
};
// A slow runner busy as she hops: the main thread is held for `ms` in the first frame at least `after` ms into her
// crouch, or into her time in the air.
const holdFrame = (pose: 'crouch' | 'air', ms: number, after = 0) =>
  page.evaluate(
    ({ pose, ms, after }) => {
      const raf = window.requestAnimationFrame.bind(window),
        slot = document.getElementById('gooSlot'),
        mark = pose === 'air' ? 'rotate' : 'scale';
      let since: number | null = null,
        held = false;
      // every callback asked for before the hold runs through here, so only the first to get there holds
      window.requestAnimationFrame = cb =>
        raf(ts => {
          cb(ts);
          if (held || !slot?.style.transform.includes(mark)) return;
          since ??= ts;
          if (ts - since < after) return;
          held = true;
          window.requestAnimationFrame = raf;
          const until = performance.now() + ms;
          while (performance.now() < until);
        });
    },
    { pose, ms, after },
  );
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
    'across a 1920 px window she gets going within 100 ms, covers a third of the way in her first 150 ms in the air, and is at rest by 0.75 s, and she tilts once landed',
    async () => {
      const f = await hop.flight(page, () => open('pb'));
      quick(f);
      const tilt = f.frames.findIndex(fr => fr.anim === 'curious'),
        landed = f.frames.findLastIndex(fr => fr.air);
      assert.ok(tilt > landed, `she tilts her head once she has landed, frame ${tilt} after frame ${landed}`);
    },
  );

  await check('with a frame held back as she takes off, her hop is still as quick', async () => {
    await holdFrame('air', 100);
    quick(await hop.flight(page, () => open('pb')), 90);
  });

  await check('with a frame held back as she comes in to land, her hop is still as quick', async () => {
    await holdFrame('air', 200, 380);
    quick(await hop.flight(page, () => open('pb')), 190);
  });

  await check('her hop onto the open chat keeps its 480 ms in the air', async () => {
    keeps480((await hop.flight(page, () => page.click('#mPill'))).frames);
  });

  await check('with a frame held back as she crouches, her hop onto the open chat still keeps its 480 ms', async () => {
    await holdFrame('crouch', 250);
    keeps480((await hop.flight(page, () => page.click('#mPill'))).frames);
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
