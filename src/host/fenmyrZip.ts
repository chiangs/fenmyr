// A Fenmyr zip to and from disk. A video is read from the media folder and written into the zip, or the other way round, a
// piece at a time, so it never sits in memory and never crosses the bridge. Every name in a zip is checked before
// anything is read from it or written, and the zip's own index (not a scan for headers) says where each file is, so a
// video that happens to hold the bytes of a header can't be taken for the end of itself.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { type BrowserWindow, dialog } from 'electron';
import { Inflate, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import {
  type ImportResult,
  isJson,
  JSON_LIMIT,
  jsonBytes,
  type Manifest,
  mediaNameOf,
  nameRefusal,
  parseExport,
  REFUSALS,
  type Refusal,
  readManifest,
  relinkMedia,
} from '../shared/fenmyrZip.ts';
import type { Ops } from '../shared/ops.ts';
import { pickSavePath } from './output.ts';
import P from './paths.ts';
import * as storage from './storage.ts';
import { isRecord, jsonSafe, text, type Untrusted } from './util.ts';

// zip's sizes and offsets are 32 bits, and fflate writes no more
const ZIP_LIMIT = 2 ** 32 - 1;
// every board file together, once unpacked: it all comes back to the page as one reply
const JSON_TOTAL = 512 * 2 ** 20;
const END = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const NOT_32 = 0xffffffff;

const refuse = (r: Refusal) => new Error(REFUSALS[r]);
const TOO_BIG = 'That is over 4 GB, which is more than one zip can hold. Leave the videos out and try again.';
const BAD_EXPORT = "I couldn't make that zip.";

const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const isFile = (f: string) => {
  try {
    return fs.statSync(f).isFile();
  } catch {
    return false;
  }
};
const clean = (s: unknown) => (text(s) || 'Fenmyr').replace(/[/\0]/g, '-');

async function writeZip(file: string, json: [name: string, data: () => Uint8Array][], media: string[]) {
  const out = await fs.promises.open(file, 'w');
  const queue: Uint8Array[] = [];
  let failed: Error | null = null,
    written = 0;
  const zip = new Zip((err, chunk) => {
    if (err) failed = err;
    else queue.push(chunk);
  });
  // what the zip has made is written before it is asked for more, so a big video waits on the disk, not in memory
  const drain = async () => {
    for (const chunk of queue.splice(0)) {
      written += chunk.length;
      if (written > ZIP_LIMIT) throw new Error(TOO_BIG);
      await out.write(chunk);
    }
    if (failed) throw failed;
  };
  try {
    for (const [name, data] of json) {
      const entry = new ZipDeflate(name, { level: 6 }),
        bytes = data();
      zip.add(entry);
      for (let at = 0; at < bytes.length; at += 1 << 20) {
        entry.push(bytes.subarray(at, at + (1 << 20)), at + (1 << 20) >= bytes.length);
        await drain();
      }
      if (!bytes.length) entry.push(bytes, true);
      await drain();
    }
    // videos are already compressed, so they are stored
    for (const name of media) {
      const entry = new ZipPassThrough(`media/${name}`);
      zip.add(entry);
      for await (const chunk of fs.createReadStream(path.join(P.mediaDir, name), { highWaterMark: 1 << 20 })) {
        entry.push(chunk, false);
        await drain();
      }
      entry.push(new Uint8Array(0), true);
      await drain();
    }
    zip.end();
    await drain();
    await out.close();
  } catch (e) {
    await out.close().catch(() => {});
    fs.rmSync(file, { force: true });
    throw e;
  }
}

// null when they change their mind
export async function zipExport(win: BrowserWindow, a: Untrusted<Ops['zipExport']['args']>) {
  const read = readManifest(a.manifest);
  if (!read.ok) throw new Error(BAD_EXPORT);
  const boards = new Map<string, Record<string, unknown>>();
  for (const b of list(a.boards)) if (isRecord(b) && typeof b.id === 'string') boards.set(b.id, b);
  const manifest = read.value;
  if (boards.size !== manifest.boards.length || manifest.boards.some(id => !boards.has(id)))
    throw new Error(BAD_EXPORT);
  // a video that is gone from this computer is left out, and the zip says so
  const media = [...new Set(manifest.media)].filter(n => isFile(path.join(P.mediaDir, n)));
  const made: Manifest = {
    ...manifest,
    media,
    left: { ...manifest.left, videos: manifest.left.videos + manifest.media.length - media.length },
  };
  const size = media.reduce((n, m) => n + fs.statSync(path.join(P.mediaDir, m)).size, 0);
  if (size > ZIP_LIMIT) throw new Error(TOO_BIG);
  const file = await pickSavePath(win, `${clean(a.name)}.fenmyr.zip`, 'zip');
  if (!file) return null;
  // one board at a time, so none of them waits in memory beside the others
  const json: [string, () => Uint8Array][] = [['fenmyr.json', () => jsonBytes(made)]];
  for (const id of made.boards) json.push([`boards/${id}.json`, () => Buffer.from(jsonSafe(boards.get(id)))]);
  await writeZip(file, json, media);
  return file;
}

type Entry = { name: string; flags: number; method: number; crc: number; csize: number; usize: number; offset: number };
type Handle = fs.promises.FileHandle;

async function readAt(fh: Handle, at: number, length: number) {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await fh.read(buf, 0, length, at);
  if (bytesRead !== length) throw refuse('notZip');
  return buf;
}

// the index at the end of the zip: every name, size and place, before any file is read
async function directory(fh: Handle, size: number): Promise<Entry[]> {
  const room = Math.min(size, 22 + 0xffff),
    tail = await readAt(fh, size - room, room),
    end = tail.lastIndexOf(END);
  if (end < 0 || end + 22 > tail.length) throw refuse('notZip');
  const count = tail.readUInt16LE(end + 10),
    length = tail.readUInt32LE(end + 12),
    at = tail.readUInt32LE(end + 16);
  // a zip64 index is for what this can't hold anyway
  if (count === 0xffff || length === NOT_32 || at === NOT_32 || at + length > size || length > 64 * 2 ** 20)
    throw refuse('notZip');
  const index = await readAt(fh, at, length),
    entries: Entry[] = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > index.length || index.readUInt32LE(p) !== CENTRAL) throw refuse('notZip');
    const n = index.readUInt16LE(p + 28),
      next = p + 46 + n + index.readUInt16LE(p + 30) + index.readUInt16LE(p + 32);
    if (next > index.length) throw refuse('notZip');
    const flags = index.readUInt16LE(p + 8),
      e: Entry = {
        name: index.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + n),
        flags,
        method: index.readUInt16LE(p + 10),
        crc: index.readUInt32LE(p + 16),
        csize: index.readUInt32LE(p + 20),
        usize: index.readUInt32LE(p + 24),
        offset: index.readUInt32LE(p + 42),
      };
    if ([e.csize, e.usize, e.offset].includes(NOT_32)) throw refuse('notZip');
    entries.push(e);
    p = next;
  }
  return entries;
}

