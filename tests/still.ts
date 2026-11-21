// still() and rect() on a real page, with boxes that move on their own transitions and animations. Each case reads a
// width straight after the call, so a wait that returns early shows as a width part-way to its end. Every miss is
// listed together, so one run says which cases fail.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { rect, still } from './support/settled.ts';

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'butter', text: 'A note' },
  board = { id: 'b', name: 'B', cards: [note], links: [], tray: [], view: { x: 300, y: 200, z: 1 } };

const l = await launch({ boards: [board], open: 'b' });
try {
  const { page } = l;
  const problems: string[] = [];
  const expect = (ok: boolean, what: string) => {
    if (!ok) problems.push(what);
  };

  await page.evaluate(() => {
    const css = document.createElement('style');
    css.textContent = `
      .fx { position: fixed; left: 0; width: 100px; height: 20px; z-index: 99999; }
      .fx.go { width: 300px; }
      #late { top: 0; transition: width 300ms linear 500ms; }
      #spin { top: 30px; animation: fx-spin 1s linear infinite; }
      #first { top: 60px; transition: width 200ms linear; }
      #second { top: 90px; transition: width 300ms linear; }
      #queued { top: 120px; transition: width 200ms linear; }
      #slow { top: 150px; transition: width 3000ms linear; }
      @keyframes fx-spin { to { transform: rotate(360deg); } }`;
    document.head.append(css);
    for (const id of ['late', 'spin', 'first', 'second', 'queued', 'slow']) {
      const box = document.createElement('div');
      box.id = id;
      box.className = 'fx';
      document.body.append(box);
      // a transition needs a style to start from, which a box gets at its first style recalculation
      box.getBoundingClientRect();
    }
    // the next transition starts a task after the first ends, so for one frame nothing is running
    document
      .getElementById('first')
      ?.addEventListener('transitionend', () =>
        setTimeout(() => document.getElementById('second')?.classList.add('go'), 0),
      );
  });
  const go = (id: string) => page.evaluate(i => document.getElementById(i)?.classList.add('go'), id);
  const width = (id: string) =>
    page.evaluate(i => {
      const e = document.getElementById(i);
      return e ? getComputedStyle(e).width : 'no such box';
    }, id);
  const running = () =>
    page.evaluate(
      () => document.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime)).length,
    );

  await go('late');
  await still(page);
  expect(
    (await width('late')) === '300px',
    `a transition that starts after a delay: ${await width('late')}, not 300px`,
  );

  const loops = await page.evaluate(
    () => document.getAnimations().filter(a => a.effect?.getComputedTiming().endTime === Infinity).length,
  );
  expect(loops > 0, 'the infinite animation was not running, so it was not tested');
  expect((await running()) === 0, `${await running()} finite animations still running`);

  await go('first');
  await still(page);
  expect((await width('first')) === '300px', `the first of two chained transitions: ${await width('first')}`);
  expect(
    (await width('second')) === '300px',
    `the second of two chained transitions: ${await width('second')}, not 300px`,
  );

  await page.evaluate(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('queued')?.classList.add('go')));
  });
  await still(page);
  expect((await width('queued')) === '300px', `a class change two frames away: ${await width('queued')}`);

  const box = await rect(page, '#late');
  expect(box.width === 300 && box.y === 0, `rect of a settled box: ${JSON.stringify(box)}`);
  const missing = await rect(page, '#nothing-here').then(
    () => 'it returned',
    (e: unknown) => String(e),
  );
  expect(missing.includes('#nothing-here'), `rect of a missing box: ${missing}`);

  await go('slow');
  const late = await still(page, { timeout: 400 }).then(
    () => 'it returned',
    (e: unknown) => String(e),
  );
  expect(
    /div#slow\.fx\.go transition of width/.test(late) && !late.includes('#spin'),
    `the timeout names what is moving: ${late}`,
  );

  assert.deepStrictEqual(problems, [], 'still and rect');
  assert.deepStrictEqual(l.errors, [], 'no page errors');
} finally {
  await l.close();
}
console.log('still: ok');
