// Myra's chosen model and effort, as each host call to Claude Code passes them on, with no window: a stand-in Claude Code
// logs the arguments it was run with. A part the choice leaves out, which is Default, passes no flag for itself, and a
// choice the provider doesn't list passes none at all, so Claude Code keeps its own settings and Myra still answers.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CodeAgent } from '../src/host/codeAgent.ts';
import { listModels, parseChoice } from '../src/host/models.ts';
import type { BuildEvent } from '../src/shared/build.ts';
import {
  listing,
  type ModelChoice,
  type ModelEntry,
  type ProviderModels,
  readModelChoice,
} from '../src/shared/models.ts';

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-model-args-')));
// read as the host modules load: the stand-in is found at ~/.local/bin/claude, and usage is kept under XDG_DATA_HOME
process.env.HOME = work;
process.env.XDG_DATA_HOME = work;
const log = path.join(work, 'argv.jsonl');
fs.mkdirSync(path.join(work, '.local/bin'), { recursive: true });
// one result line answers both `--output-format json` and `stream-json`
fs.writeFileSync(
  path.join(work, '.local/bin/claude'),
  `#!${process.execPath}
require('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n');
console.log(JSON.stringify({ type: 'result', is_error: false, result: 'ok' }));
`,
  { mode: 0o755 },
);
const claude = await import('../src/host/claude.ts');
const { claudeCode } = await import('../src/host/claudeCode.ts');
const { startBuild } = await import('../src/host/build.ts');
const { explainCode } = await import('../src/host/explain.ts');

// what follows --model and --effort in the arguments of the one run `call` makes
async function flags(call: () => Promise<unknown>) {
  fs.rmSync(log, { force: true });
  await call();
  const runs = fs.readFileSync(log, 'utf8').trim().split('\n');
  assert.equal(runs.length, 1, 'one run of Claude Code');
  const argv: unknown = JSON.parse(runs[0] ?? '');
  assert(Array.isArray(argv));
  const after = (flag: string) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
  return { model: after('--model'), effort: after('--effort') };
}
const none = { model: undefined, effort: undefined };
const sonnet = { provider: 'claude-code', id: 'claude-sonnet-5-5', effort: 'high' };

assert.deepStrictEqual(
  await flags(() => claude.rewrite({ text: 'Hi', myraModel: sonnet })),
  { model: 'claude-sonnet-5-5', effort: 'high' },
  'a rewrite runs on the chosen model and effort',
);
// each part on its own: the other one is Default, so its flag is left off
const modelOnly = { provider: 'claude-code', id: 'claude-sonnet-5-5' };
const effortOnly = { provider: 'claude-code', effort: 'low' };
assert.deepStrictEqual(
  await flags(() => claude.rewrite({ text: 'Hi', myraModel: modelOnly })),
  { model: 'claude-sonnet-5-5', effort: undefined },
  'a model alone sends --model and no --effort',
);
assert.deepStrictEqual(
  await flags(() => claude.rewrite({ text: 'Hi', myraModel: effortOnly })),
  { model: undefined, effort: 'low' },
  'an effort alone sends --effort and no --model',
);
const unlisted = {
  'no choice': undefined,
  'neither a model nor an effort': { provider: 'claude-code' },
  'a model the provider does not list': { ...sonnet, id: 'claude-sonnet-4' },
  'a model alone that the provider does not list': { ...modelOnly, id: 'claude-sonnet-4' },
  'another provider': { ...sonnet, provider: 'ollama' },
  'an effort alone for another provider': { ...effortOnly, provider: 'ollama' },
  'an effort that is not a level': { ...sonnet, effort: 'ultra' },
  'an effort alone that is not a level': { ...effortOnly, effort: 'ultra' },
  'a model that is not a string, with an effort': { ...sonnet, id: 5 },
  'a choice that is not an object': 'claude-sonnet-5-5',
};
for (const [what, myraModel] of Object.entries(unlisted))
  assert.deepStrictEqual(
    await flags(() => claude.rewrite({ text: 'Hi', myraModel })),
    none,
    `${what} leaves Claude Code on its default`,
  );

// The one rule the page and the host share. The page clears a choice only when it is 'gone' and the host sends one only
// when it is 'listed', so 'unknown' changes nothing on either side.
const pick: ModelChoice = { provider: 'claude-code', id: 'claude-sonnet-5-5', effort: 'high' };
const hostList = await listModels();
const claudeList = (models: ModelEntry[]): ProviderModels[] => [
  { provider: 'claude-code', name: 'Claude Code', models },
];
const lowOnly = claudeList([{ id: pick.id, name: 'S', efforts: ['low'] }]);
const idOnly: ModelChoice = { provider: 'claude-code', id: pick.id };
const levelOnly: ModelChoice = { provider: 'claude-code', effort: 'max' };
const standing: [string, ProviderModels[], ModelChoice, ReturnType<typeof listing>][] = [
  ['a model and effort it lists', hostList, pick, 'listed'],
  ['a model it does not list', hostList, { ...pick, id: 'claude-gone-1' }, 'gone'],
  ['an effort the model does not list', lowOnly, pick, 'gone'],
  ['a provider that lists no models', claudeList([]), pick, 'unknown'],
  ['no providers', [], pick, 'unknown'],
  ['a model alone that it lists', hostList, idOnly, 'listed'],
  ['a model alone that it does not list', hostList, { ...idOnly, id: 'claude-gone-1' }, 'gone'],
  ['a model alone, whatever efforts it lists', lowOnly, idOnly, 'listed'],
  ['an effort alone', hostList, levelOnly, 'listed'],
  ['an effort alone, whatever models are listed', lowOnly, levelOnly, 'listed'],
  ['an effort alone, with no providers to ask', [], levelOnly, 'unknown'],
];
for (const [what, lists, choice, expected] of standing)
  assert.strictEqual(listing(lists, choice), expected, `${what} is ${expected}`);
