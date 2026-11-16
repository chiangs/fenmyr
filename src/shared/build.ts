import { isRecord } from './model.ts';
import { readSources, type Sources } from './repos.ts';

/** A file a build changed, counted by git against the snapshot taken before it. path: inside the prototype's folder. */
export type FileDiff =
  | { kind: 'text'; path: string; added: number; removed: number }
  | { kind: 'binary'; path: string };

/** The host's protoBuild events, in order: start once the folder is saved, one edit per file tool call (a file can
 *  repeat), then done or error. The end repeats the renderer's names for the build and its board, so it lands in a
 *  window that didn't start it, such as one reloaded while it ran. */
export type BuildEvent =
  | { id: string; type: 'start'; snapshot: string }
  | { id: string; type: 'edit'; file: string }
  | {
      id: string;
      build: string;
      board: string;
      type: 'done';
      text: string;
      snapshot: string;
      files: FileDiff[];
      // paths beyond the prototype's folder that the build changed
      outside: string[];
      // which cards each file it wrote came from
      sources: Sources;
      next: string[];
    }
  // snapshot: null when the build failed before the folder was saved, and then files is empty
  | {
      id: string;
      build: string;
      board: string;
      type: 'error';
      text: string;
      snapshot: string | null;
      files: FileDiff[];
    };

const MAX_FILES = 200;
const MAX_NEXT = 3;
const NEXT_LENGTH = 80;

type Fields = Record<string, unknown>;
const textOf = (x: unknown) => (typeof x === 'string' ? x : '');
const snapshotOf = (x: unknown) => (typeof x === 'string' && /^[0-9a-f]{40,64}$/.test(x) ? x : null);
const isCount = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;
const isInside = (p: unknown): p is string =>
  typeof p === 'string' && p !== '' && p.length < 300 && !p.startsWith('/') && !p.split('/').includes('..');

function readFile(x: unknown): FileDiff | null {
  if (!isRecord(x) || !isInside(x.path)) return null;
  if (x.kind === 'binary') return { kind: 'binary', path: x.path };
  return x.kind === 'text' && isCount(x.added) && isCount(x.removed)
    ? { kind: 'text', path: x.path, added: x.added, removed: x.removed }
    : null;
}

// a bad entry drops alone, so one odd file doesn't cost the build its others
const filesOf = (x: unknown) => (Array.isArray(x) ? x : []).flatMap(f => readFile(f) ?? []).slice(0, MAX_FILES);
const textsOf = (x: unknown) => (Array.isArray(x) ? x : []).filter((s): s is string => typeof s === 'string');
const nextOf = (x: unknown) =>
  textsOf(x)
    .map(s => s.trim())
    .filter(s => s && s.length <= NEXT_LENGTH)
    .slice(0, MAX_NEXT);

// One reader per type. The mapped type makes a type without a reader fail the type check.
const READ: { [K in BuildEvent['type']]: (x: Fields, id: string) => Extract<BuildEvent, { type: K }> | null } = {
  start: (x, id) => {
    const snapshot = snapshotOf(x.snapshot);
    return snapshot ? { id, type: 'start', snapshot } : null;
  },
  edit: (x, id) => (typeof x.file === 'string' ? { id, type: 'edit', file: x.file } : null),
  done: (x, id) => {
    const snapshot = snapshotOf(x.snapshot);
    if (typeof x.text !== 'string' || !snapshot) return null;
    return {
      id,
      build: textOf(x.build),
      board: textOf(x.board),
      type: 'done',
      text: x.text,
      snapshot,
      files: filesOf(x.files),
      outside: textsOf(x.outside),
      sources: readSources(x.sources),
      next: nextOf(x.next),
    };
  },
  // a failure always lands, so a bad snapshot or file list only loses Undo
  error: (x, id) =>
    typeof x.text === 'string'
      ? {
          id,
          build: textOf(x.build),
          board: textOf(x.board),
          type: 'error',
          text: x.text,
          snapshot: snapshotOf(x.snapshot),
          files: filesOf(x.files),
        }
      : null,
};

const isType = (t: unknown): t is BuildEvent['type'] => typeof t === 'string' && Object.hasOwn(READ, t);

/** The renderer's one parse of a protoBuild event, where it enters. Null for anything malformed. */
export function readBuildEvent(x: unknown): BuildEvent | null {
  if (!isRecord(x) || typeof x.id !== 'string' || !isType(x.type)) return null;
  return READ[x.type](x, x.id);
}

