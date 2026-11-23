// The updater compares what is installed with GitHub, so pulling in the install folder can't hide an update. An install
// made from a clone follows its channel: release tags for Stable and Beta, a beta before its release, and commits for
// Every change. A checkout run with npm start has no channel, and an AppImage reads its releases the same way. All of it
// runs against a bare repo standing in for GitHub.
import assert from 'node:assert';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { Page } from 'playwright';
import type { UpdateInfo } from '../src/shared/ops.ts';
import type { UpdateChannel } from '../src/shared/updateChannel.ts';
import { everyOfflineCard } from './fixtures/boards.ts';
import { appCopy } from './support/appCopy.ts';
import { launch } from './support/launch.ts';
import { makeRepo } from './support/updateRepo.ts';

const r = makeRepo();
const field = (info: UpdateInfo, key: string): unknown => (key in info ? Reflect.get(info, key) : undefined);
// no channel at all asks the way a page that never chose one would
const ask = (page: Page, channel?: UpdateChannel): Promise<UpdateInfo> =>
  page.evaluate(c => Reflect.apply(Fenmyr.updateCheck, Fenmyr, c ? [c] : []), channel);
const install = (dir: string, commit?: string) =>
  fs.writeFileSync(path.join(dir, 'install.json'), JSON.stringify({ repo: r.repo, ...(commit ? { commit } : {}) }));
const boards = { boards: [everyOfflineCard()], open: 'every' };

const offered = (info: UpdateInfo) => ({ behind: Number(field(info, 'behind')), latest: field(info, 'latest') });
const notesOf = (info: UpdateInfo) => field(info, 'notes');

const release = appCopy('1.0.0');
const beta = appCopy('1.1.0-beta.1');
const stable = await launch({ dir: release.dir, ...boards });
const early = await launch({ dir: beta.dir, ...boards });
try {
  // Every change: the commits behind the branch's upstream, with the notes since the installed commit
  install(release.dir, r.first);
  const pulled = await ask(stable.page, 'main');
  assert.strictEqual(field(pulled, 'behind'), 1, 'the folder was pulled, but the installed copy is one commit behind');
  assert.deepStrictEqual(notesOf(pulled), ['the new thing'], 'notes cover what the installed copy lacks');
  assert.strictEqual(field(pulled, 'channel'), 'main', 'an install says which channel it checked');
  assert.strictEqual(field(pulled, 'latest'), undefined, 'and Every change names no release');
  install(release.dir, r.git('rev-parse', 'HEAD'));
  assert.strictEqual(
    field(await ask(stable.page, 'main'), 'behind'),
    0,
    'an installed copy at the newest commit is up to date',
  );
  install(release.dir);
  assert.strictEqual(
    field(await ask(stable.page, 'main'), 'behind'),
    0,
    'an install from before the commit was recorded falls back to the folder',
  );
  install(release.dir, 'f'.repeat(40));
  assert.strictEqual(
    field(await ask(stable.page, 'main'), 'behind'),
    0,
    'a commit the folder no longer has falls back to the folder',
  );

  // releases: Stable ignores a beta, and tags that aren't versions never count
  const [A, B] = [r.first, r.second];
  r.git('push', '-q');
  const C = r.commit('- first\n- the new thing\n- another thing\n');
  r.git('push', '-q');
  r.tag('v1.0.0', A);
  r.tag('v1.1.0-beta.1', B);
  r.tag('v1.1.0-beta.2', C);
  for (const junk of ['v1.1', 'test', 'v1.1.0beta', 'v2', 'vNext']) r.tag(junk, C);

  install(release.dir, A);
  assert.deepStrictEqual(
    offered(await ask(stable.page, 'stable')),
    { behind: 0, latest: 'v1.0.0' },
    'Stable on 1.0.0 sees no beta',
  );
  const early2 = await ask(stable.page, 'beta');
  assert.deepStrictEqual(
    offered(early2),
    { behind: 1, latest: 'v1.1.0-beta.2' },
    'Beta on 1.0.0 is offered the newest beta',
  );
  assert.deepStrictEqual(
    notesOf(early2),
    ['the new thing', 'another thing'],
    'with the notes since the installed commit',
  );
  assert.deepStrictEqual(
    offered(await ask(stable.page)),
    { behind: 0, latest: 'v1.0.0' },
    'unset on a release is Stable',
  );

  install(beta.dir, B);
  assert.deepStrictEqual(
    offered(await ask(early.page, 'stable')),
    { behind: 0, latest: 'v1.0.0' },
    'Stable on a beta offers nothing, so it never downgrades',
  );
  assert.deepStrictEqual(
    offered(await ask(early.page, 'beta')),
    { behind: 1, latest: 'v1.1.0-beta.2' },
    'Beta on a beta is offered the next one',
  );
  assert.deepStrictEqual(
    offered(await ask(early.page)),
    { behind: 1, latest: 'v1.1.0-beta.2' },
    'unset on a beta is Beta',
  );
  assert.strictEqual(field(await ask(early.page, 'beta'), 'channel'), 'beta', 'the answer names the channel');

  // the release itself
  const D = r.commit('- first\n- the new thing\n- another thing\n- the release\n');
  r.git('push', '-q');
  r.tag('v1.1.0', D);
  install(release.dir, A);
  const final = await ask(stable.page, 'stable');
  assert.deepStrictEqual(offered(final), { behind: 1, latest: 'v1.1.0' }, 'Stable is offered the release');
  assert.deepStrictEqual(
    notesOf(final),
    ['the new thing', 'another thing', 'the release'],
    'with the lines since the installed commit',
  );
  assert.deepStrictEqual(
    offered(await ask(stable.page, 'beta')),
    { behind: 1, latest: 'v1.1.0' },
    'Beta is offered it too',
  );

  install(beta.dir, B);
  const afterBeta = await ask(early.page, 'beta');
  assert.deepStrictEqual(offered(afterBeta), { behind: 1, latest: 'v1.1.0' }, 'a beta is offered the release after it');
  assert.deepStrictEqual(notesOf(afterBeta), ['another thing', 'the release'], 'with what came since that beta');
  assert.deepStrictEqual(
    offered(await ask(early.page, 'stable')),
    { behind: 1, latest: 'v1.1.0' },
    'Stable on a beta moves once the release exists',
  );
  assert.deepStrictEqual(offered(await ask(early.page)), { behind: 1, latest: 'v1.1.0' }, 'and so does unset');

  // Every change goes back to following commits from a tag, which has no upstream
  r.git('checkout', '-q', '--detach', 'v1.0.0');
  install(release.dir, A);
  const back = await ask(stable.page, 'main');
  assert.strictEqual(field(back, 'behind'), 3, 'detached at a release, Every change counts the commits on origin/main');
  assert.deepStrictEqual(notesOf(back), ['the new thing', 'another thing', 'the release'], 'with their notes');
  r.git('checkout', '-q', 'main');

  assert.deepStrictEqual(stable.errors, [], 'no page errors');
  assert.deepStrictEqual(early.errors, [], 'no page errors');
} finally {
  await stable.close();
  await early.close();
}

