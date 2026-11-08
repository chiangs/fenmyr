import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  FILE_KINDS,
  type FileKind,
  kindOf,
  MAX_FILES,
  NOT_SENT,
  tooBig,
  tooMany,
  wrongKind,
} from '../shared/askFiles.ts';
import { isRecord, text } from './util.ts';

// The files a person added to one message, checked by their bytes and written where only that request's Claude Code
// can read them. Every request runs in the same folder, so Claude Code keeps one project for Myra rather than one per
// question.
export const ASK_ROOT = path.join(os.tmpdir(), `fenmyr-ask-${os.userInfo().uid}`);

type Added = { name: string; kind: FileKind; ext: string; bytes: Buffer };
export type Written = { dir: string; files: { path: string; name: string; kind: FileKind }[] };

const PICTURES: { ext: string; is: (b: Buffer) => boolean }[] = [
  { ext: 'png', is: b => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) },
  { ext: 'jpg', is: b => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) },
  { ext: 'gif', is: b => b.subarray(0, 4).toString('latin1') === 'GIF8' },
  {
    ext: 'webp',
    is: b => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];
const utf8 = new TextDecoder('utf-8', { fatal: true });
const isText = (b: Buffer) => {
  try {
    return !utf8.decode(b).includes('\0');
  } catch {
    return false;
  }
};
const DATA_URL = /^data:[^,]*;base64,([A-Za-z0-9+/=]*)$/;

const refuse = (why: string) => new Error(`${NOT_SENT} ${why}`);

function parseOne(f: unknown): Added {
  const name = path.basename(text(isRecord(f) ? f.name : '')).slice(0, 120) || 'file',
    data = text(isRecord(f) ? f.data : ''),
    kind = kindOf(name);
  if (!kind) throw refuse(wrongKind(name));
  const max = FILE_KINDS[kind].maxBytes;
  // base64 is a third longer than the bytes it holds, so a far longer string is too big before it is decoded
  if (data.length > max * 1.4 + 200) throw refuse(tooBig(name, kind));
  const b64 = DATA_URL.exec(data)?.[1];
  if (b64 === undefined) throw refuse(`“${name}” couldn’t be read.`);
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length > max) throw refuse(tooBig(name, kind));
  if (kind === 'text') {
    if (!isText(bytes)) throw refuse(`“${name}” isn’t plain text.`);
    return { name, kind, ext: 'txt', bytes };
  }
  const ext = PICTURES.find(p => p.is(bytes))?.ext;
  if (!ext) throw refuse(`“${name}” isn’t a PNG, JPEG, WebP or GIF picture.`);
  return { name, kind, ext, bytes };
}

/** Reads the files from the renderer, or throws the reason one can't go, in words for the person. */
export function parseFiles(list: unknown): Added[] {
  const raw = Array.isArray(list) ? list : [];
  if (raw.length > MAX_FILES) throw refuse(tooMany);
  return raw.map(parseOne);
}

/** Writes the files into a folder of their own under ASK_ROOT, named by number so a name can't reach outside it. */
export function writeFiles(files: Added[]): Written {
  const dir = path.join(ASK_ROOT, randomUUID());
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return {
    dir,
    files: files.map((f, i) => {
      const file = path.join(dir, `${i + 1}.${f.ext}`);
      fs.writeFileSync(file, f.bytes, { mode: 0o600 });
      return { path: file, name: f.name, kind: f.kind };
    }),
  };
}
