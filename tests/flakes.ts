// The CI ledger, from saved gh output: what a log's first attempt failed on, which reruns passed on the same commit, the table and its summary.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { parseRuns } from '../tools/flakes-gh.ts';
import { buildLedger, createdSince, isRerun, renderLedger } from '../tools/flakes-ledger.ts';
import { type Failure, parseLog } from '../tools/flakes-log.ts';

const FIXTURES = path.join(import.meta.dirname, 'fixtures', 'flakes');
const read = (...parts: string[]) => fs.readFileSync(path.join(FIXTURES, ...parts), 'utf8');
const log = (id: number) => parseLog(read('logs', `${id}.txt`));

const all = parseRuns(read('runs.json'));
assert.strictEqual(all.length, 12, 'every run in the saved list is read');
assert.throws(() => parseRuns('{}'), /not a list/, 'a reply that is not a list is refused');
const whole = {
  databaseId: 1,
  headSha: 'a',
  headBranch: 'b',
  event: 'push',
  createdAt: '2026-11-21T00:00:00Z',
  attempt: 2,
};
assert.throws(
  () => parseRuns(JSON.stringify([{ ...whole, databaseId: undefined }])),
  /databaseId is not a whole number/,
);
assert.throws(() => parseRuns(JSON.stringify([{ ...whole, attempt: '2' }])), /attempt is not a whole number/);
assert.strictEqual(
  parseRuns(JSON.stringify([{ ...whole, conclusion: null }]))[0]?.conclusion,
  '',
  'no conclusion yet is empty',
);

// 9 Nov, a week and more before the others: out of an eight-day window ending on the 21st
const now = new Date('2026-11-21T12:00:00Z');
const runs = createdSince(all, new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000));
assert.strictEqual(runs.length, 11, 'a run created before the window is left out');
assert.deepStrictEqual(
  runs.filter(isRerun).map(r => r.id),
  [44844589049, 44842706165, 44574277480, 44533956512, 43974954420, 43888404670, 43709534045],
  'the reruns are the runs on a second attempt or later',
);

const MESSAGE = 'AssertionError [ERR_ASSERTION]: every check passes | + actual - expected';
assert.deepStrictEqual(
  log(44533956512),
  [{ kind: 'test', job: 'Tests 2/4', file: 'tests/protoHopPath.ts', message: MESSAGE }],
  'a failed test is named by the line run-tests prints, with the nearest assertion line above it',
);
assert.deepStrictEqual(
  log(44842706165),
  [
    {
      kind: 'test',
      job: 'Tests 2/4',
      file: 'tests/settingsFrame.ts',
      message: 'AssertionError [ERR_ASSERTION]: the tab strip | + actual - expected',
    },
  ],
  'the next line is added to the message unless it starts with "at "',
);
assert.deepStrictEqual(
  log(43974954420),
  [{ kind: 'test', job: 'Tests 3/4', file: 'tests/link.ts', message: "name: 'TimeoutError' | }" }],
  'a message is the nearest line that names an error, even when a better one is a line further up',
);
assert.deepStrictEqual(
  log(44844589049),
  [{ kind: 'job', job: 'install', message: 'page.evaluate: Error: no input #vpQ' }],
  'a failed job with no test to blame gives the first line that says why, not the npm warnings above it',
);
assert.deepStrictEqual(
  log(44574277480),
  [{ kind: 'job', job: 'install', message: 'failed checks: deleteCurrent.nextDown' }],
  'the install job also fails on a smoke check, which is a different line',
);
assert.deepStrictEqual(
  log(43709534045),
  [{ kind: 'job', job: 'test', message: 'TypeError: terminated' }],
  'a job that failed before any test ran is named, with its first error',
);
assert.deepStrictEqual(log(42672774908), [], 'a log that is gone gives no failure rather than an error');

const several = log(43888404670);
assert.deepStrictEqual(
  several.map(f => (f.kind === 'test' ? `${f.job} ${f.file}` : `${f.job} job`)),
  ['Tests 4/4 tests/buildExplain.ts', 'Tests 1/4 tests/buildChecksQueue.ts', 'visual job'],
  'one log can name two tests in two jobs and a failed job beside them',
);
const queue = several.find(f => f.kind === 'test' && f.file === 'tests/buildChecksQueue.ts');
assert.strictEqual(queue?.message.length, 300, 'a message is cut at 300 characters');
const visual = several.find(f => f.kind === 'job');
assert.match(visual?.message ?? '', /^VISUAL CHANGED: 17 of 51 states differ/, 'the visual job says what changed');

// the saved logs do not reach these edges of the message search, so a few lines are made up in gh's format
const gh = (job: string, text: string) => `${job}\tUNKNOWN STEP\t2026-11-21T00:00:00.0000000Z ${text}`;
const failedLine = (job: string) => gh(job, 'tests/x.ts failed (exit 1) in 1.0s');
const filler = (job: string, n: number) => Array.from({ length: n }, (_, i) => gh(job, `line ${i}`));
const said = (...lines: string[]) => parseLog(lines.join('\n'))[0]?.message;
const err = (job: string) => gh(job, 'locator.click: Timeout 5000ms exceeded.');
assert.strictEqual(
  said(err('A'), gh('A', '    at file:///x.ts:1:1'), failedLine('A')),
  'locator.click: Timeout 5000ms exceeded.',
);
assert.strictEqual(
  said(err('A'), ...filler('A', 59), failedLine('A')),
  'locator.click: Timeout 5000ms exceeded. | line 0',
  'a message is looked for 60 lines up',
);
assert.strictEqual(said(err('A'), ...filler('A', 60), failedLine('A')), '', 'and no further than that');
assert.strictEqual(said(err('B'), failedLine('A')), '', 'and only in the failing test’s own job');

const firstAttempt = new Map<number, Failure[]>(runs.filter(isRerun).map(r => [r.id, log(r.id)]));
const ledger = buildLedger({ runs, firstAttempt });
assert.strictEqual(ledger.runs, 11, 'the ledger counts every run in the window');
assert.strictEqual(ledger.reruns.length, 7, 'seven runs needed a rerun');
assert.deepStrictEqual(
  Object.fromEntries(ledger.reruns.map(r => [r.run.id, r.passed])),
  {
    44844589049: 'rerun',
    44842706165: 'no',
    44533956512: 'rerun',
    43974954420: 'rerun',
    43888404670: 'other run',
    44574277480: 'rerun',
    43709534045: 'no',
  },
  'a rerun is proven when its last attempt passed; one that failed again but passed in a later run on the same commit is not',
);
assert.strictEqual(ledger.proven, 4, 'four are proven flakes');
assert.strictEqual(ledger.elsewhere, 1, 'one more passed on the same commit in another run');
assert.deepStrictEqual(
  ledger.byTest,
  [
    { label: 'install job', count: 2 },
    { label: 'link', count: 1 },
    { label: 'protoHopPath', count: 1 },
  ],
  'the proven are counted by what failed on attempt 1, most first, and a run that failed again counts for nothing',
);

const table = renderLedger(ledger);
const expected = read('table.txt');
assert.strictEqual(
  table,
  expected,
  `the table is as saved in ${path.join('tests', 'fixtures', 'flakes', 'table.txt')}`,
);

console.log('FLAKES OK');