// running from a checkout has no channel: it follows its own branch whatever it is asked
const checkout = appCopy('1.0.0');
fs.symlinkSync(path.join(r.repo, '.git'), path.join(checkout.dir, '.git'));
r.git('reset', '-q', '--hard', r.first);
const own = await launch({ dir: checkout.dir, ...boards });
try {
  const info = await ask(own.page, 'stable');
  assert.strictEqual(field(info, 'behind'), 3, 'a checkout counts the commits behind its upstream');
  assert.ok(!('channel' in info) && !('latest' in info), 'and has no channel and no release');
} finally {
  await own.close();
  r.git('reset', '-q', '--hard', 'origin/main');
}

// an AppImage reads GitHub's latest release, and a beta comes before its release there too
let answer = 'v1.1.0';
const server = http.createServer((_req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ tag_name: answer, body: '- the release', assets: [] }));
});
await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok));
const address = server.address();
const port = typeof address === 'object' && address ? address.port : 0;
const image = appCopy('1.1.0-beta.2');
const imageApp = await launch({
  dir: image.dir,
  ...boards,
  env: { APPIMAGE: path.join(r.tmp, 'Fenmyr.AppImage'), FENMYR_RELEASE_API: `http://127.0.0.1:${port}/` },
});
try {
  for (const [tag, behind] of [
    ['v1.1.0', 1],
    ['v1.1.0-beta.1', 0],
    ['v1.1.0-beta.10', 1],
    ['v1.0.0', 0],
  ] as const) {
    answer = tag;
    assert.strictEqual(
      field(await ask(imageApp.page, 'stable'), 'behind'),
      behind,
      `an AppImage on 1.1.0-beta.2 with ${tag} out`,
    );
  }
} finally {
  await imageApp.close();
  server.close();
}

for (const app of [release, beta, checkout, image]) app.remove();
r.remove();
console.log('UPDATE OK');
