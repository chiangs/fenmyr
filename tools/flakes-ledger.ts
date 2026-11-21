import type { Failure } from './flakes-log.ts';

export type Run = {
  id: number;
  sha: string;
  branch: string;
  event: string;
  created: string;
  attempts: number;
  conclusion: string;
};

export type Passed = 'on the rerun' | 'in another run' | 'no';
export type Rerun = { run: Run; failures: Failure[]; passed: Passed };
export type Count = { label: string; count: number };
export type Ledger = {
  runs: number;
  reruns: Rerun[];
  proven: number;
  elsewhere: number;
  byTest: Count[];
};
export type Input = {
  runs: Run[];
  firstAttemptFailures: ReadonlyMap<number, Failure[]>;
};

export const isRerun = (run: Run) => run.attempts > 1;

const NONE_FOUND = 'no failure found';

function passedOn(run: Run, runs: Run[]): Passed {
  if (run.conclusion === 'success') return 'on the rerun';
  const later = runs.some(
    other =>
      other.sha === run.sha && other.conclusion === 'success' && Date.parse(other.created) > Date.parse(run.created),
  );
  return later ? 'in another run' : 'no';
}

function labelOf(failure: Failure): string {
  switch (failure.kind) {
    case 'test':
      return failure.file.replace(/^tests\//, '').replace(/\.ts$/, '');
    case 'job':
      return `${failure.job} job`;
    case 'unread':
      return 'log not read';
    default: {
      const never: never = failure;
      throw new Error(`unknown failure ${JSON.stringify(never)}`);
    }
  }
}

function countBy(reruns: Rerun[]): Count[] {
  const counts = new Map<string, number>();
  for (const { failures } of reruns)
    for (const label of failures.length ? failures.map(labelOf) : [NONE_FOUND])
      counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function buildLedger({ runs, firstAttemptFailures }: Input): Ledger {
  const reruns = runs
    .filter(isRerun)
    .sort((a, b) => Date.parse(b.created) - Date.parse(a.created) || b.id - a.id)
    .map((run): Rerun => ({ run, failures: firstAttemptFailures.get(run.id) ?? [], passed: passedOn(run, runs) }));
  // issue #375 counts a flake as proven only when the run's own last attempt passed; a pass in another run on the
  // same commit is counted apart
  const proven = reruns.filter(r => r.passed === 'on the rerun');
  return {
    runs: runs.length,
    reruns,
    proven: proven.length,
    elsewhere: reruns.filter(r => r.passed === 'in another run').length,
    byTest: countBy(proven),
  };
}

const WIDTH = 110;
const cut = (text: string) => (text.length > WIDTH ? `${text.slice(0, WIDTH - 1)}…` : text);
const verdict = (passed: Passed) => (passed === 'no' ? passed : `yes, ${passed}`);

function table(rows: string[][]): string[] {
  const widths = (rows[0] ?? []).map((_, c) => Math.max(...rows.map(r => (r[c] ?? '').length)));
  return rows.map(r => r.map((cell, c) => (c === r.length - 1 ? cell : cell.padEnd(widths[c] ?? 0))).join('  '));
}

export function renderLedger(ledger: Ledger): string {
  const head = ['run', 'created', 'event', 'branch', 'attempts', 'last attempt', 'same commit passed'];
  const rows = ledger.reruns.map(({ run, passed }) => [
    String(run.id),
    run.created.slice(0, 10),
    run.event,
    run.branch,
    String(run.attempts),
    run.conclusion,
    verdict(passed),
  ]);
  const lines = table([head, ...rows]);
  const out = [lines[0] ?? ''];
  ledger.reruns.forEach(({ failures }, i) => {
    out.push(lines[i + 1] ?? '');
    const said = failures.map(f => cut(`  ${labelOf(f)}: ${f.message}`));
    out.push(...(said.length ? said : [`  ${NONE_FOUND} in attempt 1's log`]));
  });
  const proven = ledger.byTest.map(c => [`  ${c.label}`, String(c.count)]);
  return [
    ...(ledger.reruns.length ? out : []),
    '',
    `Reruns: ${ledger.reruns.length} of ${ledger.runs} runs.`,
    `Proven flakes: ${ledger.proven}, where the last attempt of the same run passed on the same commit.`,
    `Passed on the same commit in another run only: ${ledger.elsewhere}.`,
    ...(proven.length ? ['Proven, by what failed on attempt 1:', ...table(proven)] : []),
    '',
  ].join('\n');
}
