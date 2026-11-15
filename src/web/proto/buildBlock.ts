import { type BuildRecord, buildHead, buildState, fileLines } from '../../shared/build.ts';
import type { Button, Mark, Piece } from '../myra/acts.ts';
import { stoppedUndo } from './buildButtons.ts';
import { liveOf } from './buildSlot.ts';
import { sourceButton } from './sources.ts';

// A build's block in its prototype's chat, drawn from its record and, while it runs here, how far it has got: the head,
// a moving bar while it runs, how many cards it read, a line per file, and the cards its code came from.
const MAX_FROM = 4;

const cardsRead = (n: number) => (n ? `Read ${n} ${n === 1 ? 'card' : 'cards'}` : 'No cards to read');

// A function declaration: VIEW in myra/acts.ts reads it while the modules of the import cycle load.
export function buildPieces(a: BuildRecord): Piece[] {
  const s = buildState(a, liveOf(a.build)),
    files = fileLines(s);
  // the first line is always there, so a block with no files yet still draws (a box with no lines draws nothing)
  const box = (lines: readonly string[], marks?: readonly Mark[], busy?: true): Piece => ({
    slot: 'summary',
    cls: 'build',
    head: buildHead(s, !!a.undone),
    lines: [cardsRead(a.cards), ...lines],
    ...(marks ? { marks: ['done', ...marks] } : {}),
    ...(busy ? { busy } : {}),
  });
  switch (s.phase) {
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
        marks = [...files.map((): Mark => 'done'), ...outside.map((): Mark => 'bad')];
      // a click on a card mustn't take the record with it
      const links = s.end.from.slice(0, MAX_FROM).flatMap((id): Button[] => {
        const b = sourceButton(id);
        return b ? [{ ...b, after: 'stay' }] : [];
      });
      const made: Piece[] = links.length ? [{ slot: 'sources', head: 'Made from', links }] : [];
      return [box([...files, ...outside], marks), ...made];
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
