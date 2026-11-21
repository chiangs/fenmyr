import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

if (process.env.MOTION_DELAY_PROBE) {
  console.log(`PROBE ${process.env.FENMYR_MOTION_DELAY ?? 'unset'}`);
  process.exit(0);
}

const root = path.join(import.meta.dirname, '..');

const withoutDelay = () => {
  const env = { ...process.env };
  delete env.FENMYR_MOTION_DELAY;
  return env;
};
const runTests = (...args: string[]) =>
  spawnSync(process.execPath, ['tools/run-tests.ts', ...args], {
    cwd: root,
    env: { ...withoutDelay(), MOTION_DELAY_PROBE: '1' },
    encoding: 'utf8',
  });
const probed = (...args: string[]) => {
  const r = runTests('motionDelay', ...args);
  assert.strictEqual(r.status, 0, `run-tests ${args.join(' ')} fails: ${r.stdout}${r.stderr}`);
  return /^PROBE (.*)$/m.exec(r.stdout)?.[1];
};

assert.strictEqual(probed(), 'unset', 'no --lag leaves the variable out');
assert.strictEqual(probed('--lag', '250'), '250', '--lag 250 sets it');
assert.strictEqual(probed('--lag=75'), '75', '--lag=75 sets it');
assert.strictEqual(probed('--lag', '0'), '0', '--lag 0 sets it to 0, not unset');
assert.strictEqual(probed('--shard', '1/1', '--lag', '10'), '10', '--lag works beside --shard');

for (const bad of [['--lag'], ['--lag', 'abc'], ['--lag', '-5'], ['--lag', '2.5'], ['--lag='], ['--lag', '']]) {
  const r = runTests('motionDelay', ...bad);
  assert.notStrictEqual(r.status, 0, `run-tests ${bad.join(' ')} stops`);
  assert.match(r.stderr, /--lag takes whole milliseconds such as 250/, `run-tests ${bad.join(' ')} says what to write`);
}

const launchUrl = pathToFileURL(path.join(root, 'tests/support/launch.ts')).href;
const loadLaunch = (value: string | undefined) =>
  spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(launchUrl)})`], {
    env: value === undefined ? withoutDelay() : { ...withoutDelay(), FENMYR_MOTION_DELAY: value },
    encoding: 'utf8',
  });
for (const ok of [undefined, '0', '250']) assert.strictEqual(loadLaunch(ok).status, 0, `launch takes ${ok}`);
for (const bad of ['', 'abc', '-5', '2.5', '250ms']) {
  const r = loadLaunch(bad);
  assert.notStrictEqual(r.status, 0, `launch refuses "${bad}"`);
  assert.match(r.stderr, /FENMYR_MOTION_DELAY takes whole milliseconds such as 250/, `launch says what to write`);
}
console.log('MOTION DELAY OK');
