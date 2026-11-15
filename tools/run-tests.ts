// Runs every test in tests/, or the ones named, each as its own node process, one at a time, and keeps going past a
// failure. `--shard 2/4` runs the second of four parts, balanced on the seconds each test last took in CI.
//   node tools/run-tests.ts [--shard i/n] [name ...]    run them
//   node tools/run-tests.ts --list [--shard i/n]         print the files a run would take, one per line
//   gh run view <id> --log | node tools/run-tests.ts --write-times    refresh tools/test-times.json from a run's log
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { readDescriptions } from './code-map/descriptions.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const TIMES = path.join(import.meta.dirname, 'test-times.json');
// perf compares against another checkout on a quiet machine, and voice asks the real Myra, so neither runs unattended
const SKIPPED = new Set(['tests/perf.ts', 'tests/voice.ts']);
const RESULT = /(tests\/[\w.-]+\.ts) passed in ([\d.]+)s/g;

type Shard = { index: number; count: number };
type Mode =
  | { kind: 'run'; shard: Shard | null; names: string[] }
  | { kind: 'list'; shard: Shard | null }
  | { kind: 'write-times' };
type Load = { seconds: number; tests: string[] };

function parseShard(text: string | undefined): Shard {
  const m = /^(\d+)\/(\d+)$/.exec(text ?? '');
  const index = Number(m?.[1]),
    count = Number(m?.[2]);
  if (!m || count < 1 || index < 1 || index > count) throw new Error(`--shard takes i/n with 1 <= i <= n, not ${text}`);
  return { index, count };
}

function parseArgs(args: string[]): Mode {
  let shard: Shard | null = null,
    list = false;
  const names: string[] = [],
    rest = [...args];
  for (let arg = rest.shift(); arg !== undefined; arg = rest.shift()) {
    if (arg === '--write-times') return { kind: 'write-times' };
    if (arg === '--list') list = true;
    else if (arg === '--shard') shard = parseShard(rest.shift());
    else if (arg.startsWith('--shard=')) shard = parseShard(arg.slice('--shard='.length));
    else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`);
    else names.push(arg);
  }
  return list ? { kind: 'list', shard } : { kind: 'run', shard, names };
}

const allTests = () =>
  fs
    .readdirSync(path.join(ROOT, 'tests'))
    .filter(f => f.endsWith('.ts'))
    .map(f => `tests/${f}`)
    .filter(f => !SKIPPED.has(f))
    .sort();

function readTimes(): Record<string, number> {
  const raw: unknown = fs.existsSync(TIMES) ? JSON.parse(fs.readFileSync(TIMES, 'utf8')) : {};
  const out: Record<string, number> = {};
  if (typeof raw === 'object' && raw !== null)
    for (const [file, s] of Object.entries(raw)) if (typeof s === 'number') out[file] = s;
  return out;
}

// Longest first, each to the part with the fewest seconds so far. A test with no recorded time counts as the median,
// so a new test needs no edit here and the parts drift apart only slowly until the times are refreshed.
function shardOf(tests: string[], { index, count }: Shard): string[] {
  const times = readTimes();
  const known = tests.flatMap(t => times[t] ?? []).sort((a, b) => a - b);
  const median = known[known.length >> 1] ?? 1;
  const weight = (t: string) => times[t] ?? median;
  const loads: Load[] = Array.from({ length: count }, () => ({ seconds: 0, tests: [] }));
  for (const t of [...tests].sort((a, b) => weight(b) - weight(a) || a.localeCompare(b))) {
    const lightest = loads.reduce((min, l) => (l.seconds < min.seconds ? l : min));
    lightest.seconds += weight(t);
    lightest.tests.push(t);
  }
  return loads[index - 1]?.tests.sort() ?? [];
}

function pick(tests: string[], names: string[]): string[] {
  const wanted = names.map(n => `tests/${path.basename(n).replace(/\.ts$/, '')}.ts`);
  const unknown = wanted.filter(w => !tests.includes(w));
  if (unknown.length) throw new Error(`no such test: ${unknown.join(', ')}`);
  return [...new Set(wanted)];
}

function run(tests: string[]) {
  const inActions = process.env.GITHUB_ACTIONS === 'true';
  const descriptions = readDescriptions().files;
  const failed: string[] = [];
  const started = performance.now();
  for (const file of tests) {
    const title = `${file}: ${descriptions[file] ?? 'no description'}`;
    console.log(inActions ? `::group::${title}` : `\n${title}`);
    const begin = performance.now();
    const r = spawnSync(process.execPath, [file], { cwd: ROOT, stdio: 'inherit' });
    const seconds = ((performance.now() - begin) / 1000).toFixed(1);
    if (inActions) console.log('::endgroup::');
    const outcome = r.status === 0 ? 'passed' : `failed (${r.error?.message ?? r.signal ?? `exit ${r.status}`})`;
    console.log(`${file} ${outcome} in ${seconds}s`);
    if (r.status === 0) continue;
    failed.push(file);
    if (inActions) console.log(`::error title=${file} failed::${title}`);
  }
  const total = ((performance.now() - started) / 1000).toFixed(0);
  console.log(`\nPassed ${tests.length - failed.length}, failed ${failed.length}, in ${total}s.`);
  if (!failed.length) return;
  console.log(`Failed:\n${failed.map(f => `  ${f}`).join('\n')}`);
  process.exitCode = 1;
}

function writeTimes(log: string) {
  const tests = new Set(allTests());
  const times: Record<string, number> = {};
  for (const [file, s] of Object.entries(readTimes())) if (tests.has(file)) times[file] = s;
  for (const [, file = '', s] of log.matchAll(RESULT)) if (tests.has(file)) times[file] = Number(s);
  const sorted = Object.fromEntries(Object.entries(times).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(TIMES, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`${path.relative(ROOT, TIMES)}: ${Object.keys(sorted).length} of ${tests.size} tests timed`);
}

const mode = parseArgs(process.argv.slice(2));
switch (mode.kind) {
  case 'write-times':
    writeTimes(fs.readFileSync(0, 'utf8'));
    break;
  case 'list':
    console.log((mode.shard ? shardOf(allTests(), mode.shard) : allTests()).join('\n'));
    break;
  case 'run': {
    const tests = mode.names.length ? pick(allTests(), mode.names) : allTests();
    run(mode.shard ? shardOf(tests, mode.shard) : tests);
    break;
  }
  default: {
    const never: never = mode;
    throw new Error(`unknown mode ${JSON.stringify(never)}`);
  }
}
