// Myra's chosen model and effort, from the saved settings to the host, in the real app: every call that runs Claude
// Code carries the choice from the one place all calls go through, no other call does, a stand-in Claude Code is run
// with the matching flags, and a saved value that is not a model and effort is left out.
import assert from 'node:assert';
import { replyBoard } from './fixtures/boards.ts';
import { askStandIn } from './support/askStandIn.ts';
import { launch } from './support/launch.ts';

const chosen = { provider: 'claude-code', id: 'claude-fable-5-2', effort: 'high' };
const RUNS_CLAUDE = ['ask', 'rewrite', 'higgsQuote', 'higgsMake', 'drawFill', 'protoExplain', 'protoBuild'];
const NO_FLAGS = { model: undefined, effort: undefined };

const l = await launch({
  boards: [replyBoard('call', 'Call')],
  open: 'call',
  claude: true,
  settings: { myraModel: chosen },
});
const { page } = l;
const { sentFor, sentAbout } = askStandIn(l);

const after = (args: string[], flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const flagsOf = (args: string[]) => ({ model: after(args, '--model'), effort: after(args, '--effort') });

assert.deepStrictEqual(
  flagsOf(await ask('a question from the saved choice')),
  { model: 'claude-fable-5-2', effort: 'high' },
  'an ask runs Claude Code on the saved model and effort',
);
await page.evaluate(
  () => void window.Fenmyr.rewrite('Hello there, rewrite me', 'shorter', 'T', 'around').catch(() => undefined),
);
assert.deepStrictEqual(
  flagsOf((await sentAbout('Hello there, rewrite me')).args),
  { model: 'claude-fable-5-2', effort: 'high' },
  'and so does a rewrite',
);

async function ask(q: string) {
  await page.evaluate(q => void window.Fenmyr.ask(q, {}).catch(() => undefined), q);
  return (await sentFor(q)).args;
}

// what the host receives, from a listener beside its own on the same channel
await l.app.evaluate(({ ipcMain }) => {
  const seen: unknown[] = [];
  Reflect.set(globalThis, 'seen', seen);
  ipcMain.on('fenmyr', (_e, msg: unknown) => seen.push(msg));
});
await page.evaluate(async () => {
  const none = () => undefined,
    F = window.Fenmyr,
    root = '/nonexistent/model-call';
  void F.ask('hi', {}).catch(none);
  void F.rewrite('hi', 'shorter', 't', 'a').catch(none);
  void F.higgsQuote({}).catch(none);
  void F.higgsMake({ images: [] }).catch(none);
  void F.drawFill({ images: [] }).catch(none);
  void F.protoExplain({ root, dir: 'p', files: [] }).catch(none);
  void F.protoBuild({
    root,
    dir: 'p',
    stack: 'html',
    request: 'r',
    purpose: 'p',
    device: 'phone',
    cards: '',
    errors: '',
    pictures: [],
    build: 'b',
    board: 'b',
  }).catch(none);
  // this answer comes after every message above has reached the host, which takes them in the order they were sent
  await F.version();
});
const seen: unknown = await l.app.evaluate(() => Reflect.get(globalThis, 'seen'));
assert(Array.isArray(seen));
const sent = seen.map((msg: unknown) => {
  const args = typeof msg === 'object' && msg !== null ? Reflect.get(msg, 'args') : undefined;
  return {
    op: typeof msg === 'object' && msg !== null ? Reflect.get(msg, 'op') : undefined,
    myraModel: typeof args === 'object' && args !== null ? Reflect.get(args, 'myraModel') : undefined,
  };
});
assert.deepStrictEqual(
  sent.filter(m => RUNS_CLAUDE.includes(m.op)),
  RUNS_CLAUDE.map(op => ({ op, myraModel: chosen })),
  'each of the seven calls that run Claude Code carries it, in the order sent',
);
assert(
  sent.some(m => m.op === 'version'),
  'the closing call came through',
);
assert.deepStrictEqual(
  sent.filter(m => !RUNS_CLAUDE.includes(m.op) && m.myraModel !== undefined),
  [],
  'no other call carries it',
);

// Saved values read back after a reload. A part left out is Default and carries no flag, and a value that is not a
// model and effort, or has neither, is left out by the page, so the host is not the only check. A later init script wins
// over the launch's own, which sets the settings at every load.
const provider = 'claude-code';
const saved: [string, unknown, ReturnType<typeof flagsOf>, boolean][] = [
  ['a model alone', { provider, id: 'claude-opus-5-5' }, { model: 'claude-opus-5-5', effort: undefined }, true],
  ['an effort alone', { provider, effort: 'low' }, { model: undefined, effort: 'low' }, true],
  ['neither a model nor an effort', { provider }, NO_FLAGS, false],
  ['a value that is not a model', { provider, id: 5, effort: 'high' }, NO_FLAGS, false],
];
for (const [what, myraModel, flags, carried] of saved) {
  await l.app.context().addInitScript(myraModel => {
    try {
      localStorage.setItem('fenmyr:settings', JSON.stringify({ greet: false, myraModel }));
    } catch {}
  }, myraModel);
  await l.app.evaluate(() => {
    const seen: unknown = Reflect.get(globalThis, 'seen');
    if (Array.isArray(seen)) seen.length = 0;
  });
  await page.reload();
  await page.waitForFunction(() => window.__fenmyr?.curBoard() && document.querySelector('#cards .card'));
  assert.deepStrictEqual(
    flagsOf(await ask(`a question from ${what}`)),
    flags,
    `${what}: the flags Claude Code ran with`,
  );
  await page.evaluate(() => window.Fenmyr.version());
  const kept: unknown = await l.app.evaluate(() => Reflect.get(globalThis, 'seen'));
  assert(Array.isArray(kept));
  const asked = kept.flatMap(m =>
    typeof m === 'object' && m !== null && Reflect.get(m, 'op') === 'ask' ? [Reflect.get(m, 'args')] : [],
  );
  assert.deepStrictEqual(
    asked.map(a => Reflect.get(a, 'myraModel')),
    [carried ? myraModel : undefined],
    `${what}: the call ${carried ? 'carries it as saved' : 'carries nothing, so the host is not the only check'}`,
  );
}

assert.deepStrictEqual(l.errors, [], 'no page errors');
await l.close();
console.log('MODEL CALL OK');