// A file's bytes, checked against the index as they pass: its size, and its CRC. A zip that lies about either, or that
// inflates past what it said, stops here.
async function* contents(fh: Handle, e: Entry, size: number): AsyncGenerator<Uint8Array> {
  if (e.flags & 1 || (e.method !== 0 && e.method !== 8)) throw refuse('notZip');
  const local = await readAt(fh, e.offset, 30);
  if (local.readUInt32LE(0) !== LOCAL) throw refuse('notZip');
  const start = e.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
  if (start + e.csize > size) throw refuse('notZip');
  const ready: Uint8Array[] = [],
    inflate = e.method === 8 ? new Inflate(chunk => ready.push(chunk)) : null,
    // small steps for what inflates, so a bomb is caught before it is big
    step = inflate ? 1 << 16 : 1 << 20;
  let crc = 0,
    seen = 0;
  for (let at = 0; at < e.csize || (at === 0 && inflate); at += step) {
    const piece = await readAt(fh, start + at, Math.min(step, e.csize - at)),
      last = at + step >= e.csize;
    if (inflate) {
      try {
        inflate.push(piece, last);
      } catch {
        throw refuse('notZip');
      }
    } else ready.push(piece);
    for (const chunk of ready.splice(0)) {
      seen += chunk.length;
      if (seen > e.usize) throw refuse('notZip');
      crc = zlib.crc32(chunk, crc);
      yield chunk;
    }
    if (last) break;
  }
  if (seen !== e.usize || crc !== e.crc) throw refuse('notZip');
}

