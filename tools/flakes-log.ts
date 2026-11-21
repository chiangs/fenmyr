// Reads one attempt's `gh run view --log-failed` text into what failed: each test file that exited non-zero, and each
// job that failed with no test to blame (the install job, a visual diff, a step before any test ran).
export type Failure =
  | { kind: 'test'; job: string; file: string; message: string }
  | { kind: 'job'; job: string; message: string };

type Line = { job: string; text: string };

// gh prints `job<TAB>step<TAB>timestamp text`, the text keeping its own indentation after the one space. A line that
// the runner passes through, such as a failed step's stderr, has no timestamp, and its first word is not one.
const PREFIX = /^([^\t]+)\t[^\t]*\t(?:[\uFEFF]?\d{4}-\d\d-\d\dT[\d:.]+Z ?)?/;
// the line tools/run-tests.ts prints when a test ends
const TEST_FAILED = /^(tests\/[\w.-]+\.ts) failed \(.*\) in [\d.]+s/;
const TEST_SIGNAL = /AssertionError|TimeoutError|Error:|locator\.|expect\(/;
const JOB_SIGNAL = /Error:|failed checks:|VISUAL CHANGED|PERF WORSE|SMOKE FAILED|Timeout/;
const LOOK_BACK = 60;
const MAX_MESSAGE = 300;

function splitLines(log: string): Line[] {
  return log.split('\n').flatMap((raw): Line[] => {
    const m = PREFIX.exec(raw);
    return m?.[1] === undefined ? [] : [{ job: m[1], text: raw.slice(m[0].length) }];
  });
}

// The nearest line above the failed test that names an error, plus the line after it unless that is a stack frame.
function testMessage(lines: Line[], at: number): string {
  const job = lines[at]?.job;
  for (let i = at - 1; i >= Math.max(at - LOOK_BACK, 0); i--) {
    const line = lines[i];
    if (!line || line.job !== job || !TEST_SIGNAL.test(line.text)) continue;
    const next = lines[i + 1]?.text.trim() ?? '';
    const message = next && !next.startsWith('at ') ? `${line.text.trim()} | ${next}` : line.text.trim();
    return message.slice(0, MAX_MESSAGE);
  }
  return '';
}

// The runner wraps a failed step's stderr in ##[error], npm's warnings included, so the first line that says why is
// found by what it says, and the runner's own "Process completed with exit code" is the fallback.
function jobMessage(lines: Line[]): string {
  const said = lines.find(l => JOB_SIGNAL.test(l.text));
  const ended = lines.find(l => l.text.startsWith('##[error]'));
  return (said?.text ?? ended?.text.slice('##[error]'.length) ?? '').trim().slice(0, MAX_MESSAGE);
}

export function parseLog(log: string): Failure[] {
  const lines = splitLines(log);
  const tests = new Map<string, Failure>();
  lines.forEach((line, i) => {
    const file = TEST_FAILED.exec(line.text)?.[1];
    if (file !== undefined) tests.set(file, { kind: 'test', job: line.job, file, message: testMessage(lines, i) });
  });
  const blamed = new Set([...tests.values()].map(f => f.job));
  const jobs = [...new Set(lines.map(l => l.job))].filter(job => !blamed.has(job));
  const failedJobs = jobs.map(
    (job): Failure => ({
      kind: 'job',
      job,
      message: jobMessage(lines.filter(l => l.job === job)),
    }),
  );
  return [...tests.values(), ...failedJobs];
}
