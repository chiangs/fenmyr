import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const GENERATED = /^(web\/vendor\/|web\/icons\/pack\.js$|web\/licenses\.js$)/;
const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).split('\n')
	.filter((f) => /\.(m?[jt]s|tsx|css|html)$/.test(f) && !GENERATED.test(f) && fs.existsSync(path.join(ROOT, f)));

const areas: Record<string, string> = { renderer: '^(web|src/web)/', host: '^(linux|src/host|src/shared)/', tests: '^tests/', tools: '^tools/' };
const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;
const rows = Object.entries(areas).map(([area, re]) => {
	const mine = files.filter((f) => new RegExp(re).test(f));
	const texts = mine.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'));
	const lines = texts.flatMap((t) => t.split('\n'));
	return {
		area,
		files: mine.length,
		lines: lines.length,
		kb: Math.round(texts.reduce((n, t) => n + Buffer.byteLength(t), 0) / 1024),
		longestLine: Math.max(0, ...lines.map((l) => l.length)),
		over300: lines.filter((l) => l.length > 300).length,
		innerHTML: texts.reduce((n, t) => n + count(t, /\.innerHTML\s*[+]?=/g), 0),
		tsNocheck: texts.reduce((n, t) => n + count(t, new RegExp(['@ts', 'nocheck'].join('-'), 'g')), 0),
		anys: texts.reduce((n, t) => n + count(t, /:\s*any\b|\bas any\b|<any>/g), 0),
	};
});
if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
else console.table(rows);
