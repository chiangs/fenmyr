import type { Page } from 'playwright';
import { bigBoard, everyOfflineCard } from './fixtures/boards.mts';
import { launch, ROOT } from './support/launch.mts';
import { checkout } from './support/ref.mts';

type Metrics = { openMs: number; openTaskMs: number; dragTaskMsPerMove: number; zoomTaskMsPerStep: number; editTaskMs: number; heapMB: number };
const RUNS = Number(process.env.PERF_RUNS ?? 5);

async function mainThread(page: Page, cdp: any, act: () => Promise<unknown>) {
	const total = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m: any) => m.name === 'TaskDuration').value * 1000;
	const before = await total();
	await act();
	return (await total()) - before;
}

async function measure(dir: string): Promise<Metrics> {
	const big = bigBoard();
	const l = await launch({ dir, boards: [everyOfflineCard(), big], open: 'every' });
	const { page, app } = l;
	const cdp = await app.context().newCDPSession(page);
	await cdp.send('Performance.enable');
	const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

	let openMs = 0;
	const openTaskMs = await mainThread(page, cdp, async () => {
		openMs = await page.evaluate(async (n) => {
			const t = performance.now();
			await window.__fenmyr.openBoard('big');
			while (document.querySelectorAll('#cards .card').length < n) await new Promise((r) => setTimeout(r, 5));
			await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
			return performance.now() - t;
		}, big.cards.length);
	});
	await page.waitForTimeout(1200);
	await page.keyboard.press('Control+0');
	await page.waitForTimeout(500);

	const pick = () => page.evaluate(() => {
		const stage = document.getElementById('stage')!.getBoundingClientRect();
		for (const el of document.querySelectorAll<HTMLElement>('#cards .card.note')) {
			const r = el.getBoundingClientRect();
			if (r.left > stage.left + 260 && r.right < stage.left + 980 && r.top > stage.top + 90 && r.bottom < stage.top + 710) return { x: r.left + 20, y: r.top + 12 };
		}
		throw new Error(`no note in view to drag at ${getComputedStyle(document.getElementById('world')!).transform} ${document.getElementById('zoom')!.textContent}`);
	});
	const MOVES = 60;
	const p = await pick();
	const dragTask = await mainThread(page, cdp, async () => {
		await page.mouse.move(p.x, p.y);
		await page.mouse.down();
		await page.mouse.move(p.x + 180, p.y + 90, { steps: MOVES });
		await page.mouse.up();
		await frames();
	});

	const STEPS = 10;
	const zooms: string[] = [];
	await page.mouse.move(720, 450);
	const zoomTask = await mainThread(page, cdp, async () => {
		await page.keyboard.down('Control');
		for (let i = 0; i < STEPS; i++) {
			await page.mouse.wheel(0, i < STEPS / 2 ? -120 : 120);
			await frames();
			zooms.push(await page.evaluate(() => document.getElementById('zoom')!.textContent!));
		}
		await page.keyboard.up('Control');
		await page.waitForFunction(() => !document.getElementById('stage')!.classList.contains('moving'));
	});
	if (new Set(zooms).size < STEPS / 2) throw new Error(`zoom did not step: ${zooms.join(' ')}`);
	await page.keyboard.press('Control+0');

	await page.waitForTimeout(800);
	const editTaskMs = await mainThread(page, cdp, async () => {
		for (let i = 0; i < 16; i++) {
			const q = await pick();
			const d = i % 2 ? -1 : 1;
			await page.mouse.move(q.x, q.y); await page.mouse.down(); await page.mouse.move(q.x + 12 * d, q.y + 6 * d, { steps: 3 }); await page.mouse.up();
			await saved(page);
		}
	});
	await cdp.send('HeapProfiler.collectGarbage');
	const heapMB = (await cdp.send('Performance.getMetrics')).metrics.find((m: any) => m.name === 'JSHeapUsedSize').value / 2 ** 20;
	if (l.errors.length) throw new Error(`page errors: ${l.errors.join('; ')}`);
	await l.close();
	return { openMs, openTaskMs, dragTaskMsPerMove: dragTask / MOVES, zoomTaskMsPerStep: zoomTask / STEPS, editTaskMs, heapMB };
}

const saved = async (page: Page) => {
	await page.waitForFunction(() => /saving/i.test(document.getElementById('saved')!.textContent!));
	await page.waitForFunction(() => document.getElementById('saved')!.textContent === 'saved');
};

const SLOWER = 1.1;
type Spread = { median: number; min: number; max: number };
const clearlyWorse = (head: Spread, base: Spread) => head.median > base.median * SLOWER && head.min > base.max;

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
function summary(runs: Metrics[]) {
	const keys = Object.keys(runs[0]) as (keyof Metrics)[];
	return Object.fromEntries(keys.map((k) => { const v = runs.map((r) => r[k]); return [k, { median: +median(v).toFixed(2), min: +Math.min(...v).toFixed(2), max: +Math.max(...v).toFixed(2) }]; }));
}

const ref = process.argv[2];
const sides: Record<string, string> = { head: ROOT };
const worktree = ref ? checkout(ref) : null;
if (worktree) sides[ref] = worktree.dir;
const runs: Record<string, Metrics[]> = Object.fromEntries(Object.keys(sides).map((k) => [k, []]));
try {
	for (let i = 0; i < RUNS; i++) for (const [name, dir] of Object.entries(sides)) runs[name].push(await measure(dir));
} finally {
	worktree?.remove();
}
const report = Object.fromEntries(Object.entries(runs).map(([k, v]) => [k, summary(v)]));
console.log(JSON.stringify({ runs: RUNS, ...report }, null, 1));
if (ref) {
	const worse = (Object.keys(report.head) as (keyof Metrics)[]).filter((k) => {
		return clearlyWorse(report.head[k], report[ref][k]);
	});
	console.log(worse.length ? `PERF WORSE: ${worse.join(', ')}` : 'PERF OK');
	process.exit(worse.length ? 1 : 0);
}
