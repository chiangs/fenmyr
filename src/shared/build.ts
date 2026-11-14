import { isRecord } from './model.ts';
import { readSources, type Sources } from './repos.ts';

/** A file a build changed, counted by git against the snapshot taken before it. path: inside the prototype's folder. */
export type FileDiff =
  | { kind: 'text'; path: string; added: number; removed: number }
  | { kind: 'binary'; path: string };

/** The host's protoBuild events, in order: start once the folder is saved, one edit per file tool call (a file can
 *  repeat), then done or error. */
export type BuildEvent =
  | { id: string; type: 'start'; snapshot: string }
  | { id: string; type: 'edit'; file: string }
  | {
      id: string;
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
  | { id: string; type: 'error'; text: string; snapshot: string | null; files: FileDiff[] };

const MAX_FILES = 200;
const MAX_NEXT = 3;
const NEXT_LENGTH = 80;

type Fields = Record<string, unknown>;
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
      ? { id, type: 'error', text: x.text, snapshot: snapshotOf(x.snapshot), files: filesOf(x.files) }
      : null,
};

const isType = (t: unknown): t is BuildEvent['type'] => typeof t === 'string' && Object.hasOwn(READ, t);

/** The renderer's one parse of a protoBuild event, where it enters. Null for anything malformed. */
export function readBuildEvent(x: unknown): BuildEvent | null {
  if (!isRecord(x) || typeof x.id !== 'string' || !isType(x.type)) return null;
  return READ[x.type](x, x.id);
}
