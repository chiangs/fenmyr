// How versions are read and ordered: a beta comes before its release, numbers in a prerelease count as numbers, a
// leading v is allowed, and anything that isn't a version reads as one that never wins.
import assert from 'node:assert';
import { compareVersions, isPrerelease, parseVersion } from '../src/shared/version.ts';

const ORDER = [
  '1.1.0-beta.1',
  '1.1.0-beta.2',
  '1.1.0-beta.10',
  '1.1.0',
  '1.1.1',
  '1.2.0-beta.1',
  '1.2.0',
  '2.0.0-alpha',
  '2.0.0-alpha.1',
  '2.0.0-alpha.beta',
  '2.0.0-beta',
  '2.0.0',
  '10.0.0',
];
for (let i = 0; i < ORDER.length; i++)
  for (let j = 0; j < ORDER.length; j++) {
    const [a, b] = [ORDER[i] ?? '', ORDER[j] ?? ''];
    assert.strictEqual(Math.sign(compareVersions(a, b)), Math.sign(i - j), `${a} against ${b}`);
  }
assert.strictEqual(compareVersions('v1.1.0', '1.1.0'), 0, 'a leading v changes nothing');
assert.ok(compareVersions('v1.1.0-beta.2', '1.1.0-beta.1') > 0, 'nor on a prerelease');
assert.ok(compareVersions('1.1.0', '1.1.0-beta.99') > 0, 'a release is after every beta of it');
assert.ok(compareVersions('1.9.0', '1.10.0') < 0, 'the parts are numbers, not text');

for (const junk of ['1.1', 'v1.1.0beta', 'latest', '', '1.1.0.1', '1.1.0-', '1.1.0-beta..2', '1.1.0+build', ' 1.1.0'])
  assert.strictEqual(parseVersion(junk), null, `"${junk}" is not a version`);
for (const junk of ['1.1', 'v1.1.0beta', 'latest', '']) {
  assert.ok(compareVersions('1.0.0', junk) > 0, `a version beats "${junk}"`);
  assert.ok(compareVersions(junk, '0.0.1') < 0, `"${junk}" loses to every version`);
  assert.strictEqual(compareVersions(junk, 'test'), 0, 'two non-versions tie');
  assert.strictEqual(isPrerelease(junk), false, `"${junk}" is not a prerelease`);
}

assert.deepStrictEqual(parseVersion('v1.2.3-beta.4'), { core: [1, 2, 3], pre: ['beta', '4'] }, 'every part is read');
assert.deepStrictEqual(parseVersion('1.2.3'), { core: [1, 2, 3], pre: null }, 'a release has no prerelease part');
assert.strictEqual(isPrerelease('1.1.0-beta.2'), true, 'a beta is a prerelease');
assert.strictEqual(isPrerelease('v1.1.0-rc.1'), true, 'with or without the v');
assert.strictEqual(isPrerelease('1.1.0'), false, 'a release is not');
assert.strictEqual(isPrerelease('v1.0.0'), false, 'with or without the v');

console.log('VERSION OK');
