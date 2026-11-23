// What a zip's videos may add up to once unpacked. Each says how big it is in the index at the end of the zip, and a
// deflated one may say up to 4 GB on its own, so a zip made to fill the disk lists several. One whose listed videos say
// more than 4 GB between them is refused before the first is copied. An export is refused over 4 GB itself, so a real
// zip never says so.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jsonBytes, packZip, REFUSALS, readImport } from '../src/shared/fenmyrZip.ts';
import { launch } from './support/launch.ts';
import { board, card, hostOp, manifestFor, text } from './support/zipKit.ts';

const l = await launch();
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-cap-'));
const mediaDir = path.join(l.data, 'fenmyr', 'media');
const inMedia = () => fs.readdirSync(mediaDir).sort();
const sig = Buffer.from([0x50, 0x4b, 1, 2]);

const clips = (...names: string[]) => ({
  ...board('b1'),
  cards: names.map(n => card(n, 'video', { src: `fenmyrmedia://media/${n}.mp4`, title: n })),
});
const withClips = (listed: string[], held: string[]) =>
  packZip(
    {
      'fenmyr.json': jsonBytes(
        manifestFor(
          ['b1'],
          listed.map(n => `${n}.mp4`),
        ),
      ),
      'boards/b1.json': jsonBytes(clips(...listed)),
      ...Object.fromEntries(held.map(n => [`media/${n}.mp4`, text(n.repeat(4))])),
    },
    held.map(n => `media/${n}.mp4`),
  );
// the sizes the index says, which nothing else in the zip agrees with
const declaring = (zip: Uint8Array, sizes: Record<string, number>) => {
  const forged = Buffer.from(zip);
  for (let at = forged.indexOf(sig); at >= 0; at = forged.indexOf(sig, at + 4)) {
    const size = sizes[forged.toString('utf8', at + 46, at + 46 + forged.readUInt16LE(at + 28))];
    if (size !== undefined) forged.writeUInt32LE(size, at + 24);
  }
  return forged;
};
const open = (name: string, zip: Uint8Array) => {
  const file = path.join(out, name);
  fs.writeFileSync(file, zip);
  return hostOp(l.page, 'zipImport', { path: file });
};
const refused = (r: { ok: boolean; value: unknown }) => {
  assert.ok(!r.ok, 'the import was not refused');
  return String(r.value);
};
const half = 2 ** 31;

const honest = await open('honest.zip', withClips(['a', 'b'], ['a', 'b']));
assert.ok(honest.ok && readImport(honest.value)?.missing === 0, 'two honest videos come in');
const settled = inMedia();
assert.strictEqual(settled.length, 2, 'as two files');

assert.strictEqual(
  refused(
    await open(
      'declares.zip',
      declaring(withClips(['a', 'b'], ['a', 'b']), { 'media/a.mp4': half, 'media/b.mp4': half }),
    ),
  ),
  REFUSALS.tooBig,
  'two videos that say 2 GB each are more than 4 GB between them',
);
assert.deepStrictEqual(inMedia(), settled, 'and nothing was written to the media folder');

assert.strictEqual(
  refused(await open('one.zip', declaring(withClips(['a', 'b'], ['a', 'b']), { 'media/b.mp4': half }))),
  REFUSALS.notZip,
  'one that says 2 GB is under the cap, and is stopped when it turns out to be 8 bytes',
);
assert.deepStrictEqual(inMedia(), settled, 'and the first, which had been copied by then, is taken back');

const unlisted = await open('unlisted.zip', declaring(withClips(['a'], ['a', 'b']), { 'media/b.mp4': 2 ** 32 - 2 }));
assert.ok(
  unlisted.ok && readImport(unlisted.value)?.missing === 0,
  'a video the manifest does not list is not counted',
);
assert.strictEqual(inMedia().length, settled.length + 1, 'and is not unpacked: only the listed one was copied');

console.log('zipCap ok');
await l.close();
fs.rmSync(out, { recursive: true, force: true });
