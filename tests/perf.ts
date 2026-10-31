import type { CDPSession, Page } from 'playwright';
import { bigBoard, everyOfflineCard } from './fixtures/boards.ts';
import { launch, ROOT } from './support/launch.ts';
import { checkout } from './support/ref.ts';

type Metrics = {
  openMs: number;
  openTaskMs: number;
  dragTaskMsPerMove: number;
  zoomTaskMsPerStep: number;
  editTaskMs: number;
  heapMB: number;
};
const RUNS = Number(process.env.PERF_RUNS ?? 5);

async function metric(cdp: CDPSession, name: string) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const found = metrics.find(m => m.name === name);
  if (!found) throw new Error(`Chromium reported no ${name}`);
  return found.value;
}

async function mainThread(cdp: CDPSession, act: () => Promise<unknown>) {
  const before = await metric(cdp, 'TaskDuration');
  await act();
  return ((await metric(cdp, 'TaskDuration')) - before) * 1000;
}

async function measure(dir: string): Promise<Metrics> {
  const big = bigBoard();
  const l = await launch({ dir, boards: [everyOfflineCard(), big], open: 'every' });
  const { page, app } = l;
  const cdp = await app.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

  let openMs = 0;
  const openTaskMs = await mainThread(cdp, async () => {
    openMs = await page.evaluate(async n => {
      const t = performance.now();
      await window.__fenmyr.openBoard('big');
      while (document.querySelectorAll('#cards .card').length < n) await new Promise(r => setTimeout(r, 5));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return performance.now() - t;
    }, big.cards.length);
  });
  await page.waitForTimeout(1200);
  await page.keyboard.press('Control+0');
  await page.waitForTimeout(500);

  const pick = () =>
    page.evaluate(() => {
      const stage = document.getElementById('stage')?.getBoundingClientRect();
      if (!stage) throw new Error('the board has no stage');
      for (const el of document.querySelectorAll<HTMLElement>('#cards .card.note')) {
        const r = el.getBoundingClientRect();
        if (
          r.left > stage.left + 260 &&
          r.right < stage.left + 980 &&
          r.top > stage.top + 90 &&
          r.bottom < stage.top + 710
        )
          return { x: r.left + 20, y: r.top + 12 };
      }
      const world = document.getElementById('world');
      const view = world ? getComputedStyle(world).transform : 'no world';
      const zoom = document.getElementById('zoom')?.textContent;
      throw new Error(`no note in view to drag at ${view} ${zoom}`);
    });
  const MOVES = 60;
  const p = await pick();
  const dragTask = await mainThread(cdp, async () => {
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 180, p.y + 90, { steps: MOVES });
    await page.mouse.up();
    await frames();
  });

  const STEPS = 10;
  const zooms: string[] = [];
  await page.mouse.move(720, 450);
  const zoomTask = await mainThread(cdp, async () => {
    await page.keyboard.down('Control');
    for (let i = 0; i < STEPS; i++) {
      await page.mouse.wheel(0, i < STEPS / 2 ? -120 : 120);
      await frames();
      zooms.push(await page.evaluate(() => document.getElementById('zoom')?.textContent ?? ''));
    }
    await page.keyboard.up('Control');
    await page.waitForFunction(() => !document.getElementById('stage')?.classList.contains('moving'));
  });
  if (new Set(zooms).size < STEPS / 2) throw new Error(`zoom did not step: ${zooms.join(' ')}`);
  await page.keyboard.press('Control+0');

  await page.waitForTimeout(800);
  const editTaskMs = await mainThread(cdp, async () => {
    for (let i = 0; i < 16; i++) {
      const q = await pick();
      const d = i % 2 ? -1 : 1;
      await page.mouse.move(q.x, q.y);
      await page.mouse.down();
      await page.mouse.move(q.x + 12 * d, q.y + 6 * d, { steps: 3 });
      await page.mouse.up();
      await saved(page);
    }
  });
  await cdp.send('HeapProfiler.collectGarbage');
  const heapMB = (await metric(cdp, 'JSHeapUsedSize')) / 2 ** 20;
  if (l.errors.length) throw new Error(`page errors: ${l.errors.join('; ')}`);
  await l.close();
  return {
    openMs,
    openTaskMs,
    dragTaskMsPerMove: dragTask / MOVES,
    zoomTaskMsPerStep: zoomTask / STEPS,
    editTaskMs,
    heapMB,
  };
}

const saved = async (page: Page) => {
  await page.waitForFunction(() => /saving/i.test(document.getElementById('saved')?.textContent ?? ''));
  await page.waitForFunction(() => document.getElementById('saved')?.textContent === 'saved');
};

const METRICS = ['openMs', 'openTaskMs', 'dragTaskMsPerMove', 'zoomTaskMsPerStep', 'editTaskMs', 'heapMB'] as const;
const SLOWER = 1.1;
type Spread = { median: number; min: number; max: number };
const clearlyWorse = (head: Spread, base: Spread) => head.median > base.median * SLOWER && head.min > base.max;

const round = (n: number) => +n.toFixed(2);
function spread(xs: number[]): Spread {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
  return { median: round(mid), min: round(Math.min(...xs)), max: round(Math.max(...xs)) };
}
function summary(runs: Metrics[]): Record<keyof Metrics, Spread> {
  const of = (k: keyof Metrics) => spread(runs.map(r => r[k]));
  return {
    openMs: of('openMs'),
    openTaskMs: of('openTaskMs'),
    dragTaskMsPerMove: of('dragTaskMsPerMove'),
    zoomTaskMsPerStep: of('zoomTaskMsPerStep'),
    editTaskMs: of('editTaskMs'),
    heapMB: of('heapMB'),
  };
}

const ref = process.argv[2];
const base = ref ? checkout(ref) : null;
const headRuns: Metrics[] = [];
const baseRuns: Metrics[] = [];
try {
  for (let i = 0; i < RUNS; i++) {
    headRuns.push(await measure(ROOT));
    if (base) baseRuns.push(await measure(base.dir));
  }
} finally {
  base?.remove();
}
const head = summary(headRuns);
console.log(JSON.stringify({ runs: RUNS, head, ...(ref ? { [ref]: summary(baseRuns) } : {}) }, null, 1));
if (ref) {
  const was = summary(baseRuns);
  const worse = METRICS.filter(k => clearlyWorse(head[k], was[k]));
  console.log(worse.length ? `PERF WORSE: ${worse.join(', ')}` : 'PERF OK');
  process.exit(worse.length ? 1 : 0);
}
