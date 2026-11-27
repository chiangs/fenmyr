// Stopping kills the real Claude Code. A question the window gave an id, and a build, each run a stand-in that waits for
// a long time: askStop and protoBuildStop end its process, the question fails at once instead of at its answer, and the
// build ends as a failure that says the person stopped it, lists the files it had written and still has its Undo.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { readBuildEvent, STOPPED_BY_YOU } from '../src/shared/build.ts';
import { alive, buildStandIn } from './support/buildStandIn.ts';
import { launch } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';

const { work, repo } = freshRepo('fenmyr-stop-host-');
// the host keeps its own files under XDG_DATA_HOME, read when its modules load
process.env.XDG_DATA_HOME = work;
const { run } = await import('../src/host/util.ts');
// a run whose signal has already aborted never starts: the shell would have exited with 0 and written nothing to err
const early = await run('/bin/sh', ['-c', 'exit 0'], 5, {}, work, undefined, AbortSignal.abort());
assert.deepStrictEqual([early.code, early.err.toString()], [-1, 'Stopped before it began.'], 'it never starts');

const l = await launch({ claude: true });
const { page } = l;
const standIn = buildStandIn(l);

const until = async (what: string, check: () => boolean | Promise<boolean>) => {
  for (const end = Date.now() + 15000; Date.now() < end; await pause(50)) if (await check()) return;
  assert.fail(`never happened: ${what}`);
};

try {
  assert.equal(
    await page.evaluate(() => window.Fenmyr.askStop('nobody')),
    false,
    'a question that isn’t running has nothing to stop',
  );

  // the stand-in answers a question after this long, so a question that ends sooner was stopped
  standIn.answer({ say: 'Too late.' }, 120_000);
  const asked = page.evaluate(
    id =>
      window.Fenmyr.ask('Think for a long while', {}, false, { id, mobbin: false, higgs: false }).then(
        () => 'answered',
        (e: unknown) => (e instanceof Error ? e.message : String(e)),
      ),
    'ask-1',
  );
  // a check that fails first closes the app, and the question then fails with it, which would hide that check's message
  asked.catch(() => {});
  await until('Claude Code is thinking', () => standIn.pid('ask') > 0);
  const thinking = standIn.pid('ask');
  assert(alive(thinking), 'Claude Code is running when the stop comes');
  assert.equal(await page.evaluate(() => window.Fenmyr.askStop('ask-1')), true, 'a running question is stopped');
  await until('the process of the question ends', () => !alive(thinking));
  const how = await Promise.race([asked, pause(10_000, 'still waiting')]);
  assert.notEqual(how, 'still waiting', 'the question ends at once, not at the stand-in’s answer');
  assert.notEqual(how, 'answered', 'and no answer came');
  assert.equal(await page.evaluate(() => window.Fenmyr.askStop('ask-1')), false, 'a question that ended has no stop');

  const dir = await page.evaluate(
    async repo => (await window.Fenmyr.protoCreate({ root: repo, name: 'Checkout', stack: 'react' })).dir,
    repo,
  );
  const starter = fs.readFileSync(path.join(repo, dir, 'src/App.tsx'), 'utf8');
  // writes two files and then waits for a release that never comes
  standIn.next({ files: { 'src/App.tsx': 'half\n', 'src/Total.tsx': 'total\n' }, hold: true });
  const seen = await page.evaluateHandle(() => {
    const events: unknown[] = [],
      was = window.__fenmyrEvent;
    window.__fenmyrEvent = (name, data) => {
      was?.(name, data);
      if (name === 'protoBuild') events.push(data);
    };
    return events;
  });
  const started = await page.evaluate(
    ({ repo, dir }) =>
      window.Fenmyr.protoBuild({
        root: repo,
        dir,
        stack: 'react',
        request: 'Build it',
        purpose: '',
        device: '',
        cards: [],
        guides: { rules: { text: '', ignoreRepo: false }, design: { text: '', ignoreRepo: false } },
        errors: '',
        pictures: [],
        unseen: [],
        tooBig: [],
        over: [],
        build: '',
        board: '',
      }),
    { repo, dir },
  );
  assert(started.kind === 'started', 'the build started');
  await until('both files are written', () => standIn.wrote() === 2);
  const building = standIn.pid('build');
  assert(building > 0 && alive(building), 'Claude Code is partway through the build when the stop comes');
  assert.equal(await page.evaluate(id => window.Fenmyr.protoBuildStop(id), started.id), true, 'a running build stops');
  await until('the process of the build ends', () => !alive(building));
  const events = () => seen.jsonValue().then(all => all.map(readBuildEvent));
  await until('the build ends', async () => (await events()).some(e => e?.type === 'error'));
  const all = await events(),
    end = all.at(-1);
  assert.deepStrictEqual(
    all.map(e => e?.type),
    ['start', 'edit', 'edit', 'error'],
    'it ends as a failure, never as a finished build',
  );
  assert(all[0]?.type === 'start' && end?.type === 'error');
  assert.equal(end.text, STOPPED_BY_YOU, 'and says the person stopped it');
  assert.deepStrictEqual(
    end.files.map(f => f.path).toSorted(),
    ['src/App.tsx', 'src/Total.tsx'],
    'it lists the files it had written',
  );
  assert.equal(end.snapshot, all[0].snapshot, 'with the snapshot, so Undo has something to put back');
  assert.equal(
    await page.evaluate(id => window.Fenmyr.protoBuildStop(id), started.id),
    false,
    'a build that ended has no stop',
  );
  assert.deepStrictEqual(
    await page.evaluate(({ repo, dir, snapshot }) => window.Fenmyr.protoUndo({ root: repo, dir, snapshot }), {
      repo,
      dir,
      snapshot: end.snapshot ?? '',
    }),
    { kind: 'undone' },
    'the repo is free again, and Undo this build works',
  );
  assert.equal(fs.readFileSync(path.join(repo, dir, 'src/App.tsx'), 'utf8'), starter, 'it puts the starter back');
  assert(!fs.existsSync(path.join(repo, dir, 'src/Total.tsx')), 'and removes the file it added');
} finally {
  // a stand-in that was not stopped would keep the app from closing
  for (const kind of ['ask', 'build'] as const) {
    const pid = standIn.pid(kind);
    if (pid && alive(pid)) process.kill(pid);
  }
  await l.close();
}
fs.rmSync(work, { recursive: true, force: true });
console.log('STOP HOST OK');
