import { type BuildRecord, buildHead, buildState, fileLines } from '../../shared/build.ts';
import { type ContextUse, leftWords, partWords, readList, shareWords } from '../../shared/contextFit.ts';
import { session } from '../core/state.ts';
import type { Button, Mark, Piece } from '../myra/acts.ts';
import { leftOutButton } from '../myra/leftOut.ts';
import { noteHeard } from '../myra/status.ts';
import { fixButton, stoppedUndo } from './buildButtons.ts';
import { checkShown } from './buildCheck.ts';
import { focusBlock } from './buildRecord.ts';
import { cancel, liveOf } from './buildSlot.ts';
import { sourceButton } from './sources.ts';

// A build's block in its prototype's chat, drawn from its record and, while it waits or runs here, how far it has got:
// the head, a moving bar while it runs, what the builder was given and how much of the model's context that took, a
// line for each thing left out to fit, a line per file, how its preview check went, and the cards its code came from.
const MAX_FROM = 4;

// a record from before builds kept what they were sent, or one that hasn't started, only knows how many cards it read
const cardsRead = (n: number) => (n ? `Read ${n} ${n === 1 ? 'card' : 'cards'}` : 'No cards to read');

function readWords(u: ContextUse) {
  const list = readList(u) || 'no cards';
  return `Read ${list} · ${shareWords(u)}`;
}

// what each part took, then the window it was against
function partsTip(u: ContextUse) {
  const window = u.window.toLocaleString('en-GB');
  return [...u.parts.map(partWords), `Of a ${window}-token context`].join('\n');
}

// A function declaration: VIEW in myra/acts.ts reads it while the modules of the import cycle load.
export function buildPieces(a: BuildRecord): Piece[] {
  return [...phasePieces(a), ...(a.start?.use ? leftOutButton(a.start.use, a.board) : [])];
}

function phasePieces(a: BuildRecord): Piece[] {
  const s = buildState(a, liveOf(a.build)),
    files = fileLines(s),
    use = a.start?.use,
    left = use ? leftWords(use) : [];
  // The first line is always there, so a block with no files yet still draws (a box with no lines draws nothing). The
  // lines of what was left out follow it, each marked, and a phase that marks nothing marks them and the first line.
  const bad = left.map((): Mark => 'bad');
  const box = (lines: readonly string[], marks?: readonly Mark[], busy?: true): Piece => ({
    slot: 'summary',
    cls: 'build',
    head: buildHead(s, !!a.undone),
    lines: [use ? readWords(use) : cardsRead(a.cards), ...left, ...lines],
    ...(marks || left.length ? { marks: ['done', ...bad, ...(marks ?? [])] } : {}),
    ...(use ? { tips: [partsTip(use)] } : {}),
    ...(busy ? { busy } : {}),
  });
  switch (s.phase) {
    case 'queued': {
      // nothing is stored for a cancel: a request that isn't waiting and never started reads not started
      const stop: Button = {
        label: 'Cancel',
        ghost: true,
        after: 'stay',
        // The chat draws the block again after the press, reading not started with no button, so focus stays on the
        // block, where Tab goes on to the next Cancel.
        run: () => {
          if (!cancel(a.build)) return;
          noteHeard(`${session.board?.name ?? 'This prototype'}’s build is cancelled`);
          focusBlock(a.build);
        },
      };
      return [box([a.request.split('\n')[0] ?? ''], ['wait']), { slot: 'other', button: stop }];
    }
    case 'starting':
      return [box([], [], true)];
    case 'writing':
      return [
        box(
          files,
          files.map((_, i) => (i === files.length - 1 ? 'now' : 'done')),
          true,
        ),
      ];
    case 'built': {
      const outside = s.end.outside.length
          ? [`Also changed outside this prototype: ${s.end.outside.join(', ')}. Undo this build won’t put that back.`]
          : [],
        check = checkShown(a),
        checks = check ? [check.line] : [],
        marks = [...files.map((): Mark => 'done'), ...outside.map((): Mark => 'bad'), ...(check ? [check.mark] : [])];
      // a click on a card mustn't take the record with it
      const links = s.end.from.slice(0, MAX_FROM).flatMap((id): Button[] => {
        const b = sourceButton(id);
        return b ? [{ ...b, after: 'stay' }] : [];
      });
      const made: Piece[] = links.length ? [{ slot: 'sources', head: 'Made from', links }] : [];
      // the record says when it no longer shows: a click mustn't take the record with it
      const fix = fixButton(a),
        fixing: Piece[] = fix ? [{ slot: 'other', button: { ...fix, after: 'stay' } }] : [];
      return [box([...files, ...outside, ...checks], marks), ...fixing, ...made];
    }
    case 'failed':
      return [box(files)];
    case 'early':
    case 'unstarted':
      return [box([])];
    case 'stopped': {
      const undo = stoppedUndo(a),
        button: Piece[] = undo ? [{ slot: 'other', button: { ...undo, after: 'stay' } }] : [];
      return [box([]), ...button];
    }
    default: {
      const never: never = s;
      throw new Error(`unknown build state ${String(never)}`);
    }
  }
}
