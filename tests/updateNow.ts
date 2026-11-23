// Update now on a clone install: with local changes, commits of its own or another branch, Stable and Beta refuse in
// plain words before the installer starts, and Every change keeps the checks it always had. When nothing stops it,
// the installer is started with the release as an argument, or with --update alone on Every change. The installer is
// a stand-in that writes down what it was given.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import type { UpdateChannel } from '../src/shared/updateChannel.ts';
import { everyOfflineCard } from './fixtures/boards.ts';
import { appCopy } from './support/appCopy.ts';
import { launch } from './support/launch.ts';
import { makeRepo } from './support/updateRepo.ts';

const r = makeRepo();
r.tag('v1.0.0', r.first);
const app = appCopy('1.0.0');
fs.writeFileSync(path.join(app.dir, 'install.json'), JSON.stringify({ repo: r.repo, commit: r.first }));
const l = await launch({ dir: app.dir, boards: [everyOfflineCard()], open: 'every' });
const updateLog = path.join(l.data, 'fenmyr', 'update.log');

// the message Update now refuses with, or "started"
const press = (page: Page, channel: UpdateChannel) =>
  page.evaluate(
    c =>
      Fenmyr.updateNow(c).then(
        () => 'started',
        e => (e instanceof Error ? e.message : String(e)),
      ),
    channel,
  );
async function refused(why: string, channels: [UpdateChannel, RegExp][]) {
  for (const [channel, message] of channels) {
    assert.match(await press(l.page, channel), message, `${why}, on ${channel}`);
    assert.ok(!fs.existsSync(updateLog), `${why}, on ${channel}: the installer was never started`);
  }
}

// The installer is a stand-in that writes down what it was given. It goes in last: a commit made earlier would add it.
const args = path.join(r.repo, 'args.txt');
const standIn = () =>
  fs.writeFileSync(
    path.join(r.repo, 'install.sh'),
    '#!/bin/bash\nprintf "%s\\n" "$@" > args.tmp && mv args.tmp args.txt\n',
    {
      mode: 0o755,
    },
  );
function appears(file: string) {
  return new Promise<void>((done, fail) => {
    const signal = AbortSignal.timeout(30_000);
    const watcher = fs.watch(path.dirname(file), { signal }, () => {
      if (!fs.existsSync(file)) return;
      watcher.close();
      done();
    });
    signal.addEventListener('abort', () => fail(new Error(`${path.basename(file)} never appeared`)));
    if (fs.existsSync(file)) {
      watcher.close();
      done();
    }
  });
}
async function started(channel: UpdateChannel) {
  fs.rmSync(args, { force: true });
  assert.strictEqual(await press(l.page, channel), 'started', `Update now starts on ${channel}`);
  await appears(args);
  return fs.readFileSync(args, 'utf8').trim().split('\n');
}

try {
  await refused('with no newer release', [
    ['stable', /no newer release/],
    ['beta', /no newer release/],
  ]);

  fs.appendFileSync(path.join(r.repo, 'WHATSNEW.md'), '- mine\n');
  const changes = /has its own changes, so it wasn't updated/;
  await refused('with local changes', [
    ['stable', changes],
    ['beta', changes],
    ['main', changes],
  ]);
  r.git('checkout', '--', 'WHATSNEW.md');

  r.tag('v1.1.0', r.second);
  r.commit('- first\n- the new thing\n- mine\n');
  const commits = /has commits of its own, so it wasn't updated/;
  await refused('with a commit GitHub lacks', [
    ['stable', commits],
    ['beta', commits],
    ['main', /has diverged from GitHub/],
  ]);
  r.git('reset', '-q', '--hard', 'origin/main');

  r.git('checkout', '-q', '-b', 'other');
  await refused('on another branch', [
    ['stable', /is on the branch "other"\. Switch it to main, or choose Every change\./],
    ['beta', /is on the branch "other"\. Switch it to main, or choose Every change\./],
  ]);
  r.git('checkout', '-q', 'main');
  r.git('branch', '-q', '-D', 'other');

  // nothing in the way: the release goes to the installer as an argument
  standIn();
  assert.deepStrictEqual(await started('stable'), ['--update', '--to', 'v1.1.0'], 'Stable installs the newest release');
  r.tag('v1.2.0-beta.1', r.second);
  assert.deepStrictEqual(await started('beta'), ['--update', '--to', 'v1.2.0-beta.1'], 'Beta installs the newest beta');
  assert.deepStrictEqual(await started('main'), ['--update'], 'Every change just updates');
  assert.ok(fs.existsSync(updateLog), 'the installer writes to the update log');
  assert.deepStrictEqual(l.errors, [], 'no page errors');
} finally {
  await l.close();
  app.remove();
  r.remove();
}
console.log('UPDATE NOW OK');
