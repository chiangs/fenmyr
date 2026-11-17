// How a waiting plan's preview reads. Its name sits on the top edge of its first box, in place of that box's own, the
// way a group's name sits on its outline, so it is plainly part of the preview and never over a card it leaves alone.
// Each other box's name sits on the box's top edge on its own fill, clear of the card's words and readable in light and
// dark. Screen readers skip the layer, and hovering a step with no boxes, such as a connector, dims none of the others.
import assert from 'node:assert';
import type { MyraReply } from '../src/shared/myraReply.ts';
import { replyBoard } from './fixtures/boards.ts';
import { type Launched, launch, settle } from './support/launch.ts';

const failed: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
    console.log(`ok    ${name}`);
  } catch (e) {
    failed.push(name);
    console.log(`FAIL  ${name}: ${e instanceof Error ? e.message : e}`);
  }
}
const notes = (n: number, more: (i: number) => object) =>
  Array.from({ length: n }, (_, i) => ({ type: 'note', text: `Task ${i + 1}`, ...more(i) }));
// a note reworded and one removed below the Backlog kanban, and eleven notes filed into Ideas beside it
const PLAN: MyraReply = {
  say: 'Sorted.',
  edit: [{ id: 'n1', text: 'Hers, reworded' }],
  remove: ['n3'],
  add: notes(11, i => ({ text: `Packed ${i}`, in: 'ideas' })),
  connect: [['n2', 'n4']],
};
async function waiting(l: Launched) {
  await l.page.evaluate(() => document.getElementById('mPill')?.click());
  await settle(l.page, 300);
  await l.page.evaluate(r => window.__fenmyr.answerMyra(r, 'q'), PLAN);
  await settle(l.page, 800);
  assert(await l.page.evaluate(() => window.__fenmyr.heldLists() !== null), 'it waits as a plan');
  await l.page.click('#mcClose');
}
async function at(l: Launched, z: number) {
  await l.page.evaluate(z => {
    Object.assign(window.__fenmyr.view, { x: 300, y: 120, z });
    window.__fenmyr.applyView();
  }, z);
  await settle(l.page, 500);
}
// Each name's fill and the contrast of its words on it, and whether it covers any of its card's words on screen.
const names = (l: Launched) =>
  l.page.evaluate(() => {
    const lum = (c: string) => {
      const [r = 0, g = 0, b = 0] = (c.match(/[\d.]+/g) ?? []).map(Number).map(v => v / 255);
      const f = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const meets = (a: DOMRect, b: DOMRect) =>
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    return [...document.querySelectorAll<HTMLElement>('#planPreview .pp-box:not(.laid) span:not(.pp-head)')].map(n => {
      const s = getComputedStyle(n),
        [hi, lo] = [lum(s.color), lum(s.backgroundColor)].sort((a, b) => b - a),
        id = n.closest<HTMLElement>('.pp-box')?.dataset.pp ?? '',
        words = document.querySelector(`#cards .card[data-id="${id}"] .text`),
        range = document.createRange();
      if (words) range.selectNodeContents(words);
      const lines = words ? [...range.getClientRects()] : [];
      return {
        id,
        opaque: ((s.backgroundColor.match(/[\d.]+/g) ?? []).map(Number)[3] ?? 1) === 1,
        contrast: Math.round((10 * ((hi ?? 0) + 0.05)) / ((lo ?? 0) + 0.05)) / 10,
        over: lines.some(r => meets(r, n.getBoundingClientRect())),
      };
    });
  });

let l = await launch({ boards: [replyBoard('look', 'look')], open: 'look', claude: true });

await check('the preview’s name sits on the top edge of its first box, over no card it leaves alone', async () => {
  await waiting(l);
  await at(l, 1);
  const seen = await page().evaluate(() => {
    const head = document.querySelector('#planPreview .pp-head'),
      box = head?.closest<HTMLElement>('.pp-box'),
      steps = [...document.querySelectorAll<HTMLElement>('#planPreview .pp-box:not(.laid)')],
      first = steps.sort((a, b) => a.offsetTop - b.offsetTop || a.offsetLeft - b.offsetLeft)[0],
      h = head?.getBoundingClientRect(),
      b = box?.getBoundingClientRect(),
      boxed = new Set([...document.querySelectorAll<HTMLElement>('#planPreview .pp-box')].map(x => x.dataset.pp)),
      under = [...document.querySelectorAll<HTMLElement>('#cards .card')].filter(c => {
        const r = c.getBoundingClientRect();
        return (
          !boxed.has(c.dataset.id) && h && r.left < h.right && r.right > h.left && r.top < h.bottom && r.bottom > h.top
        );
      });
    return {
      on: box?.dataset.pp,
      alone: box?.querySelectorAll('span').length,
      first: first?.dataset.pp,
      onEdge: !!h && !!b && Math.abs((h.top + h.bottom) / 2 - b.top) <= 2 && h.left > b.left && h.left < b.right,
      under: under.map(c => c.dataset.id),
    };
  });
  assert.strictEqual(seen.on, seen.first, 'on the box nearest the top, then the left');
  assert.deepStrictEqual(
    { onEdge: seen.onEdge, alone: seen.alone, under: seen.under },
    { onEdge: true, alone: 1, under: [] },
  );
});

await check('each box’s name has its own fill, clear of its card’s words, at 100% and 25%', async () => {
  for (const z of [1, 0.25]) {
    await at(l, z);
    const ns = await names(l);
    assert.strictEqual(ns.length, 12, 'each box a step names has its name, but the one carrying the preview’s');
    assert.deepStrictEqual(
      ns.filter(n => !n.opaque || n.contrast < 4.5),
      [],
      `every name reads clearly at ${z * 100}%`,
    );
    if (z === 1)
      assert.deepStrictEqual(
        ns.filter(n => n.over).map(n => n.id),
        [],
        'and none covers its card’s words',
      );
  }
});

await check('screen readers skip the preview', async () => {
  assert.strictEqual(await page().getAttribute('#planPreview', 'aria-hidden'), 'true');
  assert(!(await page().locator('#world').ariaSnapshot()).includes('Preview'), 'the board reads without it');
});

await check('hovering a step with no boxes dims none of the others', async () => {
  await page().evaluate(() => document.getElementById('mPill')?.click());
  await settle(page(), 300);
  const step = page().locator('#mcList .m-summary.plan.waiting li', { hasText: 'connector' });
  await step.hover();
  await settle(page(), 150);
  assert.deepStrictEqual(
    await page().evaluate(() => ({
      lit: document.getElementById('planPreview')?.classList.contains('lit'),
      hot: document.querySelectorAll('#planPreview .hot').length,
    })),
    { lit: false, hot: 0 },
  );
  await page().mouse.move(1, 1);
});

const errors = [...l.errors];
await l.close();
l = await launch({ boards: [replyBoard('look', 'look')], open: 'look', claude: true, settings: { theme: 'dark' } });

await check('in dark, each box’s name reads clearly at 100% and 25%', async () => {
  await waiting(l);
  for (const z of [1, 0.25]) {
    await at(l, z);
    const ns = await names(l);
    assert.strictEqual(ns.length, 12, 'each box a step names has its name, but the one carrying the preview’s');
    assert.deepStrictEqual(
      ns.filter(n => !n.opaque || n.contrast < 4.5),
      [],
      `every name reads clearly at ${z * 100}%`,
    );
  }
});

errors.push(...l.errors);
await l.close();
assert.deepStrictEqual(errors, [], 'no page errors');
if (failed.length) {
  console.log(`\n${failed.length} failed`);
  process.exit(1);
}
console.log('PLAN PREVIEW LOOK OK');

function page() {
  return l.page;
}