// the manifest and the board files, whole: they are the only things read before the checks are done
async function readJson(fh: Handle, entries: Entry[], size: number) {
  const json: Record<string, Uint8Array> = {};
  let room = JSON_TOTAL;
  for (const e of entries.filter(x => isJson(x.name))) {
    room -= e.usize;
    if (e.usize > JSON_LIMIT || room < 0) throw refuse('notZip');
    const parts: Uint8Array[] = [];
    for await (const chunk of contents(fh, e, size)) parts.push(chunk);
    json[e.name] = Buffer.concat(parts);
  }
  return json;
}

// Each listed video, under a new name, as a video made here would be named: so that coming in twice makes two, and a
// video of the same name already here is never replaced. Whatever was made is taken back if any of it fails.
async function copyMedia(fh: Handle, entries: Entry[], listed: string[], size: number) {
  const have = new Map(
      entries.flatMap(e => {
        const name = mediaNameOf(e.name);
        return name ? [[name, e] as const] : [];
      }),
    ),
    copies = new Map<string, string>(),
    made: string[] = [];
  try {
    for (const old of new Set(listed)) {
      const e = have.get(old);
      if (!e) continue;
      const name = storage.mediaBegin(path.extname(old).slice(1));
      made.push(name);
      const out = await fs.promises.open(path.join(P.mediaDir, name), 'w');
      try {
        for await (const chunk of contents(fh, e, size)) await out.write(chunk);
      } finally {
        await out.close();
      }
      copies.set(old, storage.mediaEnd(name));
    }
  } catch (err) {
    for (const name of made) fs.rmSync(path.join(P.mediaDir, name), { force: true });
    throw err;
  }
  return copies;
}

async function chooseZip(win: BrowserWindow) {
  const r = await dialog.showOpenDialog(win, {
    title: 'Open a Fenmyr zip',
    properties: ['openFile'],
    filters: [{ name: 'Zip', extensions: ['zip'] }],
  });
  return r.canceled ? '' : (r.filePaths[0] ?? '');
}

// null when they change their mind. Nothing is made until every check has passed.
export async function zipImport(
  win: BrowserWindow,
  a: Untrusted<Ops['zipImport']['args']>,
): Promise<ImportResult | null> {
  const file = text(a.path) || (await chooseZip(win));
  if (!file) return null;
  if (!path.isAbsolute(file)) throw refuse('notZip');
  const fh = await fs.promises.open(file, 'r').catch(() => {
    throw refuse('notZip');
  });
  try {
    const info = await fh.stat();
    if (!info.isFile()) throw refuse('notZip');
    const size = info.size;
    if (size > ZIP_LIMIT) throw refuse('tooBig');
    const entries = await directory(fh, size),
      names = entries.map(e => e.name),
      unsafe = nameRefusal(names);
    if (unsafe) throw refuse(unsafe);
    const read = parseExport(names, await readJson(fh, entries, size));
    if (!read.ok) throw refuse(read.refusal);
    const { manifest, boards, skipped } = read.value;
    // each video may say it holds up to 4 GB, so the sum is held to what a zip can hold before any is copied
    const listed = new Set(manifest.media);
    if (entries.reduce((n, e) => n + (listed.has(mediaNameOf(e.name) ?? '') ? e.usize : 0), 0) > ZIP_LIMIT)
      throw refuse('tooBig');
    const linked = relinkMedia(boards, await copyMedia(fh, entries, manifest.media, size));
    return { manifest, boards: linked.boards, skipped, missing: linked.missing };
  } finally {
    await fh.close();
  }
}