/** What the preview did once a build landed. ran: it bundled, and logged `count` errors by 3 s after its frame loaded,
 *  the first of which are kept. unbuilt: the bundler refused the code. */
export type PreviewCheck = { kind: 'ran'; count: number; errors: string[] } | { kind: 'unbuilt'; error: string };

/** How a build ended. from: the cards its code came from that were still on the board when it landed. check: what its
 *  preview did, once checked. */
type BuildEnd =
  | { kind: 'built'; at: number; files: FileDiff[]; outside: string[]; from: string[]; check?: PreviewCheck }
  | { kind: 'failed'; at: number; files: FileDiff[] };

/** One build, as its prototype's chat keeps it, on the message that shows its block. It is written when the build is
 *  asked for. start: when the host had saved the folder (renderer clock) and the snapshot it took, written together.
 *  end: how it ended. Neither says "running": that lives only in memory, so a start with no end that isn't running
 *  here was cut off by Fenmyr closing. */
export type BuildRecord = {
  kind: 'build';
  board: string;
  build: string;
  // its first 200 characters
  request: string;
  // how many cards the builder read
  cards: number;
  start?: { at: number; snapshot: string };
  end?: BuildEnd;
  undone?: true;
};

const MAX_REQUEST = 200;
const MAX_FROM = 80;
const MAX_ERRORS = 3;
const ERROR_LENGTH = 200;
const isTime = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;

/** A check of a preview that ran, from the errors it logged, oldest first. The record keeps the first few, each cut
 *  short, and how many there were. */
export function ranCheck(errors: readonly string[], count = errors.length): PreviewCheck {
  const kept = errors.slice(0, MAX_ERRORS).map(e => e.slice(0, ERROR_LENGTH));
  return { kind: 'ran', count: Math.max(count, kept.length), errors: kept };
}

export const unbuiltCheck = (error: string): PreviewCheck => ({ kind: 'unbuilt', error: error.slice(0, ERROR_LENGTH) });

function readCheck(x: unknown): PreviewCheck | null {
  if (!isRecord(x)) return null;
  if (x.kind === 'unbuilt') return typeof x.error === 'string' ? unbuiltCheck(x.error) : null;
  if (x.kind !== 'ran') return null;
  const errors = textsOf(x.errors);
  return ranCheck(errors, isCount(x.count) ? x.count : errors.length);
}

function readEnd(x: unknown): BuildEnd | null {
  if (!isRecord(x) || !isTime(x.at)) return null;
  const files = filesOf(x.files);
  if (x.kind === 'failed') return { kind: 'failed', at: x.at, files };
  if (x.kind !== 'built') return null;
  const check = readCheck(x.check);
  return {
    kind: 'built',
    at: x.at,
    files,
    outside: textsOf(x.outside).slice(0, MAX_FILES),
    from: textsOf(x.from).slice(0, MAX_FROM),
    ...(check ? { check } : {}),
  };
}

/** A build record from a board file: null without its board or build. A bad start or end drops alone. */
export function readBuildRecord(x: Fields): BuildRecord | null {
  if (typeof x.board !== 'string' || typeof x.build !== 'string') return null;
  const start = isRecord(x.start) ? x.start : {},
    snapshot = snapshotOf(start.snapshot),
    end = readEnd(x.end);
  return {
    kind: 'build',
    board: x.board,
    build: x.build,
    request: typeof x.request === 'string' ? x.request.slice(0, MAX_REQUEST) : '',
    cards: isCount(x.cards) ? x.cards : 0,
    ...(snapshot && isTime(start.at) ? { start: { at: start.at, snapshot } } : {}),
    ...(end ? { end } : {}),
    ...(x.undone === true ? { undone: true } : {}),
  };
}

/** A build in this session: waiting its turn behind a build or, first in line with none running, behind the preview
 *  check of the one that landed, then starting until the host has saved the folder, then writing, with the files its
 *  edits have named so far, first seen first. */
export type BuildLive =
  | { phase: 'queued'; behind: 'build' | 'check' }
  | { phase: 'starting' }
  | { phase: 'writing'; files: readonly string[] };

/** How a build reads now, from its record and, while it runs in this session, how far it has got. ms: how long it ran,
 *  by the renderer's clock. */
export type BuildState =
  | BuildLive
  | { phase: 'built'; ms: number; end: Extract<BuildEnd, { kind: 'built' }> }
  | { phase: 'failed'; ms: number; files: FileDiff[] }
  // it failed before the folder was saved, so it changed nothing
  | { phase: 'early' }
  // it started, never ended and doesn't run here: Fenmyr closed before it finished
  | { phase: 'stopped' }
  // it never got as far as the folder being saved
  | { phase: 'unstarted' };

