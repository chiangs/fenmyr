import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Board, BoardSummary, Template } from '../shared/ops.ts';
import P from './paths.ts';
import { isRecord, jsonSafe, readJSON, writeAtomic } from './util.ts';

const safe = (v: unknown) => String(v ?? 'x').replace(/[^\p{L}\p{N}-]/gu, '');
const stringOr = <T>(v: unknown, otherwise: T) => (typeof v === 'string' ? v : otherwise);
const isBoard = (j: unknown): j is Board => isRecord(j) && typeof j.id === 'string';
const isTemplate = (t: unknown): t is Template =>
  isRecord(t) && typeof t.id === 'string' && t.id !== '' && Array.isArray(t.cards);
const jsonFiles = (dir: string) => fs.readdirSync(dir).filter(f => f.endsWith('.json'));

// boards with pictures can be many MB, so each board's summary is kept until its file changes (same size and time = same board)
const summaries = new Map<string, { mtimeMs: number; size: number; row: BoardSummary }>();
export function list(): BoardSummary[] {
  let files: string[] = [];
  try {
    files = jsonFiles(P.boardsDir);
  } catch {}
  for (const f of summaries.keys()) if (!files.includes(f)) summaries.delete(f);
  return files
    .map(f => {
      const full = path.join(P.boardsDir, f);
      let st: fs.Stats;
      try {
        st = fs.statSync(full);
      } catch {
        return null;
      }
      const known = summaries.get(f);
      if (known && known.mtimeMs === st.mtimeMs && known.size === st.size) return known.row;
      const j = readJSON(full);
      if (!isRecord(j)) return null;
      const row: BoardSummary = {
        id: stringOr(j.id, ''),
        name: stringOr(j.name, 'Untitled'),
        color: stringOr(j.color, 'pink'),
        folder: stringOr(j.folder, null),
        parent: stringOr(j.parent, null),
        updated: st.mtimeMs / 1000,
      };
      summaries.set(f, { mtimeMs: st.mtimeMs, size: st.size, row });
      return row;
    })
    .filter(row => row !== null)
    .sort((a, b) => b.updated - a.updated);
}
export function load(id: string): Board | null {
  const j = readJSON(path.join(P.boardsDir, `${safe(id)}.json`));
  return isBoard(j) ? j : null;
}
export function save(board: unknown): true {
  if (!isRecord(board)) throw new Error('bad board');
  writeAtomic(path.join(P.boardsDir, `${safe(board.id)}.json`), jsonSafe(board));
  return true;
}
export function remove(id: string): true {
  fs.rmSync(path.join(P.boardsDir, `${safe(id)}.json`), { force: true });
  return true;
}
export function templates(): Template[] {
  let files: string[] = [];
  try {
    files = jsonFiles(P.templatesDir);
  } catch {}
  const made = (t: Template) => Number(t.made) || 0;
  return files
    .map(f => readJSON(path.join(P.templatesDir, f)))
    .filter(isTemplate)
    .sort((a, b) => made(a) - made(b));
}
export function saveTemplate(t: unknown): true {
  if (!isRecord(t) || !t.id) throw new Error('bad template');
  writeAtomic(path.join(P.templatesDir, `${safe(t.id)}.json`), jsonSafe(t));
  return true;
}
export function removeTemplate(id: string): true {
  fs.rmSync(path.join(P.templatesDir, `${safe(id)}.json`), { force: true });
  return true;
}
export const folders = (): unknown => readJSON(P.foldersFile) ?? [];
export function saveFolders(f: unknown): true {
  writeAtomic(P.foldersFile, jsonSafe(f ?? []));
  return true;
}

// a board added from outside (Claude Code, a copied file) shows up without a restart
export function watchBoards(onChange: () => void) {
  const names = () => {
    try {
      return jsonFiles(P.boardsDir).sort().join('\n');
    } catch {
      return '';
    }
  };
  let known = names(),
    tick: NodeJS.Timeout | undefined;
  try {
    fs.watch(P.boardsDir, () => {
      clearTimeout(tick);
      // our own saves rewrite files too, so only speak up when boards come or go
      tick = setTimeout(() => {
        const now = names();
        if (now !== known) {
          known = now;
          onChange();
        }
      }, 500);
    });
  } catch {}
}

// videos arrive in chunks and are served back through fenmyrmedia://, so big files never pass through JSON again
export function mediaBegin(ext: string): string {
  const clean = (ext || 'mp4').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 5) || 'mp4';
  const name = `${crypto.randomUUID()}.${clean}`;
  fs.writeFileSync(path.join(P.mediaDir, name), '');
  return name;
}
export function mediaChunk(name: string, data: string): true {
  const file = name.replace(/\//g, '');
  if (!file || !data) throw new Error("Couldn't save that video.");
  fs.appendFileSync(path.join(P.mediaDir, file), Buffer.from(data, 'base64'));
  return true;
}
export const mediaEnd = (name: string) => `fenmyrmedia://media/${name.replace(/\//g, '')}`;

const MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  jpg: 'image/jpeg',
  png: 'image/png',
};
// byte ranges, so videos can seek
export function serveMedia(req: Request): Response {
  const name = decodeURIComponent(new URL(req.url).pathname.split('/').pop() || ''),
    f = path.join(P.mediaDir, name);
  let size = 0;
  try {
    size = fs.statSync(f).size;
  } catch {}
  if (!name || name.includes('..') || !size) return new Response('not found', { status: 404 });
  let start = 0,
    end = size - 1,
    partial = false;
  const r = req.headers.get('range');
  if (r?.startsWith('bytes=')) {
    const [a = '', b = ''] = r.slice(6).split('-', 2);
    partial = true;
    if (!a && b)
      start = Math.max(0, size - (Number(b) || 0)); // "bytes=-500": the last 500
    else {
      start = Number(a) || 0;
      if (b) end = Math.min(Number(b), size - 1);
    }
  }
  if (start > end) return new Response('', { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  const head: Record<string, string> = {
    'Content-Type': MIME[path.extname(name).slice(1).toLowerCase()] || 'application/octet-stream',
    'Content-Length': String(end - start + 1),
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
  };
  if (partial) head['Content-Range'] = `bytes ${start}-${end}/${size}`;
  const file = fs.createReadStream(f, { start, end });
  const chunks = file[Symbol.asyncIterator]();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await chunks.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel() {
      file.destroy();
    },
  });
  return new Response(body, {
    status: partial ? 206 : 200,
    headers: head,
  });
}
// kept a couple of days after no board points to them, so undo still has them for a while
export function sweepMedia() {
  let files: string[] = [];
  try {
    files = fs.readdirSync(P.mediaDir);
  } catch {
    return;
  }
  if (!files.length) return;
  let used = '';
  try {
    for (const b of jsonFiles(P.boardsDir)) used += fs.readFileSync(path.join(P.boardsDir, b), 'utf8');
  } catch {}
  const old = Date.now() - 2 * 86400 * 1000;
  for (const f of files)
    if (!used.includes(f)) {
      try {
        const full = path.join(P.mediaDir, f);
        if (fs.statSync(full).mtimeMs < old) fs.rmSync(full);
      } catch {}
    }
}