for (const choice of [pick, { ...pick, id: 'claude-gone-1' }, idOnly, { ...idOnly, id: 'claude-gone-1' }, levelOnly])
  assert.strictEqual(
    (await parseChoice(choice)) !== undefined,
    listing(hostList, choice) === 'listed',
    `the host sends ${JSON.stringify(choice)} exactly when the page's rule lists it`,
  );

// a value read from storage or the bridge: a part left out is Default, and neither is no choice at all
const read: [string, unknown, ModelChoice | undefined][] = [
  [
    'a model and effort',
    { provider: 'claude-code', id: 'm', effort: 'high' },
    { provider: 'claude-code', id: 'm', effort: 'high' },
  ],
  ['a model alone', { provider: 'claude-code', id: 'm' }, { provider: 'claude-code', id: 'm' }],
  ['an effort alone', { provider: 'claude-code', effort: 'high' }, { provider: 'claude-code', effort: 'high' }],
  ['neither', { provider: 'claude-code' }, undefined],
  ['an unknown provider', { provider: 'ollama', id: 'm' }, undefined],
  ['an id that is not a string', { provider: 'claude-code', id: 5 }, undefined],
  ['an effort that is not a level', { provider: 'claude-code', id: 'm', effort: 'ultra' }, undefined],
  ['an effort that is null', { provider: 'claude-code', id: 'm', effort: null }, undefined],
];
for (const [what, value, expected] of read) assert.deepStrictEqual(readModelChoice(value), expected, what);

const haiku = { model: 'claude-haiku-5-5', effort: 'max' },
  myraModel = { provider: 'claude-code', id: haiku.model, effort: haiku.effort };
const calls = {
  ask: () => claude.ask({ prompt: 'Hi', board: {}, myraModel }),
  higgsQuote: () => claude.higgsQuote({ myraModel }),
  higgsMake: () => claude.higgsMake({ images: [], myraModel }),
  drawFill: () => claude.drawFill({ images: [], myraModel }),
};
for (const [op, call] of Object.entries(calls)) assert.deepStrictEqual(await flags(call), haiku, `${op} passes it on`);

const folder = path.join(work, 'folder');
fs.mkdirSync(folder);
const opus = { provider: 'claude-code', id: 'claude-opus-5-5', effort: 'xhigh' } as const;
for (const access of ['edit', 'read'] as const) {
  const job = { cwd: folder, prompt: 'Build it', readable: [], access };
  assert.deepStrictEqual(
    await flags(() => claudeCode({ ...job, model: opus }, () => {})),
    { model: 'claude-opus-5-5', effort: 'xhigh' },
    `a code run with ${access} access runs on the job's model`,
  );
  assert.deepStrictEqual(
    await flags(() => claudeCode({ ...job, model: { provider: 'claude-code', effort: 'low' } }, () => {})),
    { model: undefined, effort: 'low' },
    `and on its own model with the job's effort alone`,
  );
  assert.deepStrictEqual(await flags(() => claudeCode(job, () => {})), none, `and on the default without one`);
}

const repo = path.join(work, 'acme'),
  dir = 'prototypes/checkout';
fs.mkdirSync(path.join(repo, dir), { recursive: true });
fs.writeFileSync(path.join(repo, dir, 'index.html'), '<h1>Hi</h1>\n');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]);
git('init', '-q', '-b', 'main');
git('add', '-A');
git('commit', '-qm', 'Start');

// the model a build's job carried, from a fake agent that only reports it
async function buildModel(chosen: unknown) {
  const ended = Promise.withResolvers<void>();
  let seen: unknown = 'not run';
  const agent: CodeAgent = async job => {
    seen = job.model;
    return 'Built.';
  };
  const send = (e: BuildEvent) => (e.type === 'done' ? ended.resolve() : e.type === 'error' && ended.reject(e.text));
  startBuild({ root: repo, dir, stack: 'html', request: 'Add a total', myraModel: chosen }, send, agent);
  await ended.promise;
  return seen;
}
assert.deepStrictEqual(await buildModel(myraModel), myraModel, 'a build hands its agent the chosen model');
assert.equal(await buildModel({ ...myraModel, id: 'gpt-9' }), undefined, 'and none for a model that is not listed');

assert.deepStrictEqual(
  await flags(() => explainCode({ root: repo, dir, files: [], myraModel })),
  haiku,
  'Explain the code runs on the chosen model',
);

fs.rmSync(work, { recursive: true, force: true });
console.log('MODEL ARGS OK');