export function buildState(a: BuildRecord, live: BuildLive | null): BuildState {
  const { start, end } = a;
  if (live && !end) return live;
  if (end?.kind === 'built') return { phase: 'built', ms: end.at - (start?.at ?? end.at), end };
  if (end) return start ? { phase: 'failed', ms: end.at - start.at, files: end.files } : { phase: 'early' };
  return start ? { phase: 'stopped' } : { phase: 'unstarted' };
}

/** "48 s" under a minute, "2 min 5 s" after, and never less than a second. */
function took(ms: number) {
  const s = Math.max(1, Math.round(ms / 1000)),
    rest = s % 60;
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${rest ? ` ${rest} s` : ''}`;
}

/** The block's head. undone: Undo this build put the folder back, which a build that changed files can have had. */
export function buildHead(s: BuildState, undone: boolean): string {
  const mark = undone ? ' · undone' : '';
  switch (s.phase) {
    case 'queued':
      return s.behind === 'check' ? 'Waiting for the preview check' : 'Waiting for the build before it';
    case 'starting':
      return 'Starting…';
    case 'writing':
      return 'Building…';
    case 'built':
      return `Built in ${took(s.ms)}${mark}`;
    case 'failed':
      return `Stopped after ${took(s.ms)}${mark}`;
    case 'early':
      return 'Couldn’t start';
    case 'stopped':
      return `Stopped · Fenmyr closed before it finished${mark}`;
    case 'unstarted':
      return 'Not started';
    default: {
      const never: never = s;
      throw new Error(`unknown build state ${String(never)}`);
    }
  }
}

// how much of an error the block's line shows
const LINE_ERROR = 120;
const cut = (s: string) => {
  const first = s.split('\n')[0] ?? '',
    chars = Array.from(first),
    kept = chars.slice(0, LINE_ERROR - 1).join('');
  return chars.length > LINE_ERROR ? `${kept.trimEnd()}…` : first;
};

/** A check in one line: "Preview runs · no errors", "Preview runs · 2 errors: TypeError: …" or "The preview couldn't be
 *  built: …", the error on its first line and cut short. */
export function checkLine(c: PreviewCheck) {
  if (c.kind === 'unbuilt') return `The preview couldn’t be built: ${cut(c.error)}`;
  if (!c.count) return 'Preview runs · no errors';
  const n = `${c.count} ${c.count === 1 ? 'error' : 'errors'}`,
    first = cut(c.errors[0] ?? '');
  return first ? `Preview runs · ${n}: ${first}` : `Preview runs · ${n}`;
}

/** The errors a check kept, one per line, as the builder is sent the preview's errors. */
export const checkErrors = (c: PreviewCheck) => (c.kind === 'unbuilt' ? c.error : c.errors.join('\n'));

/** The check found something to fix: errors as it ran, or code that couldn't be bundled. */
export const checkFailed = (c: PreviewCheck) => c.kind === 'unbuilt' || c.count > 0;

/** "src/App.tsx +3 −1", or the path alone for a binary file. */
const fileLine = (f: FileDiff) => (f.kind === 'text' ? `${f.path} +${f.added} −${f.removed}` : f.path);

/** The files a state names: as edits named them while it writes, with their counts once it has ended. */
export function fileLines(s: BuildState): string[] {
  if (s.phase === 'writing') return [...s.files];
  if (s.phase === 'built') return s.end.files.map(fileLine);
  return s.phase === 'failed' ? s.files.map(fileLine) : [];
}

// the files a block's line names before it says how many more, since it goes into every prompt the chat is in
const LINE_FILES = 10;

/** A block in one line, for Myra's snapshot of the chat, whose block has no words of its own: "Built in 48 s:
 *  src/App.tsx +3 −1, src/Form.tsx +24 −0", and after ten files "and 40 more", then how its preview check went. */
export function buildLine(a: BuildRecord, live: BuildLive | null) {
  const s = buildState(a, live),
    head = buildHead(s, !!a.undone),
    files = fileLines(s),
    more = files.length - LINE_FILES,
    named = more > 0 ? [...files.slice(0, LINE_FILES), `and ${more} more`] : files,
    line = named.length ? `${head}: ${named.join(', ')}` : head,
    check = s.phase === 'built' && s.end.check ? checkLine(s.end.check) : '';
  return check ? `${line}. ${check}` : line;
}
