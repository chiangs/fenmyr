// The one version line and the text Copy details gives: a release, a beta, a build from changed files and a build with
// no commit each read correctly, nothing reads "null" or "undefined", and dist/build.json is read as untrusted data.
import assert from 'node:assert';
import {
  type AppBuild,
  type AppInstall,
  appBuildOf,
  detailsText,
  readStamp,
  versionLine,
} from '../src/shared/buildStamp.ts';

const FULL = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const LINUX: Parameters<typeof appBuildOf>[2] = {
  install: 'clone',
  platform: 'linux',
  arch: 'x64',
  electron: '44.9.1',
  chrome: '140.0.1',
};
const stamp = { commit: FULL, changes: false, builtAt: '2026-11-21T10:30:00Z' };
const build = (version: string, over: Partial<AppBuild> = {}): AppBuild => ({
  ...appBuildOf(version, stamp, LINUX),
  ...over,
});

const release = build('1.0.0');
const beta = build('1.1.0-beta.2');
const changed = appBuildOf('1.1.0-beta.2', { ...stamp, changes: true }, LINUX);
const bare = appBuildOf('1.1.0-beta.2', readStamp(undefined), LINUX);

assert.strictEqual(versionLine(release), '1.0.0 · a1b2c3d', 'a release has no Beta');
assert.strictEqual(versionLine(beta), '1.1.0-beta.2 · Beta · a1b2c3d', 'a prerelease says Beta');
assert.strictEqual(versionLine(changed), '1.1.0-beta.2 · Beta · a1b2c3d + changes', 'a modified checkout says so');
assert.strictEqual(versionLine(bare), '1.1.0-beta.2 · Beta', 'with no commit, the rest of the line stands');
assert.strictEqual(versionLine(appBuildOf('1.0.0', readStamp(null), LINUX)), '1.0.0', 'a release with no commit');
assert.strictEqual(
  versionLine(build('1.0.0', { changes: true, commit: null, short: null })),
  '1.0.0',
  'no commit, no changes',
);
assert.strictEqual(
  versionLine(appBuildOf('', readStamp(null), { ...LINUX, install: 'web' })),
  '',
  'nothing known, nothing shown',
);

assert.strictEqual(
  detailsText(changed),
  [
    'Fenmyr 1.1.0-beta.2 (Beta)',
    `Commit ${FULL} with uncommitted changes`,
    'Built 21 November 2026, 10:30 UTC',
    'Installed from a clone (install.sh)',
    'Linux x64 · Electron 44.9.1 · Chrome 140.0.1',
  ].join('\n'),
  'the details of a build from changed files',
);
assert.strictEqual(
  detailsText(release).split('\n')[1],
  `Commit ${FULL}`,
  'a clean build gives the whole commit with nothing after it',
);
assert.ok(!detailsText(bare).includes('Commit'), 'with no commit, no commit line');
assert.ok(!detailsText(bare).includes('Built'), 'with no time, no built line');

const kinds: AppInstall[] = ['clone', 'appimage', 'mac', 'package', 'checkout', 'web'];
const lines = kinds.map(install => detailsText({ ...bare, install, platform: install === 'web' ? 'web' : 'darwin' }));
assert.strictEqual(new Set(lines).size, kinds.length, 'every way of installing reads differently');
const texts = [release, beta, changed, bare].map(b => `${versionLine(b)}\n${detailsText(b)}`);
for (const text of [...texts, ...lines])
  assert.ok(!/null|undefined/.test(text), `nothing reads null or undefined: ${text}`);
const web = detailsText(
  appBuildOf('1.0.0', readStamp(undefined), {
    install: 'web',
    platform: 'web',
    arch: null,
    electron: null,
    chrome: null,
  }),
);
assert.strictEqual(web, 'Fenmyr 1.0.0\nRunning in a browser', 'a browser knows no more than its version');

assert.deepStrictEqual(readStamp(stamp), stamp, 'a good stamp reads as it was written');
for (const broken of [undefined, null, 'a1b2c3d', 7, [], {}]) {
  assert.deepStrictEqual(
    readStamp(broken),
    { commit: null, changes: false, builtAt: null },
    `no commit from ${JSON.stringify(broken)}`,
  );
}
assert.strictEqual(
  readStamp({ ...stamp, commit: 'not a commit' }).commit,
  null,
  'a commit that is not a hash is dropped',
);
assert.strictEqual(readStamp({ ...stamp, commit: 12 }).commit, null, 'a commit that is not text is dropped');
assert.strictEqual(readStamp({ ...stamp, builtAt: 'yesterday' }).builtAt, null, 'a time that is not one is dropped');
assert.strictEqual(readStamp({ ...stamp, changes: 'yes' }).changes, false, 'changes is only ever true');
assert.strictEqual(readStamp({ commit: null, changes: true }).changes, false, 'changes with no commit says nothing');
assert.strictEqual(appBuildOf('1.1.0-beta.2', stamp, LINUX).short, 'a1b2c3d', 'the short commit is seven characters');
assert.strictEqual(appBuildOf('1.0.0', stamp, LINUX).prerelease, false, 'a release is not a prerelease');
console.log('VERSION LINE OK');
