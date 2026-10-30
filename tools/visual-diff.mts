import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright';
import { everyOfflineCard } from '../tests/fixtures/boards.mts';
import { launch, ROOT, settle } from '../tests/support/launch.mts';
import { checkout } from '../tests/support/ref.mts';

type Step = (page: Page) => Promise<void>;
type Group = { settings?: Record<string, unknown>; phone?: boolean; states: [string, Step][] };

const FROZEN_MOTION = '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }';
const HIDDEN_RANDOM_CANVASES = 'canvas { visibility: hidden !important; }';
const HIDDEN_COMMIT_DATE = '#suSub { visibility: hidden !important; }';
const CHANNEL_TOLERANCE = 2;
const TABS = ['general', 'myra', 'helpers', 'vaults', 'board', 'toolbar', 'widgets', 'about'];

const center = async (page: Page, sel: string) => {
	const r = (await page.locator(sel).first().boundingBox())!;
	return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};
const select = (ids: string[]): Step => async (page) => { await page.evaluate((x) => window.__fenmyr.selectOnly(x), ids); };
const keys = (...k: string[]): Step => async (page) => { for (const key of k) await page.keyboard.press(key); };

const board: [string, Step][] = [
	['board', async () => {}],
	['select-note', select(['note'])],
	['select-shape', select(['shape'])],
	['select-several', select(['note', 'todo', 'swatch'])],
	['card-menu', async (page) => { const p = await center(page, '#cards [data-id="note"]'); await page.mouse.click(p.x, p.y, { button: 'right' }); }],
	['zoom-in', keys('Control+0', 'Control+=', 'Control+=', 'Control+=')],
	['zoom-out', keys('Control+0', 'Control+-', 'Control+-', 'Control+-')],
	['home', async (page) => { await page.click('#homeBtn'); }],
];
const GROUPS: Record<string, Group> = {
	light: { states: board },
	dark: { settings: { theme: 'dark' }, states: board.slice(0, 3) },
	phone: { phone: true, states: [['board', async () => {}]] },
	settings: { states: TABS.map((t) => [t, async (page) => { if (!(await page.locator('#settings.on').count())) await page.click('#gearBtn'); await page.click(`#setTabs [data-tab="${t}"]`); }]) },
	panels: {
		states: [
			['doc-editor', async (page) => { await page.locator('#cards .card.doc').dblclick(); await page.waitForSelector('.dv-prose'); }],
			['myra-chat', async (page) => { await page.keyboard.press('Escape'); await page.click('#mPill'); }],
		],
	},
};

async function shoot(dir: string, out: string) {
	fs.mkdirSync(out, { recursive: true });
	for (const [name, group] of Object.entries(GROUPS)) {
		const l = await launch({ dir, boards: [everyOfflineCard()], open: 'every', settings: group.settings });
		if (group.phone) {
			await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(600, 900));
			await settle(l.page);
		}
		await l.page.addStyleTag({ content: FROZEN_MOTION + HIDDEN_RANDOM_CANVASES + HIDDEN_COMMIT_DATE });
		for (const [state, step] of group.states) {
			await step(l.page);
			await settle(l.page, 500);
			await l.page.screenshot({ path: path.join(out, `${name === 'light' ? '' : `${name}-`}${state}.png`) });
		}
		if (l.errors.length) throw new Error(`${name}: page errors in ${dir}: ${l.errors.join('; ')}`);
		await l.close();
	}
}

async function compare(page: Page, a: string, b: string, diff: string) {
	const url = (f: string) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
	const r = await page.evaluate(async ([ua, ub, tolerance]) => {
		const img = (u: string) => new Promise<HTMLImageElement>((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = u; });
		const [ia, ib] = await Promise.all([img(ua), img(ub)]);
		if (ia.width !== ib.width || ia.height !== ib.height) return { changed: -1, total: 0, png: '' };
		const pix = (i: HTMLImageElement) => { const c = new OffscreenCanvas(i.width, i.height), x = c.getContext('2d')!; x.drawImage(i, 0, 0); return x.getImageData(0, 0, i.width, i.height); };
		const da = pix(ia), db = pix(ib), out = new ImageData(ia.width, ia.height);
		let changed = 0;
		for (let p = 0; p < da.data.length; p += 4) {
			const d = Math.max(Math.abs(da.data[p] - db.data[p]), Math.abs(da.data[p + 1] - db.data[p + 1]), Math.abs(da.data[p + 2] - db.data[p + 2]));
			const hit = d > tolerance;
			if (hit) changed++;
			out.data.set(hit ? [255, 0, 80, 255] : [da.data[p], da.data[p + 1], da.data[p + 2], 60], p);
		}
		if (!changed) return { changed, total: da.data.length / 4, png: '' };
		const c = new OffscreenCanvas(ia.width, ia.height); c.getContext('2d')!.putImageData(out, 0, 0);
		const blob = await c.convertToBlob();
		const bytes = new Uint8Array(await blob.arrayBuffer());
		let s = ''; for (const n of bytes) s += String.fromCharCode(n);
		return { changed, total: da.data.length / 4, png: btoa(s) };
	}, [url(a), url(b), CHANNEL_TOLERANCE] as const);
	if (r.png) fs.writeFileSync(diff, Buffer.from(r.png, 'base64'));
	return r;
}

const hasRef = (r: string) => { try { execFileSync('git', ['rev-parse', '--verify', '--quiet', r], { cwd: ROOT, stdio: 'ignore' }); return true; } catch { return false; } };
const ref = process.argv[2] ?? (hasRef('origin/main') ? 'origin/main' : 'main');
const out = process.env.VISUAL_OUT ?? fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-visual-'));
const base = checkout(ref);
try {
	await shoot(base.dir, path.join(out, 'ref'));
	await shoot(ROOT, path.join(out, 'head'));
} finally {
	base.remove();
}
const judge = await launch({ boards: [everyOfflineCard()], open: 'every' });
let failed = 0;
for (const f of fs.readdirSync(path.join(out, 'ref')).sort()) {
	const r = await compare(judge.page, path.join(out, 'ref', f), path.join(out, 'head', f), path.join(out, `diff-${f}`));
	const ok = r.changed === 0;
	if (!ok) failed++;
	console.log(`${ok ? 'same' : 'DIFF'}  ${f.replace('.png', '').padEnd(20)} ${r.changed < 0 ? 'size changed' : `${r.changed} px`}`);
}
await judge.close();
console.log(`${failed ? 'VISUAL CHANGED' : 'VISUAL SAME'}: ${failed} of ${fs.readdirSync(path.join(out, 'ref')).length} states differ from ${ref}. Screenshots in ${out}`);
process.exit(failed ? 1 : 0);
